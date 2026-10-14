// Owned OpenCode execution. Only bounded, sanitized observations reach the studio.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");

const LINE_LIMIT = 1024 * 1024;
const OUTPUT_LIMIT = 16 * 1024 * 1024;
const TEXT_LIMIT = 64000;
const MESSAGES = {
  "invalid-input": "OpenCode delegation requires a valid prompt, agent, parent and existing absolute workspace.",
  "missing-cli": "OpenCode CLI is unavailable. Install OpenCode or configure OFFICECODE_OPENCODE_CLI.",
  "spawn-failed": "OpenCode could not start.",
  "invalid-protocol": "OpenCode returned an invalid JSON event stream.",
  "line-limit": "OpenCode exceeded the JSON event line limit.",
  "output-limit": "OpenCode exceeded the job output limit.",
  "permission-denied": "OpenCode permission was denied.",
  "permission-required": "OpenCode stopped while permission was required.",
  "invalid-agent": "OpenCode could not use the requested agent.",
  "process-error": "OpenCode reported an execution error.",
  "tool-error": "An OpenCode tool reported an error.",
  "nonzero-exit": "OpenCode exited unsuccessfully.",
  "incomplete": "OpenCode exited without a completed response.",
  "timeout": "OpenCode delegation exceeded its time limit.",
  "cancelled": "OpenCode delegation was cancelled.",
  "cleanup-failed": "OpenCode process cleanup could not be verified.",
  "observer-error": "OpenCode telemetry could not be delivered.",
};
const blocked = (error) => ({ outcome: "blocked", result: MESSAGES[error], error });
const validString = (value, limit) => typeof value === "string" && value.trim().length > 0
  && value.length <= limit && !/[\x00-\x1f\x7f]/.test(value);
const safeId = (value, fallback) => typeof value === "string" && /^[a-zA-Z0-9_.:-]{1,160}$/.test(value) ? value : fallback;

function validate(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)
    || typeof input.prompt !== "string" || !input.prompt.trim() || input.prompt.length > 16000 || input.prompt.includes("\0")
    || !validString(input.workspace, 4096) || !path.isAbsolute(input.workspace)
    || !validString(input.parentSessionId, 4096)
    || (input.agent !== undefined && !validString(input.agent, 48))
    || (input.role !== undefined && !validString(input.role, 48))
    || (input.jobId !== undefined && !/^[a-zA-Z0-9_-]{1,128}$/.test(input.jobId))) return null;
  try { if (!fs.statSync(input.workspace).isDirectory()) return null; } catch { return null; }
  return { ...input, workspace: path.resolve(input.workspace), agent: input.agent || "build",
    role: input.role || input.agent || "build", jobId: input.jobId || crypto.randomUUID() };
}

function executable() {
  if (process.env.OFFICECODE_OPENCODE_CLI) return process.env.OFFICECODE_OPENCODE_CLI;
  if (process.platform !== "win32") return "opencode";
  // npm's .cmd/.ps1 shims cannot run with shell:false; use their installed binary.
  for (const directory of (process.env.PATH || "").split(path.delimiter)) {
    for (const suffix of ["opencode.exe", "node_modules/@opencode/cli/bin/opencode.exe"])
      if (fs.existsSync(path.join(directory, suffix))) return path.join(directory, suffix);
  }
  return "opencode";
}

async function terminateTree(child) {
  if (!child.pid) return true;
  if (process.platform !== "win32") {
    try { process.kill(-child.pid, "SIGKILL"); return true; }
    catch (error) { return error.code === "ESRCH"; }
  }
  return new Promise((resolve) => {
    let killer;
    try { killer = spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], { shell: false, windowsHide: true, stdio: "ignore" }); }
    catch { resolve(false); return; }
    const timer = setTimeout(() => { killer.kill(); resolve(false); }, 4000);
    killer.once("error", () => { clearTimeout(timer); resolve(false); });
    killer.once("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(true);
      else {
        // taskkill can lose a race with natural exit; do not call that a failure.
        try { process.kill(child.pid, 0); resolve(false); }
        catch (error) { resolve(error.code === "ESRCH"); }
      }
    });
  });
}

