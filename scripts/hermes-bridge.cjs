// A pipe owned by Hermes carries sanitized snapshots to a leased visual server.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const readline = require("node:readline");
const { spawn } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const workspace = path.resolve(process.env.OFFICECODE_STUDIO_WORKSPACE || process.env.OFFICECODE_HERMES_HOME || process.env.HERMES_HOME || path.join(os.homedir(), ".hermes"));
const key = crypto.createHash("sha256").update(process.platform === "win32" ? workspace.toLowerCase() : workspace).digest("hex").slice(0, 16);
const state = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), ".local", "share"), "OfficeCode", "projects", key);
const leaseId = crypto.randomBytes(16).toString("hex");
const active = new Map();
const known = new Set();
const pending = [];
const leasedUrls = new Set();
let leasePending = null;
let url = null, flushing = false, closed = false, lastAttempt = 0;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const sid = (id) => `hermes:${key}:${crypto.createHash("sha256").update(id).digest("hex").slice(0, 32)}`;

async function request(base, route, body, method = "POST") {
  try {
    const response = await fetch(base + route, { method: body ? method : "GET", redirect: "error",
      headers: body ? { "content-type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(1500) });
    if (route === "/api/mirror/finish" && response.status === 404) return { ok: true };
    return response.ok ? await response.json() : null;
  } catch { return null; }
}

function matches(info) {
  return info?.ok === true && info.service === "officecode" && info.workspace === workspace
    && info.mirrorOnly === true && info.leaseManaged === true;
}

async function connect() {
  if (url || closed || Date.now() - lastAttempt < 1000) return url;
  lastAttempt = Date.now();
  const entry = path.join(root, "dist/src/sidecar/index.js");
  if (!fs.existsSync(entry)) return null;
  let previous;
  try { previous = JSON.parse(fs.readFileSync(path.join(state, "connection.json"), "utf8")).url; } catch { /* first task */ }
  const explicit = Number(process.env.OFFICECODE_PORT);
  const base = Number.isInteger(explicit) && explicit > 0 && explicit < 65516 ? explicit : 8787 + parseInt(key.slice(0, 4), 16) % 1000;
  const candidates = [previous, ...Array.from({ length: 20 }, (_, n) => `http://127.0.0.1:${base + n}`)]
    .filter((value, index, all) => typeof value === "string" && /^http:\/\/127\.0\.0\.1:[1-9]\d{0,4}$/.test(value)
      && Number(value.split(":").pop()) <= 65535 && all.indexOf(value) === index);
  for (const candidate of candidates) {
    if (closed) return null;
    let info = await request(candidate, "/api/health");
    if (!info && process.env.OFFICECODE_NO_SPAWN !== "1") {
      const port = candidate.split(":").pop();
      const child = spawn(process.env.OFFICECODE_NODE || process.execPath, [entry], {
        cwd: root, detached: true, stdio: "ignore", windowsHide: true,
        env: { ...process.env, PORT: port, OFFICECODE_WS: workspace, OFFICECODE_DATA_DIR: state,
          OFFICECODE_MIRROR_ONLY: "1", OFFICECODE_LEASED: "1" },
      });
      child.on("error", () => {}); child.unref();
      for (let n = 0; n < 12 && !closed; n++) {
        await pause(100);
        info = await request(candidate, "/api/health");
        if (info) break;
      }
    }
    if (!matches(info)) continue;
    if (!await request(candidate, "/api/lease", { id: leaseId })) continue;
    leasedUrls.add(candidate);
    if (closed) { await request(candidate, "/api/lease", { id: leaseId }, "DELETE"); return null; }
    url = candidate;
    known.clear();
    fs.mkdirSync(state, { recursive: true });
    fs.writeFileSync(path.join(state, "connection.json"), JSON.stringify({ workspace, url, source: "hermes", updatedAt: Date.now() }));
    return url;
  }
  return null;
}

async function publish(event) {
  const sessionId = sid(event.sessionId);
  if (event.outcome) {
    active.delete(event.sessionId);
    const base = url || await connect();
    if (!base || !await request(base, "/api/mirror/finish", { sessionId, outcome: event.outcome })) return false;
    known.delete(event.sessionId);
    return true;
  }
  active.set(event.sessionId, event);
  const base = await connect();
  if (!base) return false;
  if (!known.has(event.sessionId)) {
    const registered = await request(base, "/api/mirror/session", { sessionId, role: event.role || "hermes",
      prompt: event.prompt || "Hermes session", parentSessionId: event.parentSessionId ? sid(event.parentSessionId) : undefined,
      runtime: event.runtime || "hermes", agent: event.agent || event.role || "hermes", workspace: event.workspace, ownerLeaseId: leaseId });
    if (!registered) { url = null; return false; }
    known.add(event.sessionId);
  }
  const result = await request(base, "/api/mirror/event", { ...event, sessionId, parentSessionId: undefined });
  if (!result) { url = null; known.clear(); return false; }
  return true;
}

async function flush() {
  if (flushing || closed) return;
  flushing = true;
  try {
    while (pending.length && !closed) {
      const event = pending.shift();
      if (!await publish(event)) { pending.unshift(event); break; }
    }
  } catch { /* Visualization must never interrupt Hermes. */ }
  finally { flushing = false; }
}

const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
input.on("line", (line) => {
  if (closed || line.length > 128_000) return;
  try {
    const event = JSON.parse(line);
    if (event?.kind === "start") { void connect().catch(() => {}); return; }
    if (!event || typeof event.sessionId !== "string" || !event.sessionId || event.sessionId.length > 200) return;
    if (event.outcome ? !["done", "blocked"].includes(event.outcome) : !["thinking", "acting", "waiting-approval"].includes(event.state)) return;
    if (pending.length >= 512) { void close(); return; }
    const previous = pending[pending.length - 1];
    if (previous?.sessionId === event.sessionId && !previous.outcome && !event.outcome) pending[pending.length - 1] = event;
    else pending.push(event);
    void flush();
  } catch { /* Ignore malformed pipe records. */ }
});

const heartbeat = setInterval(() => {
  if (closed) return;
  // Renew independently: a long event flush must not outlive the lease TTL.
  if (url && !leasePending) {
    const base = url;
    leasePending = request(base, "/api/lease", { id: leaseId }).then((result) => {
      if (!result && !closed && url === base) { url = null; known.clear(); }
      else if (result?.created && !closed && url === base) known.clear();
    }).finally(() => { leasePending = null; });
  }
  if (flushing) return;
  flushing = true;
  void (async () => {
    try {
      // Rehydrate current snapshots if the optional sidecar restarted.
      for (const event of active.values()) if (!url || !known.has(event.sessionId)) await publish(event);
    } catch { /* optional server */ }
    finally { flushing = false; void flush(); }
  })();
}, 2000);

async function close() {
  if (closed) return;
  closed = true;
  clearInterval(heartbeat); clearInterval(parentWatch);
  input.close(); process.stdin.destroy();
  // Finish only this connector's sessions. Other leases keep a shared server alive.
  while (flushing) await pause(25);
  if (leasePending) await leasePending;
  for (const base of leasedUrls) {
    const cleanup = new Set([...known, ...active.keys(), ...pending.map((event) => event.sessionId)]);
    for (const id of cleanup) await request(base, "/api/mirror/finish", { sessionId: sid(id), outcome: "blocked" });
    await request(base, "/api/lease", { id: leaseId }, "DELETE");
  }
}

const parentPid = Number(process.env.OFFICECODE_HERMES_PARENT_PID);
const parentWatch = setInterval(() => {
  if (!Number.isInteger(parentPid) || parentPid <= 0) return;
  try { process.kill(parentPid, 0); } catch (error) { if (error.code === "ESRCH") void close(); }
}, 1000);
input.on("close", () => void close());
process.on("SIGTERM", () => void close());
process.on("SIGINT", () => void close());
