// OpenCode only: mirror its sessions to a separate visual dashboard.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const pluginDir = path.dirname(fileURLToPath(import.meta.url));
const stateRoot = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), ".local", "share"), "OfficeCode");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function rootDir() {
  const config = path.join(pluginDir, "office-dashboard.json");
  let installed;
  try { installed = JSON.parse(fs.readFileSync(config, "utf8")).root; } catch { /* project install */ }
  for (const candidate of [process.env.OFFICECODE_ROOT, installed, path.resolve(pluginDir, "..", "..")]) {
    if (candidate && fs.existsSync(path.join(candidate, "dist", "src", "sidecar", "index.js"))) return path.resolve(candidate);
  }
  return null;
}

function projectKey(workspace) {
  return crypto.createHash("sha256").update(process.platform === "win32" ? workspace.toLowerCase() : workspace).digest("hex").slice(0, 16);
}

function projectState(workspace) {
  return path.join(stateRoot, "projects", projectKey(workspace));
}

async function request(url, options = {}, timeout = 2000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try { return await fetch(url, { ...options, signal: ctrl.signal }); }
  finally { clearTimeout(timer); }
}

async function health(url) {
  try {
    const response = await request(`${url}/api/health`);
    return response.ok ? await response.json() : null;
  } catch { return null; }
}

function matches(info, workspace) {
  return info?.service === "officecode" && info.workspace === workspace && info.mirrorOnly === true && info.leaseManaged === true;
}

async function updateLease(url, id, method) {
  try {
    const response = await request(`${url}/api/lease`, {
      method, headers: { "content-type": "application/json" }, body: JSON.stringify({ id }),
    }, 1500);
    return response.ok;
  } catch { return false; }
}