function toolMetadata(part) {
  const name = typeof part.tool === "string" && /^[a-zA-Z0-9_.:-]{1,80}$/.test(part.tool) ? part.tool : "tool";
  const input = part.state?.input || {};
  const file = input.filePath ?? input.file_path ?? input.path;
  let target = "";
  if (typeof file === "string") {
    const basename = file.replace(/\\/g, "/").split("/").pop();
    if (basename && /^[a-zA-Z0-9_. -]{1,80}$/.test(basename)) target = basename;
  }
  const activity = /^(edit|write|apply_patch|patch)$/.test(name) ? "editing"
    : /^(grep|glob)$/.test(name) ? "code-search"
    : /^(webfetch|websearch)$/.test(name) ? "web-search"
    : /^(read|list)$/.test(name) ? "reading"
    : /^(bash|shell|terminal)$/.test(name) ? "terminal" : "working";
  const detail = activity === "editing" ? "Editing files" : activity === "reading" ? "Reading files"
    : activity === "terminal" ? "Running a command" : activity === "web-search" ? "Browsing the web"
    : activity === "code-search" ? "Searching code" : "Using a tool";
  return { id: safeId(part.callID || part.id, "observed-tool"), name, activity,
    detail: target ? `${detail}: ${target}` : detail };
}

