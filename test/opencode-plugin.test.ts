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
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, options) => {
  // Hold an in-flight title update while idle arrives, as OpenCode's unawaited hooks can do.
  if (String(url).endsWith("/api/mirror/session") && options?.body
    && JSON.parse(options.body).prompt === "Late concurrent title") {
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  return realFetch(url, options);
};
let dashboardUrl = "http://127.0.0.1:" + port;
let disposeAfter = false;
const api = async (p, body) => (await fetch(dashboardUrl + p, body
  ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }
  : {})).json();
async function invoke(a) {
  if (a.call === "dispose") { disposeAfter = true; return; }
  if (a.call === "parallel") { await Promise.all(a.actions.map(invoke)); return; }
  if (a.call === "event") await hooks.event({ event: a.event });
  else await hooks[a.call](a.input, a.output);
}
for (const a of JSON.parse(actionsJson)) await invoke(a);
dashboardUrl = toasts.map((t) => t.split(" → ")[1]?.split(" ")[0]).find(Boolean) || dashboardUrl;
const runs = (await api("/api/runs")).runs.map((r) => ({ ...r }));
const occupants = (await api("/api/office")).occupants;
const info = await api("/api/health");
if (disposeAfter) await hooks.dispose();
console.log("RESULT:" + JSON.stringify({ toasts, runs, occupants, url: dashboardUrl, info }));
`;

interface HarnessOut {
  toasts: string[];
  runs: Array<{ id: string; state: string; deskId: string; role?: string; activity?: string; detail?: string; sessionId?: string; prompt?: string; parentSessionId?: string; activeTools?: { id: string; name: string }[]; timeline?: { outcome?: string }[] }>;
  occupants: Record<string, string>;
  url: string;
  info: { workspace: string; mirrorOnly: boolean; leaseManaged: boolean; pid: number };
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

async function drive(actions: unknown[], extraEnv: Record<string, string> = {}, workspace = ws): Promise<HarnessOut> {
  const pluginUrl = pathToFileURL(path.join(process.cwd(), ".opencode", "plugins", "office-dashboard.js")).href;
  const { stdout } = await execFileAsync(
    process.execPath,
    ["--input-type=module", "--eval", HARNESS, pluginUrl, String(TEST_PORT), workspace, JSON.stringify(actions)],
    {
      encoding: "utf8",
      timeout: 30000,
      env: { ...process.env, OFFICECODE_PORT: String(TEST_PORT), OFFICECODE_ROOT: process.cwd(), OFFICECODE_NODE: process.execPath, ...extraEnv },
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
    env: { ...process.env, PORT: String(TEST_PORT), OFFICECODE_WS: ws, OFFICECODE_MIRROR_ONLY: "1", OFFICECODE_LEASED: "1" },
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
  it("keeps the remaining tool active when parallel calls finish out of order or busy metadata arrives", async () => {
    const sid = "plug-parallel-tools";
    const out = await drive([
      { call:"tool.execute.before", input:{sessionID:sid,tool:"read",callID:"read-a"}, output:{args:{filePath:"a.ts"}} },
      { call:"tool.execute.before", input:{sessionID:sid,tool:"edit",callID:"edit-b"}, output:{args:{filePath:"b.ts"}} },
      { call:"tool.execute.after", input:{sessionID:sid,tool:"read",callID:"read-a"}, output:{metadata:{}} },
      { call:"event", event:{type:"session.status",properties:{sessionID:sid,status:{type:"busy"}}} },
    ]);
    const run = out.runs.find((run)=>run.sessionId===sid);
    assert.equal(run?.state,"acting");
    assert.equal(run?.activity,"editing");
    assert.deepEqual(run?.activeTools?.map((tool)=>tool.id),["edit-b"]);
    assert.ok(run?.timeline?.some((step)=>step.outcome==="completed"));
  });
  it("records failed tools, keeps permission visible, and ignores late tool completion after idle", async () => {
    const sid = "plug-tool-error";
    const out = await drive([
      { call:"tool.execute.before", input:{sessionID:sid,tool:"bash",callID:"cmd-a"} },
      { call:"tool.execute.before", input:{sessionID:sid,tool:"read",callID:"read-b"} },
      { call:"event", event:{type:"permission.asked",properties:{sessionID:sid}} },
      { call:"event", event:{type:"message.part.updated",properties:{part:{type:"tool",sessionID:sid,callID:"cmd-a",tool:"bash",state:{status:"error",error:"command failed"}}}} },
    ]);
    const run=out.runs.find((run)=>run.sessionId===sid);
    assert.equal(run?.state,"waiting-approval");
    assert.deepEqual(run?.activeTools?.map((tool)=>tool.id),["read-b"]);
    assert.ok(run?.timeline?.some((step)=>step.outcome==="error"));
    const late=await drive([
      { call:"event", event:{type:"session.idle",properties:{sessionID:sid}} },
      { call:"tool.execute.after", input:{sessionID:sid,tool:"read",callID:"read-b"} },
    ]);
    assert.equal(late.runs.find((entry)=>entry.id===run?.id)?.state,"done");
    assert.ok(!late.runs.some((entry)=>entry.sessionId===sid&&entry.state==="thinking"));
  });
  it("forwards the parent relationship emitted by OpenCode and retains it for the next turn", async () => {
    const sid = "plug-child";
    const out = await drive([
      { call: "event", event: { type: "session.created", properties: { info: { id: sid, parentID: "plug-parent", title: "Verify code" } } } },
      { call: "event", event: { type: "session.idle", properties: { sessionID: sid } } },
      { call: "chat.message", input: { sessionID: sid, agent: "qa-engineer" } },
    ]);
    assert.ok(out.runs.filter((run) => run.sessionId === sid).every((run) => run.parentSessionId === "plug-parent"));
  });
  it("toasts the dashboard URL on connect", async () => {
    const out = await drive([{ call: "event", event: { type: "server.connected" } }]);
    assert.ok(out.toasts.some((m) => m.includes("Office dashboard") && m.includes(String(TEST_PORT))));
    assert.equal(out.info.workspace, ws);
    assert.equal(out.info.leaseManaged, true);
  });
  it("mirrors a session lifecycle onto the floor", async () => {
    const out = await drive([
      { call: "event", event: { type: "session.created", properties: { info: { id: "plug-s1", title: "make x" } } } },
      { call: "tool.execute.before", input: { sessionID: "plug-s1", tool: "edit" } },
    ]);
    const run = out.runs.find((r) => r.sessionId === "plug-s1");
    assert.ok(run);
    assert.equal(run.state, "acting");
    assert.ok(out.runs.some((r) => r.id === run.id));
    const awaiting = await drive([{ call: "event", event: { type: "permission.updated", properties: { sessionID: "plug-s1" } } }]);
    assert.equal(awaiting.runs.find((r) => r.id === run.id)?.state, "waiting-approval");
    const resumed = await drive([{ call: "event", event: { type: "permission.replied", properties: { sessionID: "plug-s1" } } }]);
    assert.equal(resumed.runs.find((r) => r.id === run.id)?.state, "thinking");
    const done = await drive([
      { call: "event", event: { type: "session.idle", properties: { sessionID: "plug-s1" } } },
    ]);
    assert.equal(done.runs.find((r) => r.id === run.id)?.state, "done");
    assert.equal(run.deskId in done.occupants, false);
    const nextTurn = await drive([
      { call: "event", event: { type: "session.status", properties: { sessionID: "plug-s1", status: { type: "busy" } } } },
      { call: "tool.execute.before", input: { sessionID: "plug-s1", tool: "bash" } },
    ]);
    assert.ok(nextTurn.runs.some((entry) => entry.id !== run.id && entry.state === "acting"));
  });
  it("classifies read, edit, web search, and the active OpenCode agent", async () => {
    const sid = "plug-activity";
    const out = await drive([
      { call: "event", event: { type: "session.created", properties: { info: { id: sid, title: "Implement search" } } } },
      { call: "chat.message", input: { sessionID: sid, agent: "build" }, output: { message: {}, parts: [] } },
      { call: "tool.execute.before", input: { sessionID: sid, tool: "read" }, output: { args: { filePath: "src/search.ts" } } },
    ]);
    const run = out.runs.find((entry) => entry.sessionId === sid);
    assert.equal(run?.role, "build");
    assert.equal(run?.activity, "reading");
    assert.equal(run?.detail, "Reading search.ts");
    const edited = await drive([{ call: "tool.execute.before", input: { sessionID: sid, tool: "edit" }, output: { args: { filePath: "src/search.ts" } } }]);
    assert.equal(edited.runs.find((entry) => entry.sessionId === sid)?.activity, "editing");
    const searched = await drive([{ call: "tool.execute.before", input: { sessionID: sid, tool: "websearch" }, output: { args: { query: "search docs" } } }]);
    assert.equal(searched.runs.find((entry) => entry.sessionId === sid)?.activity, "web-search");
  });
  it("refreshes the feature room title and agent from OpenCode events", async () => {
    const sid = "plug-title";
    const out = await drive([
      { call: "event", event: { type: "session.created", properties: { info: { id: sid, title: "New session" } } } },
      { call: "event", event: { type: "session.updated", properties: { info: { id: sid, title: "Build search filters" } } } },
      { call: "event", event: { type: "message.updated", properties: { info: { sessionID: sid, role: "user", agent: "explore" } } } },
    ]);
    const run = out.runs.find((entry) => entry.sessionId === sid);
    assert.equal(run?.prompt, "Build search filters");
    assert.equal(run?.role, "explore");
  });
  it("does not reopen a completed task when late title metadata arrives", async () => {
    const sid = "plug-late-title";
    const out = await drive([
      { call: "event", event: { type: "session.created", properties: { info: { id: sid, title: "Build a feature" } } } },
      { call: "event", event: { type: "session.idle", properties: { sessionID: sid } } },
      { call: "event", event: { type: "session.updated", properties: { info: { id: sid, title: "Feature complete" } } } },
    ]);
    assert.equal(out.runs.filter((entry) => entry.sessionId === sid).length, 1);
    assert.equal(out.runs.find((entry) => entry.sessionId === sid)?.state, "done");
  });
  it("finishes a task on an idle status event", async () => {
    const sid = "plug-status-idle";
    const out = await drive([
      { call: "chat.message", input: { sessionID: sid, agent: "build" } },
      { call: "event", event: { type: "session.status", properties: { sessionID: sid, status: { type: "idle" } } } },
    ]);
    assert.equal(out.runs.find((entry) => entry.sessionId === sid)?.state, "done");
  });
  it("ignores late user-message metadata after idle but shows the next genuine prompt", async () => {
    const sid = "plug-late-user-metadata";
    const out = await drive([
      { call: "chat.message", input: { sessionID: sid, agent: "frontend-dev" } },
      { call: "event", event: { type: "session.idle", properties: { sessionID: sid } } },
      { call: "event", event: { type: "message.updated", properties: { info: { sessionID: sid, role: "user", agent: "frontend-dev" } } } },
    ]);
    assert.equal(out.runs.filter((run) => run.sessionId === sid).length, 1);
    assert.equal(out.runs.find((run) => run.sessionId === sid)?.state, "done");
    const next = await drive([{ call: "chat.message", input: { sessionID: sid, agent: "backend-dev" } }]);
    assert.ok(next.runs.some((run) => run.sessionId === sid && run.state === "thinking" && run.role === "backend-dev"));
  });
  it("keeps a completed session closed when its title request overlaps idle", async () => {
    const sid = "plug-concurrent-title";
    const out = await drive([
      { call: "chat.message", input: { sessionID: sid, agent: "build" } },
      { call: "parallel", actions: [
        { call: "event", event: { type: "session.updated", properties: { info: { id: sid, title: "Late concurrent title" } } } },
        { call: "event", event: { type: "session.idle", properties: { sessionID: sid } } },
      ] },
    ]);
    const sessionRuns = out.runs.filter((run) => run.sessionId === sid);
    assert.equal(sessionRuns.length, 1);
    assert.equal(sessionRuns[0].state, "done");
    assert.ok(!Object.values(out.occupants).includes(sessionRuns[0].id));
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
  it("isolates another project and serves its visual assets without model dispatch", async () => {
    const other = fs.mkdtempSync(path.join(os.tmpdir(), "officecode-other-"));
    let pid: number | undefined;
    try {
      const out = await drive([{ call: "event", event: { type: "server.connected" } }], {}, other);
      pid = out.info.pid;
      assert.equal(out.info.workspace, other);
      assert.equal(out.info.mirrorOnly, true);
      assert.notEqual(out.url, `http://127.0.0.1:${TEST_PORT}`);
      assert.equal((await fetch(out.url)).status, 200);
      assert.equal((await fetch(`${out.url}/app.js`)).status, 200);
      const dispatch = await fetch(`${out.url}/api/runs`, { method: "POST" });
      assert.equal(dispatch.status, 403);
      assert.equal((await dispatch.json()).error, "The global dashboard mirrors OpenCode sessions; start tasks in OpenCode.");
      assert.equal(fs.existsSync(path.join(other, ".officecode")), false);
    } finally {
      if (pid) process.kill(pid);
    }
  });
  it("releases its sidecar when OpenCode disposes the plugin", async () => {
    const other = fs.mkdtempSync(path.join(os.tmpdir(), "officecode-dispose-"));
    const out = await drive([
      { call: "event", event: { type: "server.connected" } },
      { call: "dispose" },
    ], {}, other);
    assert.equal(out.info.leaseManaged, true);
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      try { await fetch(`${out.url}/api/health`, { signal: AbortSignal.timeout(250) }); }
      catch { return; }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.fail("sidecar stayed online after plugin dispose");
  });
});
