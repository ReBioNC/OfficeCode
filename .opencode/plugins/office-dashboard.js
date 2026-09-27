// OfficeCode dashboard plugin for opencode (pure ESM — opencode only
// invokes ESM `export`ed plugin functions; CJS exports are ignored).
//
// - Shows a "view dashboard" toast every time opencode connects.
// - Auto-starts the OfficeCode sidecar (the 2D office server) if it is down.
// - Mirrors live opencode sessions/tools onto the office floor as characters.
//
// Install (this project): file already lives in .opencode/plugins/.
// Install (any project): copy this file to ~/.config/opencode/plugins/ and
//   set OFFICECODE_ROOT to this repo checkout.
//
// Env: OFFICECODE_PORT (default 8787), OFFICECODE_ROOT (override repo root),
//   OFFICECODE_NO_SPAWN=1 (never spawn, tests/CI).
//
// The dashboard is strictly optional: every sidecar call is wrapped so a
// down dashboard NEVER breaks opencode.

import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

function repoRoot() {
  if (process.env["OFFICECODE_ROOT"]) return process.env["OFFICECODE_ROOT"];
  try {
    return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
  } catch {
    return process.cwd();
  }
}

function sidecarUrl() {
  const port = Number(process.env["OFFICECODE_PORT"] ?? 8787);
  return `http://127.0.0.1:${Number.isFinite(port) && port > 0 ? port : 8787}`;
}

async function post(url, body) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 3000);
    await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    clearTimeout(t);
  } catch {
    // dashboard optional — never break opencode
  }
}

async function health(url) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 2000);
    const res = await fetch(`${url}/api/health`, { signal: ctrl.signal });
    clearTimeout(t);
    return res.ok;
  } catch {
    return false;
  }
}

async function ensureSidecar(url, workspaceDir) {
  if (await health(url)) return true;
  if (process.env["OFFICECODE_NO_SPAWN"] === "1") return false;
  const entry = path.join(repoRoot(), "dist", "src", "sidecar", "index.js");
  if (!fs.existsSync(entry)) return false;
  try {
    const { spawn } = await import("node:child_process");
    const child = spawn(process.execPath, [entry], {
      detached: true,
      stdio: "ignore",
      env: {
        ...process.env,
        PORT: String(new URL(url).port || 8787),
        OFFICECODE_WS: workspaceDir,
      },
    });
    child.unref();
  } catch {
    return false;
  }
  for (let i = 0; i < 10; i++) {
    await new Promise((r) => setTimeout(r, 300));
    if (await health(url)) return true;
  }
  return false;
}

function sessionIdOf(obj) {
  if (!obj || typeof obj !== "object") return null;
  const p = obj.properties ?? obj;
  return p.sessionID ?? p.sessionId ?? p.session_id ?? p.id ?? null;
}

async function toast(client, message) {
  try {
    await client.tui.showToast({ body: { message, variant: "info" } });
  } catch {
    // TUI not attached (e.g. `opencode run`) — stay silent
  }
}

export const OfficeDashboardPlugin = async ({ client, directory }) => {
  const url = sidecarUrl();
  const workspace = directory ?? process.cwd();
  let sidecarOk = false;
  let spawnTried = false;

  async function ensureOnce() {
    if (sidecarOk) return true;
    if (await health(url)) {
      sidecarOk = true;
      return true;
    }
    if (spawnTried) return false;
    spawnTried = true;
    sidecarOk = await ensureSidecar(url, workspace);
    return sidecarOk;
  }

  return {
    event: async ({ event }) => {
      if (!event || typeof event.type !== "string") return;
      if (event.type === "server.connected") {
        const ok = await ensureOnce();
        await toast(
          client,
          ok
            ? `🏢 Office dashboard → ${url}`
            : `🏢 Office dashboard → ${url} (sidecar belum jalan — npm run dev)`,
        );
      }
      if (event.type === "session.created") {
        await ensureOnce();
        const sid = sessionIdOf(event);
        if (!sid) return;
        const agent = event.properties?.agent ?? event.properties?.agentName ?? "opencode";
        const title = event.properties?.title ?? "opencode session";
        await post(`${url}/api/mirror/session`, { sessionId: sid, role: String(agent), prompt: String(title) });
      }
      if (event.type === "session.idle" || event.type === "session.deleted") {
        const sid = sessionIdOf(event);
        if (sid) await post(`${url}/api/mirror/finish`, { sessionId: sid, outcome: "done" });
      }
      if (event.type === "session.error") {
        const sid = sessionIdOf(event);
        if (sid) await post(`${url}/api/mirror/finish`, { sessionId: sid, outcome: "blocked", message: "session error" });
      }
    },
    "tool.execute.before": async (input) => {
      const sid = sessionIdOf(input);
      if (!sid) return;
      const tool = input.tool ?? input.name ?? "tool";
      await post(`${url}/api/mirror/event`, { sessionId: sid, state: "acting", message: String(tool) });
    },
    "tool.execute.after": async (input) => {
      const sid = sessionIdOf(input);
      if (!sid) return;
      await post(`${url}/api/mirror/event`, { sessionId: sid, state: "thinking" });
    },
    "permission.asked": async (input) => {
      const sid = sessionIdOf(input);
      if (!sid) return;
      await post(`${url}/api/mirror/event`, { sessionId: sid, state: "blocked", message: "menunggu approval" });
    },
    "permission.replied": async (input) => {
      const sid = sessionIdOf(input);
      if (!sid) return;
      await post(`${url}/api/mirror/event`, { sessionId: sid, state: "thinking" });
    },
  };
};