async function runJob(rawInput, onEvent = () => {}, options = {}) {
  const input = validate(rawInput);
  if (!input) return blocked("invalid-input");
  const identity = { sessionId: `delegate:${input.jobId}`, parentSessionId: input.parentSessionId,
    runtime: "opencode", workspace: input.workspace, agent: input.agent, role: input.role, prompt: input.prompt };
  if (options.signal?.aborted) return blocked("cancelled");
  return new Promise((resolve) => {
    let child, actualSessionId, failure, finished = false, stopping = false, cleanup = Promise.resolve(true);
    let pending = Buffer.alloc(0), totalBytes = 0, completed = false, awaitingApproval = false, truncated = false;
    let timer, watchdog, closed = false;
    const tools = new Map();
    const textParts = new Map();
    let textLength = 0;
    const observe = (event) => {
      try { onEvent({ ...identity, ...event }); }
      catch { if (!failure) stop("observer-error"); }
    };
    const stop = (error) => {
      failure = error;
      if (stopping || closed || !child) return;
      stopping = true;
      cleanup = terminateTree(child);
      // Destroy inherited pipes after cleanup if a failed kill prevents close.
      watchdog = setTimeout(() => {
        child.stdin?.destroy(); child.stdout?.destroy(); child.stderr?.destroy();
        child.kill("SIGKILL"); finish(null);
      }, 5000);
    };
    const abort = () => stop("cancelled");
    async function finish(code) {
      if (finished) return;
      finished = true; closed = true;
      clearTimeout(timer); clearTimeout(watchdog);
      options.signal?.removeEventListener("abort", abort);
      if (!await cleanup) failure = "cleanup-failed";
      if (!stopping && pending.length) processLine(pending);
      if (!failure && code !== 0) failure = "nonzero-exit";
      if (!failure && awaitingApproval) failure = "permission-required";
      if (!failure && (!actualSessionId || !completed)) failure = "incomplete";
      const finalText = [...textParts.values()].join("");
      const result = { outcome: failure ? "blocked" : "done", result: finalText || (failure ? MESSAGES[failure] : ""),
        ...(failure ? { error: failure } : {}), ...(actualSessionId ? { sessionId: actualSessionId } : {}),
        ...(code !== null ? { exitCode: code } : {}), ...(truncated ? { truncated: true } : {}) };
      observe({ outcome: result.outcome, activeTools: [], activity: result.outcome,
        detail: failure ? MESSAGES[failure] : "Session complete" });
      resolve(result);
    }
    function processLine(bytes) {
      if (stopping) return;
      if (bytes.length > LINE_LIMIT) { stop("line-limit"); return; }
      if (!bytes.toString("utf8").trim()) return;
      let event;
      try { event = JSON.parse(bytes.toString("utf8")); } catch { stop("invalid-protocol"); return; }
      if (!event || typeof event !== "object" || Array.isArray(event) || typeof event.type !== "string") { stop("invalid-protocol"); return; }
      const properties = event.properties || {};
      const sid = event.sessionID || properties.sessionID || event.part?.sessionID;
      if (typeof sid === "string" && /^[a-zA-Z0-9_.:-]{1,160}$/.test(sid)) actualSessionId ||= sid;
      const part = event.part || properties.part || {};
      switch (event.type) {
        case "step_start": case "reasoning":
          observe({ state: "thinking", activeTools: [...tools.values()], activity: "thinking", detail: "Thinking" }); break;
        case "text": {
          if (typeof part.text !== "string") { stop("invalid-protocol"); break; }
          const id = safeId(part.id, `text-${textParts.size}`);
          const previous = textParts.get(id) || "";
          const available = TEXT_LIMIT - textLength + previous.length;
          let value = part.text.slice(0, available);
          if (value.length && /[\ud800-\udbff]/.test(value.at(-1))) value = value.slice(0, -1);
          truncated ||= part.text.length > value.length;
          textLength += value.length - previous.length; textParts.set(id, value); break;
        }
        case "tool_use": {
          if (!part.state || typeof part.state.status !== "string") { stop("invalid-protocol"); break; }
          const tool = toolMetadata(part);
          if (["pending", "running"].includes(part.state.status)) {
            tools.set(tool.id, tool);
            observe({ state: "acting", activity: tool.activity, detail: tool.detail, activeTools: [...tools.values()] });
          } else if (["completed", "error"].includes(part.state.status)) {
            tools.delete(tool.id);
            if (part.state.status === "error") failure ||= "tool-error";
            const duration = part.state.time?.end - part.state.time?.start;
            observe({ state: tools.size ? "acting" : "thinking", activity: tool.activity, detail: tool.detail,
              activeTools: [...tools.values()], toolResult: { ...tool, outcome: part.state.status === "error" ? "error" : "completed",
                ...(Number.isFinite(duration) && duration >= 0 ? { durationMs: duration } : {}) } });
          } else stop("invalid-protocol");
          break;
        }
        case "permission.asked": case "permission.updated": case "permission_asked":
          awaitingApproval = true;
          observe({ state: "waiting-approval", activity: "approval", detail: "Waiting for permission", activeTools: [...tools.values()] }); break;
        case "permission.replied": case "permission_replied":
          awaitingApproval = false;
          if (["reject", "deny", "denied"].includes(properties.reply || event.reply)) failure ||= "permission-denied";
          else observe({ state: "thinking", activity: "thinking", detail: "Thinking", activeTools: [...tools.values()] });
          break;
        case "step_finish":
          if (part.reason === "stop") completed = true;
          else if (["error", "length", "content-filter"].includes(part.reason)) failure ||= "process-error";
          break;
        case "error": case "session.error": {
          const error = event.error || properties.error || {};
          const diagnostic = `${error.name || ""} ${error.data?.message || error.message || ""}`;
          failure ||= /permission|denied|rejected/i.test(diagnostic) ? "permission-denied"
            : /agent.*(not\s*found|invalid|unknown)|unknown.*agent/i.test(diagnostic) ? "invalid-agent" : "process-error";
          break;
        }
        // Unknown well-formed events are ignored; arbitrary payloads stay private.
      }
    }
    try {
      child = spawn(options.executable || executable(), [...(options.prefixArgs || []), "run", "--format", "json", "--agent", input.agent], {
        cwd: input.workspace, shell: false, windowsHide: true, detached: process.platform !== "win32",
        stdio: ["pipe", "pipe", "pipe"], env: { ...process.env, OFFICECODE_MIRROR_DISABLED: "1" },
      });
    } catch (error) { resolve(blocked(error.code === "ENOENT" ? "missing-cli" : "spawn-failed")); return; }
    observe({ state: "thinking", activeTools: [], activity: "thinking", detail: "Starting OpenCode" });
    child.once("error", (error) => { failure ||= error.code === "ENOENT" ? "missing-cli" : "spawn-failed"; });
    child.once("close", (code) => { finish(code); });
    child.stdin.on("error", () => { /* EPIPE follows CLI exit; close determines the outcome. */ });
    child.stdout.on("data", (data) => {
      if (stopping || closed) return;
      totalBytes += data.length;
      if (totalBytes > OUTPUT_LIMIT) { stop("output-limit"); return; }
      pending = Buffer.concat([pending, data]);
      let newline;
      while (!stopping && (newline = pending.indexOf(10)) !== -1) {
        const line = pending.subarray(0, newline); pending = pending.subarray(newline + 1); processLine(line);
      }
      if (pending.length > LINE_LIMIT) stop("line-limit");
    });
    child.stderr.on("data", (data) => {
      // Never accumulate diagnostics; they can contain credentials and file content.
      totalBytes += data.length;
      if (!stopping && totalBytes > OUTPUT_LIMIT) stop("output-limit");
    });
    options.signal?.addEventListener("abort", abort, { once: true });
    if (options.signal?.aborted) abort();
    timer = setTimeout(() => stop("timeout"), Number.isFinite(options.timeoutMs) && options.timeoutMs > 0 ? options.timeoutMs : 600000);
    child.stdin.end(input.prompt);
  });
}