async function post(url, route, body) {
  if (!url) return false;
  try {
    const response = await request(`${url}${route}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }, 3000);
    return response.ok;
  } catch { return false; /* dashboard must never interrupt OpenCode */ }
}

function saveConnection(workspace, url) {
  try {
    const dir = projectState(workspace);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "connection.json"), JSON.stringify({ workspace, url, updatedAt: Date.now() }), "utf8");
  } catch { /* optional */ }
}

async function findOrStart(workspace) {
  const root = rootDir();
  if (!root) return null;
  const entry = path.join(root, "dist", "src", "sidecar", "index.js");
  const key = projectKey(workspace);
  const explicit = Number(process.env.OFFICECODE_PORT);
  const base = Number.isInteger(explicit) && explicit > 0 && explicit < 65520 ? explicit : 8787 + parseInt(key.slice(0, 4), 16) % 1000;
  for (let offset = 0; offset < 20 && base + offset < 65536; offset++) {
    const port = base + offset;
    const url = `http://127.0.0.1:${port}`;
    const existing = await health(url);
    if (matches(existing, workspace)) { saveConnection(workspace, url); return url; }
    if (existing) continue;
    if (process.env.OFFICECODE_NO_SPAWN === "1") continue;
    try {
      const child = spawn(process.env.OFFICECODE_NODE || "node", [entry], {
        cwd: root, detached: true, stdio: "ignore", windowsHide: true,
        env: { ...process.env, PORT: String(port), OFFICECODE_ROOT: root, OFFICECODE_WS: workspace,
          OFFICECODE_DATA_DIR: projectState(workspace), OFFICECODE_MIRROR_ONLY: "1", OFFICECODE_LEASED: "1" },
      });
      child.on("error", () => {});
      child.unref();
    } catch { return null; }
    for (let attempt = 0; attempt < 12; attempt++) {
      await sleep(250);
      const info = await health(url);
      if (matches(info, workspace)) { saveConnection(workspace, url); return url; }
      if (info) break;
    }
  }
  return null;
}

function sessionIdOf(value) {
  const p = value?.properties ?? value;
  return p?.sessionID ?? p?.sessionId ?? p?.session_id ?? p?.info?.id ?? p?.id ?? null;
}

function toolActivity(name, args = {}) {
  const tool = String(name || "tool").toLowerCase();
  const data = args && typeof args === "object" ? args : {};
  const file = data.filePath ?? data.file_path ?? data.path ?? data.filename;
  const target = file ? path.basename(String(file)) : "";
  const query = data.query ?? data.pattern ?? data.url;
  const hint = target || (query ? String(query) : "");
  const clean = hint.replace(/[\r\n\t]+/g, " ").slice(0, 54);
  if (/web|fetch|search|browse/.test(tool) && !/grep|codesearch/.test(tool)) return { activity: "web-search", detail: clean ? `Searching: ${clean}` : "Searching the web" };
  if (/edit|write|patch|create|multiedit/.test(tool)) return { activity: "editing", detail: clean ? `Editing ${clean}` : "Editing code" };
  if (/read|cat|view/.test(tool)) return { activity: "reading", detail: clean ? `Reading ${clean}` : "Reading files" };
  if (/grep|glob|find|codesearch|list/.test(tool)) return { activity: "code-search", detail: clean ? `Searching code: ${clean}` : "Searching code" };
  if (/bash|shell|terminal|command|exec/.test(tool)) return { activity: "terminal", detail: "Running commands" };
  if (/task|agent|delegate/.test(tool)) return { activity: "delegating", detail: "Coordinating with agents" };
  return { activity: "working", detail: `Using ${tool.slice(0, 32)}` };
}

async function toast(client, message) {
  try { await client.tui.showToast({ body: { message, variant: "info" } }); }
  catch { /* no TUI in opencode run */ }
}

export const OfficeDashboardPlugin = async ({ client, directory }) => {
  const workspace = path.resolve(directory || process.cwd());
  const registrations = globalThis[Symbol.for("officecode.plugin.registrations")] ??= new Set();
  if (registrations.has(workspace)) return {};
  registrations.add(workspace);
  let url = null;
  let pending = null;
  let heartbeat = null;
  let disposed = false;
  const leaseId = crypto.randomBytes(16).toString("hex");
  const activeSessions = new Set();

  function startHeartbeat() {
    if (heartbeat) return;
    heartbeat = setInterval(() => {
      if (disposed || !url) return;
      const current = url;
      void updateLease(current, leaseId, "POST").then((ok) => {
        if (!ok && !disposed && url === current) { url = null; void ensure().catch(() => {}); }
      });
    }, 2_000);
    heartbeat.unref?.();
  }

  async function ensure() {
    if (disposed) return null;
    if (url && matches(await health(url), workspace)) return url;
    if (!pending) pending = (async () => {
      const found = await findOrStart(workspace);
      if (!found || !await updateLease(found, leaseId, "POST")) return null;
      if (disposed) { await updateLease(found, leaseId, "DELETE"); return null; }
      startHeartbeat();
      return found;
    })().finally(() => { pending = null; });
    url = await pending;
    return url;
  }

  async function beginSession(sid, prompt = "OpenCode session") {
    if (!sid || activeSessions.has(sid)) return;
    if (await post(await ensure(), "/api/mirror/session", { sessionId: sid, role: "opencode", prompt })) activeSessions.add(sid);
  }

  // The headless server may never emit server.connected. Start when OpenCode loads the plugin.
  void ensure().catch(() => {});

  return {
    dispose: async () => {
      disposed = true;
      if (heartbeat) clearInterval(heartbeat);
      if (pending) await pending.catch(() => {});
      const lastUrl = url;
      url = null;
      registrations.delete(workspace);
      if (lastUrl) await updateLease(lastUrl, leaseId, "DELETE");
    },
    event: async ({ event }) => {
      if (!event || typeof event.type !== "string") return;
      if (event.type === "server.connected") {
        const current = await ensure();
        await toast(client, current ? `🏢 Office dashboard → ${current} · /dashboard` : "🏢 Office dashboard unavailable · check your Node.js/OfficeCode installation");
      }
      if (event.type === "session.created") {
        const sid = sessionIdOf(event);
        await beginSession(sid, String(event.properties?.info?.title ?? event.properties?.title ?? "OpenCode session"));
      }
      if (event.type === "session.updated") {
        const sid = sessionIdOf(event);
        const title = event.properties?.info?.title;
        if (sid && activeSessions.has(sid) && typeof title === "string" && title.trim()) {
          await post(await ensure(), "/api/mirror/session", { sessionId: sid, role: "opencode", prompt: title });
        }
      }
      if (event.type === "message.updated" && event.properties?.info?.role === "user") {
        const info = event.properties.info;
        const sid = sessionIdOf(info);
        // Metadata can arrive after idle. Only a prompt hook or busy status starts a new turn.
        if (sid && activeSessions.has(sid) && typeof info.agent === "string") {
          await post(await ensure(), "/api/mirror/event", { sessionId: sid, state: "thinking", activity: "thinking",
            role: info.agent, detail: "Planning the next steps" });
        }
      }
      if (event.type === "session.status" && event.properties?.status?.type === "busy") {
        const sid = sessionIdOf(event);
        await beginSession(sid);
        if (sid) await post(await ensure(), "/api/mirror/event", { sessionId: sid, state: "thinking", activity: "thinking", detail: "Planning the next steps" });
      }
      if (event.type === "session.idle" || event.type === "session.deleted" || event.type === "session.error"
        || (event.type === "session.status" && event.properties?.status?.type === "idle")) {
        const sid = sessionIdOf(event);
        if (sid) {
          await post(await ensure(), "/api/mirror/finish", { sessionId: sid,
            outcome: event.type === "session.error" ? "blocked" : "done" });
          activeSessions.delete(sid);
        }
      }
      if (event.type === "permission.updated" || event.type === "permission.asked") {
        const sid = sessionIdOf(event);
        if (sid) {
          await beginSession(sid);
          await post(await ensure(), "/api/mirror/event", { sessionId: sid, state: "waiting-approval", activity: "approval", detail: "Waiting for permission", message: "waiting for approval" });
        }
      }
      if (event.type === "permission.replied") {
        const sid = sessionIdOf(event);
        if (sid) {
          await beginSession(sid);
          await post(await ensure(), "/api/mirror/event", { sessionId: sid, state: "thinking", activity: "thinking", detail: "Planning the next steps" });
        }
      }
    },
    "chat.message": async (input) => {
      const sid = sessionIdOf(input);
      if (!sid) return;
      await beginSession(sid);
      await post(await ensure(), "/api/mirror/event", { sessionId: sid, state: "thinking", activity: "thinking",
        role: typeof input.agent === "string" ? input.agent : undefined, detail: "Planning the next steps" });
    },
    "tool.execute.before": async (input, output) => {
      const sid = sessionIdOf(input);
      if (sid) {
        await beginSession(sid);
        const tool = String(input.tool ?? input.name ?? "tool");
        await post(await ensure(), "/api/mirror/event", { sessionId: sid, state: "acting", message: tool,
          ...toolActivity(tool, output?.args) });
      }
    },
    "tool.execute.after": async (input) => {
      const sid = sessionIdOf(input);
      if (sid) await post(await ensure(), "/api/mirror/event", { sessionId: sid, state: "thinking", activity: "thinking", detail: "Reviewing tool results" });
    },
    "permission.ask": async (input) => {
      const sid = sessionIdOf(input);
      if (sid) {
        await beginSession(sid);
        await post(await ensure(), "/api/mirror/event", { sessionId: sid, state: "waiting-approval", activity: "approval", detail: "Waiting for permission", message: "waiting for approval" });
      }
    },
  };
};
