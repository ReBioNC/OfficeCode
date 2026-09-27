import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { ChildProcess } from "node:child_process";

// The plugin is pure ESM (opencode ignores CJS plugin exports — verified
// with probe plugins). The harness drives it in a child `node
// --input-type=module` process. IMPORTANT: the sidecar under test runs as a
// SEPARATE OS process, because execFileSync would block this process's event
// loop and starve an in-process server (self-deadlock).
const HARNESS = `
const [_, pluginUrl, port, ws, actionsJson] = process.argv;
const { OfficeDashboardPlugin } = await import(pluginUrl);
const toasts = [];
const client = { tui: { showToast: async ({ body }) => { toasts.push(body.message); return true; } } };
const hooks = await OfficeDashboardPlugin({ client, directory: ws });
const api = async (p, body) => (await fetch("http://127.0.0.1:" + port + p, body
  ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }
  : {})).json();
for (const a of JSON.parse(actionsJson)) {
  if (a.call === "event") await hooks.event({ event: a.event });
  else await hooks[a.call](a.input);
}
const runs = (await api("/api/runs")).runs.map((r) => ({ id: r.id, state: r.state, deskId: r.deskId }));
const occupants = (await api("/api/office")).occupants;
console.log("RESULT:" + JSON.stringify({ toasts, runs, occupants }));
`;

interface HarnessOut {
  toasts: string[];
  runs: Array<{ id: string; state: string; deskId: string }>;
  occupants: Record<string, string>;
}

const execFileAsync = promisify(execFile);
const TEST_PORT = 48787;

let ws = "";
let sidecar: ChildProcess | null = null;

async function health(): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${TEST_PORT}/api/health`);
    return res.ok;
  } catch {
    return false;
  }
}

async function drive(actions: unknown[], extraEnv: Record<string, string> = {}): Promise<HarnessOut> {
  const pluginUrl = pathToFileURL(path.join(process.cwd(), ".opencode", "plugins", "office-dashboard.js")).href;
  const { stdout } = await execFileAsync(
    process.execPath,
    ["--input-type=module", "--eval", HARNESS, pluginUrl, String(TEST_PORT), ws, JSON.stringify(actions)],
    {
      encoding: "utf8",
      timeout: 30000,
      env: { ...process.env, OFFICECODE_PORT: String(TEST_PORT), ...extraEnv },
    },
  );
  const line = stdout.split("\n").find((l) => l.startsWith("RESULT:"));
  assert.ok(line, `harness printed no RESULT (tail: ${stdout.slice(-500)})`);
  return JSON.parse(line.slice("RESULT:".length)) as HarnessOut;
}

before(async () => {
  ws = fs.mkdtempSync(path.join(os.tmpdir(), "officecode-plugin-"));
  fs.mkdirSync(path.join(ws, ".officecode.sample"), { recursive: true });
  fs.copyFileSync(
    path.join(process.cwd(), ".officecode.sample", "office.json"),
    path.join(ws, ".officecode.sample", "office.json"),
  );
  const { spawn } = await import("node:child_process");
  sidecar = spawn(process.execPath, [path.join(process.cwd(), "dist", "src", "sidecar", "index.js")], {
    env: { ...process.env, PORT: String(TEST_PORT), OFFICECODE_WS: ws, OFFICECODE_DRIVER: "mock" },
    stdio: "ignore",
  });
  const deadline = Date.now() + 15000;
  for (;;) {
    if (await health()) break;
    assert.ok(Date.now() < deadline, "sidecar never came up");
    await new Promise((r) => setTimeout(r, 200));
  }
});
after(async () => {
  sidecar?.kill();
});

describe("opencode plugin", () => {
  it("toasts the dashboard URL on connect", async () => {
    const out = await drive([{ call: "event", event: { type: "server.connected" } }]);
    assert.ok(out.toasts.some((m) => m.includes("Office dashboard") && m.includes(String(TEST_PORT))));
  });
  it("mirrors a session lifecycle onto the floor", async () => {
    const out = await drive([
      { call: "event", event: { type: "session.created", properties: { sessionID: "plug-s1", agent: "build", title: "make x" } } },
      { call: "tool.execute.before", input: { sessionID: "plug-s1", tool: "edit" } },
    ]);
    const run = out.runs.find((r) => r.id.startsWith("mirror-"));
    assert.ok(run);
    assert.equal(run.state, "acting");
    const done = await drive([
      { call: "event", event: { type: "session.idle", properties: { sessionID: "plug-s1" } } },
    ]);
    assert.equal(done.runs.find((r) => r.id === run.id)?.state, "done");
    assert.equal(run.deskId in done.occupants, false);
  });
  it("never throws when the sidecar is down", async () => {
    const out = await drive(
      [
        { call: "event", event: { type: "session.created", properties: { sessionID: "plug-x" } } },
        { call: "tool.execute.before", input: { sessionID: "plug-x", tool: "bash" } },
        { call: "event", event: { type: "session.idle", properties: { sessionID: "plug-x" } } },
      ],
      { OFFICECODE_PORT: "1", OFFICECODE_NO_SPAWN: "1" },
    );
    assert.ok(out.toasts.length >= 0);
  });
});