async function runCli(options = {}) {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  process.on("SIGINT", cancel); process.on("SIGTERM", cancel);
  process.stdout.on("error", cancel);
  const write = (value) => { if (!process.stdout.destroyed) process.stdout.write(JSON.stringify(value) + "\n"); };
  const parentValue = process.env.OFFICECODE_HERMES_PARENT_PID;
  const parentPid = typeof parentValue === "string" && /^[1-9]\d{0,9}$/.test(parentValue) ? Number(parentValue) : undefined;
  const checkParent = () => {
    if (!parentPid) return;
    try { process.kill(parentPid, 0); } catch (error) { if (error.code === "ESRCH") cancel(); }
  };
  const parentTimer = parentPid ? setInterval(checkParent, 500) : undefined;
  checkParent();
  await new Promise((resolve) => {
    let input = Buffer.alloc(0), started = false, settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      write({ kind: "result", result });
      clearInterval(parentTimer);
      process.stdin.off("data", data); process.stdin.off("end", end); process.stdin.off("error", cancel);
      process.stdin.destroy();
      process.off("SIGINT", cancel); process.off("SIGTERM", cancel);
      resolve();
    };
    const line = (bytes) => {
      if (settled) return;
      if (!started) {
        let job;
        try { job = JSON.parse(bytes.toString("utf8")); } catch { finish(blocked("invalid-input")); return; }
        started = true;
        runJob(job, event => write({ kind: "event", event }), { ...options, signal: controller.signal })
          .then(finish, () => finish(blocked("spawn-failed")));
      } else {
        try { if (JSON.parse(bytes.toString("utf8"))?.kind === "cancel") cancel(); }
        catch { cancel(); }
      }
    };
    const data = (chunk) => {
      if (settled) return;
      input = Buffer.concat([input, chunk]);
      let newline;
      while (!settled && (newline = input.indexOf(10)) !== -1) {
        const next = input.subarray(0, newline); input = input.subarray(newline + 1);
        if (next.length > LINE_LIMIT) { if (started) cancel(); else finish(blocked("invalid-input")); return; }
        line(next);
      }
      if (input.length > LINE_LIMIT) {
        input = Buffer.alloc(0);
        if (started) cancel(); else finish(blocked("invalid-input"));
      }
    };
    const end = () => {
      if (!started) line(input);
      else {
        if (input.length) line(input);
        if (parentPid) cancel();
      }
    };
    process.stdin.on("data", data); process.stdin.on("end", end); process.stdin.on("error", cancel);
  });
}

module.exports = { runJob, runCli };
if (require.main === module) runCli().catch(() => {
  process.stdout.write(JSON.stringify({ kind: "result", result: blocked("invalid-input") }) + "\n");
});
