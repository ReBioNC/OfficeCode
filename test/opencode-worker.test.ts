import { it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const worker = path.join(process.cwd(), "scripts/delegate-opencode.cjs");
type Event = Record<string, any>;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const load = () => require(worker) as { runJob: (input: Event, event: (event: Event) => void, options?: Event) => Promise<Event> };

async function fixture(code: string, check: (workspace: string, options: Event) => Promise<void>) {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "office-worker-"));
  const cli = path.join(workspace, "fixture.cjs");
  fs.writeFileSync(cli, code);
  try { await check(workspace, { executable: process.execPath, prefixArgs: [cli], timeoutMs: 5000 }); }
  finally { fs.rmSync(workspace, { recursive: true, force: true }); }
}
const input = (workspace: string, extras: Event = {}) => ({ prompt: "Inspect task; $(no-shell)", workspace,
  agent: "configured-agent", role: "Reviewer", parentSessionId: "hermes:verified-parent", jobId: "job-42", ...extras });
const emit = `const emit = (event) => process.stdout.write(JSON.stringify(event) + '\\n');`;

it("OpenCode worker runs isolated argv/stdin and returns assistant text without raw telemetry", async () => {
  await fixture(`${emit}
    let prompt = ''; process.stdin.setEncoding('utf8'); process.stdin.on('data', d => prompt += d);
    process.stdin.on('end', () => {
      require('node:fs').writeFileSync('invocation.json', JSON.stringify({args:process.argv.slice(2), prompt,
        cwd:process.cwd(), suppressed:process.env.OFFICECODE_MIRROR_DISABLED, plugins:process.env.OPENCODE_DISABLE_PLUGINS}));
      emit({type:'step_start',sessionID:'ses_real',part:{type:'step-start'}});
      emit({type:'reasoning',sessionID:'ses_real',part:{type:'reasoning',text:'PRIVATE REASONING'}});
      emit({type:'tool_use',sessionID:'ses_real',part:{type:'tool',callID:'call_read',tool:'read',
        state:{status:'running',input:{filePath:'C:/project/index.ts',content:'PRIVATE CONTENT'}}}});
      emit({type:'tool_use',sessionID:'ses_real',part:{type:'tool',callID:'call_read',tool:'read',
        state:{status:'completed',input:{filePath:'C:/project/index.ts'},output:'PRIVATE TOOL RESULT',
          time:{start:100,end:125}}}});
      emit({type:'text',sessionID:'ses_real',part:{type:'text',id:'text_1',text:'Final answer'}});
      emit({type:'step_finish',sessionID:'ses_real',part:{type:'step-finish',reason:'stop'}});
    });`, async (workspace, options) => {
    const events: Event[] = [];
    const result = await load().runJob(input(workspace), e => events.push(e), options);
    assert.equal(result.outcome, "done"); assert.equal(result.result, "Final answer");
    assert.equal(result.sessionId, "ses_real"); assert.equal(result.exitCode, 0);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(workspace, "invocation.json"), "utf8")), {
      args: ["run", "--format", "json", "--agent", "configured-agent"],
      prompt: "Inspect task; $(no-shell)", cwd: workspace, suppressed: "1",
    });
    assert.ok(events.every(e => e.sessionId === "delegate:job-42" && e.runtime === "opencode"
      && e.workspace === workspace && e.parentSessionId === "hermes:verified-parent" && e.role === "Reviewer"));
    assert.ok(events.some(e => e.state === "acting" && e.activeTools[0].name === "read"));
    assert.ok(events.some(e => e.toolResult?.outcome === "completed" && e.toolResult.detail.includes("index.ts") && e.toolResult.durationMs === 25));
    assert.equal(events.at(-1)?.outcome, "done");
    assert.doesNotMatch(JSON.stringify(events), /PRIVATE|Final answer/);
  });
});

it("OpenCode worker uses dashboard activities for commands and web/code search", async () => {
  await fixture(`${emit}
    for (const name of ['bash','grep','webfetch','edit']) emit({type:'tool_use',sessionID:'ses_tools',part:{tool:name,callID:name,state:{status:'completed',input:{command:'SECRET',url:'PRIVATE'}}}});
    emit({type:'text',sessionID:'ses_tools',part:{text:'Done'}});
    emit({type:'step_finish',sessionID:'ses_tools',part:{reason:'stop'}});`, async (workspace, options) => {
    const events: Event[] = [];
    await load().runJob(input(workspace), e => events.push(e), options);
    assert.deepEqual(events.filter(e => e.toolResult).map(e => e.toolResult.activity), ['terminal','code-search','web-search','editing']);
    assert.doesNotMatch(JSON.stringify(events), /SECRET|PRIVATE/);
  });
});

it("OpenCode worker rejects invalid jobs before launching and reports missing executable safely", async () => {
  const events: Event[] = [];
  const result = await load().runJob(input(process.cwd()), e => events.push(e), { executable: path.join(os.tmpdir(), "missing-officecode-cli-6789") });
  assert.equal(result.outcome, "blocked"); assert.equal(result.error, "missing-cli");
  assert.doesNotMatch(result.result, /6789|ENOENT/);
  for (const invalid of [{ prompt: " " }, { prompt: "x".repeat(16001) }, { workspace: "relative" }, { workspace: __filename },
    { agent: "bad\nagent" }, { role: "x".repeat(49) }, { parentSessionId: "" }]) {
    const rejected = await load().runJob(input(process.cwd(), invalid), () => assert.fail("invalid input emitted telemetry"));
    assert.equal(rejected.outcome, "blocked"); assert.equal(rejected.error, "invalid-input");
  }
});

it("OpenCode worker treats error events, failed tools and nonzero exit as incomplete without leaking errors", async () => {
  for (const code of [
    `${emit} emit({type:'error',sessionID:'ses_fail',error:{name:'APIError',data:{message:'PRIVATE ERROR'}}});`,
    `${emit} emit({type:'tool_use',sessionID:'ses_fail',part:{type:'tool',tool:'bash',callID:'c',state:{status:'error',input:{command:'SECRET COMMAND'},error:'PRIVATE ERROR'}}});`,
    `${emit} emit({type:'text',sessionID:'ses_fail',part:{text:'Partial answer'}}); process.stderr.write('PRIVATE ERROR'); process.exitCode = 7;`,
  ]) await fixture(code, async (workspace, options) => {
    const events: Event[] = [];
    const result = await load().runJob(input(workspace), e => events.push(e), options);
    assert.equal(result.outcome, "blocked"); assert.ok(result.error);
    assert.doesNotMatch(JSON.stringify({ events, result }), /PRIVATE|SECRET COMMAND/);
    assert.equal(events.at(-1)?.outcome, "blocked");
  });
});

it("OpenCode worker identifies invalid configured agents using safe structured error names", async () => {
  await fixture(`${emit} emit({type:'error',sessionID:'ses_invalid',error:{name:'AgentNotFoundError',data:{message:'PRIVATE'}}});`, async (workspace, options) => {
    const result = await load().runJob(input(workspace), () => {}, options);
    assert.equal(result.outcome, "blocked"); assert.equal(result.error, "invalid-agent");
    assert.doesNotMatch(JSON.stringify(result), /PRIVATE/);
  });
});

it("OpenCode permission events are observed without granting approval or reporting success", async () => {
  await fixture(`${emit} emit({type:'permission.asked',sessionID:'ses_permission',properties:{id:'ask',permission:'bash',patterns:['PRIVATE COMMAND']}});
    emit({type:'permission.replied',sessionID:'ses_permission',properties:{id:'ask',reply:'reject'}});`, async (workspace, options) => {
    const events: Event[] = [];
    const result = await load().runJob(input(workspace), e => events.push(e), options);
    assert.equal(result.outcome, "blocked"); assert.equal(result.error, "permission-denied");
    assert.ok(events.some(e => e.state === "waiting-approval"));
    assert.doesNotMatch(JSON.stringify(events), /PRIVATE COMMAND/);
  });
});

it("OpenCode worker keeps permission requests incomplete when the CLI exits cleanly", async () => {
  await fixture(`${emit} emit({type:'permission.asked',sessionID:'ses_permission',properties:{permission:'edit'}});
    emit({type:'step_finish',sessionID:'ses_permission',part:{reason:'stop'}});`, async (workspace, options) => {
    const result = await load().runJob(input(workspace), () => {}, options);
    assert.equal(result.outcome, "blocked"); assert.equal(result.error, "permission-required");
  });
});

it("OpenCode worker accepts final JSON without newline and replaces repeated assistant parts", async () => {
  await fixture(`${emit} emit({type:'text',sessionID:'ses_parts',part:{id:'t',text:'Initial'}});
    emit({type:'text',sessionID:'ses_parts',part:{id:'t',text:'Complete'}});
    process.stdout.write(JSON.stringify({type:'step_finish',sessionID:'ses_parts',part:{reason:'stop'}}));`, async (workspace, options) => {
    const result = await load().runJob(input(workspace), () => {}, options);
    assert.equal(result.outcome, "done"); assert.equal(result.result, "Complete");
  });
});

it("OpenCode worker returns a recovered assistant response while retaining a failed tool outcome", async () => {
  await fixture(`${emit} emit({type:'tool_use',sessionID:'ses_recovery',part:{tool:'read',callID:'c',state:{status:'error',error:'PRIVATE'}}});
    emit({type:'text',sessionID:'ses_recovery',part:{text:'I could not read the file.'}});
    emit({type:'step_finish',sessionID:'ses_recovery',part:{reason:'stop'}});`, async (workspace, options) => {
    const result = await load().runJob(input(workspace), () => {}, options);
    assert.equal(result.outcome, "blocked"); assert.equal(result.error, "tool-error");
    assert.equal(result.result, "I could not read the file.");
  });
});

it("OpenCode worker fails malformed protocol, oversized lines, output floods and empty success", async () => {
  const cases = [
    { code: `process.stdout.write('not-json PRIVATE\\n')`, error: "invalid-protocol" },
    { code: `process.stdout.write(JSON.stringify({type:'reasoning',part:{text:'x'.repeat(1048576)}})+'\\n')`, error: "line-limit" },
    { code: `${emit} for(let n=0;n<18;n++) emit({type:'reasoning',part:{text:'x'.repeat(999000)}});`, error: "output-limit" },
    { code: "process.exitCode = 0;", error: "incomplete" },
  ];
  for (const scenario of cases) await fixture(scenario.code, async (workspace, options) => {
    const events: Event[] = [];
    const result = await load().runJob(input(workspace), e => events.push(e), options);
    assert.equal(result.outcome, "blocked"); assert.equal(result.error, scenario.error);
    assert.doesNotMatch(JSON.stringify({ events, result }), /PRIVATE/);
  });
});

it("OpenCode worker bounds final text explicitly and handles UTF8 chunk boundaries", async () => {
  await fixture(`${emit} const line = JSON.stringify({type:'text',sessionID:'ses_unicode',part:{id:'t',text:'😀'.repeat(33000)}})+'\\n';
    const bytes=Buffer.from(line); for (let n=0;n<bytes.length;n+=97) process.stdout.write(bytes.subarray(n,n+97));
    emit({type:'step_finish',sessionID:'ses_unicode',part:{reason:'stop'}});`, async (workspace, options) => {
    const result = await load().runJob(input(workspace), () => {}, options);
    assert.equal(result.outcome, "done"); assert.equal(result.truncated, true);
    assert.equal(result.result.length, 64000); assert.doesNotMatch(result.result, /�/);
  });
});

it("OpenCode worker timeout and cancellation terminate owned descendants", { timeout: 20000 }, async () => {
  for (const cancel of [false, true]) await fixture(`const {spawn}=require('node:child_process');
    const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore',windowsHide:true});
    require('node:fs').writeFileSync('descendant.pid',String(child.pid)); setInterval(()=>{},1000);`, async (workspace, options) => {
    const controller = new AbortController();
    const pending = load().runJob(input(workspace), () => {}, { ...options, timeoutMs: cancel ? 5000 : 1200, signal: controller.signal });
    const file = path.join(workspace, "descendant.pid");
    for (let n = 0; n < 100 && !fs.existsSync(file); n++) await sleep(10);
    assert.ok(fs.existsSync(file)); const pid = Number(fs.readFileSync(file, "utf8"));
    if (cancel) controller.abort();
    const result = await pending;
    assert.equal(result.outcome, "blocked"); assert.equal(result.error, cancel ? "cancelled" : "timeout");
    let alive = true;
    for (let n = 0; n < 100 && alive; n++) { try { process.kill(pid, 0); await sleep(20); } catch { alive = false; } }
    assert.equal(alive, false, "descendant escaped cancellation");
  });
});

it("OpenCode cancellation preserves another concurrently owned job", async () => {
  await fixture(`${emit} let prompt=''; process.stdin.on('data', d=>prompt+=d); process.stdin.on('end',()=>{
    if(prompt==='cancel me') setInterval(()=>{},1000);
    else setTimeout(()=>{emit({type:'text',sessionID:'ses_survivor',part:{text:'Survived'}});
      emit({type:'step_finish',sessionID:'ses_survivor',part:{reason:'stop'}});},300);
  });`, async (workspace, options) => {
    const controller = new AbortController();
    const canceled = load().runJob(input(workspace, { prompt: "cancel me", jobId: "cancel-owned" }), () => {}, { ...options, signal: controller.signal });
    const survivor = load().runJob(input(workspace, { prompt: "other job", jobId: "survive-owned" }), () => {}, options);
    await sleep(150); controller.abort();
    assert.equal((await canceled).error, "cancelled");
    assert.equal((await survivor).result, "Survived");
  });
});

it("OpenCode CLI wrapper emits only newline event/result envelopes for malformed input", async () => {
  const child = spawn(process.execPath, [worker], { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
  let stdout = "", stderr = "";
  child.stdout.on("data", d => stdout += d); child.stderr.on("data", d => stderr += d);
  child.stdin.end("malformed SECRET");
  await new Promise<void>(resolve => child.on("close", () => resolve()));
  const lines = stdout.trim().split("\n").map(line => JSON.parse(line));
  assert.equal(lines.length, 1); assert.equal(lines[0].kind, "result");
  assert.equal(lines[0].result.error, "invalid-input"); assert.equal(stderr, "");
  assert.doesNotMatch(stdout, /SECRET/);
});

it("OpenCode CLI starts on first JSON line and receives cancellation over its open control pipe", { timeout: 10000 }, async () => {
  await fixture(`require('node:fs').writeFileSync('started.pid',String(process.pid)); setInterval(()=>{},1000);`, async (workspace, options) => {
    const bootstrap = path.join(workspace, "wrapper.cjs");
    fs.writeFileSync(bootstrap, `require(${JSON.stringify(worker)}).runCli(${JSON.stringify(options)});`);
    const child = spawn(process.execPath, [bootstrap], { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    let stdout = "", stderr = "";
    child.stdout.on("data", d => stdout += d); child.stderr.on("data", d => stderr += d);
    const closed = new Promise<void>(resolve => child.on("close", () => resolve()));
    try {
      child.stdin.write(JSON.stringify(input(workspace)) + "\n");
      for (let n = 0; n < 100 && !fs.existsSync(path.join(workspace, "started.pid")); n++) await sleep(10);
      assert.ok(fs.existsSync(path.join(workspace, "started.pid")), "worker waited for EOF before launching");
      child.stdin.write(JSON.stringify({ kind: "cancel" }) + "\n");
      await closed;
      const records = stdout.trim().split("\n").map(line => JSON.parse(line));
      assert.equal(records.at(-1)?.kind, "result"); assert.equal(records.at(-1)?.result.error, "cancelled");
      assert.equal(records.filter(record => record.kind === "result").length, 1); assert.equal(stderr, "");
    } finally { child.kill(); }
  });
});

it("OpenCode CLI cancels an owned execution when the trusted Hermes parent disappears", { timeout: 10000 }, async () => {
  await fixture(`const {spawn}=require('node:child_process');
    const descendant=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore',windowsHide:true});
    require('node:fs').writeFileSync('owned.pid',String(descendant.pid)); setInterval(()=>{},1000);`, async (workspace, options) => {
    const bootstrap = path.join(workspace, "wrapper.cjs");
    fs.writeFileSync(bootstrap, `require(${JSON.stringify(worker)}).runCli(${JSON.stringify(options)});`);
    const launcher = path.join(workspace, "launcher.cjs");
    fs.writeFileSync(launcher, `const fs=require('node:fs');const path=require('node:path');const {spawn}=require('node:child_process');
      const output=fs.openSync(${JSON.stringify(path.join(workspace, "wrapper.jsonl"))},'w');
      const errors=fs.openSync(${JSON.stringify(path.join(workspace, "wrapper.stderr"))},'w');
      const child=spawn(process.execPath,[${JSON.stringify(bootstrap)}],{windowsHide:true,detached:true,stdio:['pipe',output,errors],
        env:{...process.env,OFFICECODE_HERMES_PARENT_PID:String(process.pid)}});
      fs.writeFileSync(${JSON.stringify(path.join(workspace, "wrapper.pid"))},String(child.pid));
      child.stdin.write(${JSON.stringify(JSON.stringify(input(workspace)) + "\n")});
      child.on('close',()=>process.exit(1));
      const poll=setInterval(()=>{if(fs.existsSync(${JSON.stringify(path.join(workspace, "owned.pid"))})) process.exit(0);},10);`);
    const parent = spawn(process.execPath, [launcher], { stdio: "ignore", windowsHide: true });
    const parentCode = await new Promise<number | null>(resolve => parent.on("close", code => resolve(code)));
    const resultFile = path.join(workspace, "wrapper.jsonl");
    let records: Event[] = [];
    for (let n = 0; n < 250; n++) {
      try { records = fs.readFileSync(resultFile, "utf8").trim().split("\n").filter(Boolean).map(line => JSON.parse(line)); } catch { /* incomplete write */ }
      if (records.some(record => record.kind === "result")) break;
      await sleep(20);
    }
    assert.equal(parentCode, 0);
    assert.equal(records.at(-1)?.result?.error, "cancelled");
    assert.equal(fs.readFileSync(path.join(workspace, "wrapper.stderr"), "utf8"), "");
    const descendant = Number(fs.readFileSync(path.join(workspace, "owned.pid"), "utf8"));
    assert.throws(() => process.kill(descendant, 0), /ESRCH/);
  });
});

it("OpenCode CLI cleans up after its output reader closes without leaking a raw pipe error", { timeout: 10000 }, async () => {
  await fixture(`${emit} require('node:fs').writeFileSync('owned.pid',String(process.pid));
    setInterval(()=>emit({type:'reasoning',sessionID:'ses_pipe',part:{text:'PRIVATE'}}),30);`, async (workspace, options) => {
    const bootstrap = path.join(workspace, "wrapper.cjs");
    fs.writeFileSync(bootstrap, `require(${JSON.stringify(worker)}).runCli(${JSON.stringify(options)});`);
    const child = spawn(process.execPath, [bootstrap], { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    let stderr = ""; child.stderr.on("data", d => stderr += d);
    const closed = new Promise<void>(resolve => child.on("close", () => resolve()));
    try {
      child.stdin.write(JSON.stringify(input(workspace)) + "\n");
      for (let n = 0; n < 100 && !fs.existsSync(path.join(workspace, "owned.pid")); n++) await sleep(10);
      assert.ok(fs.existsSync(path.join(workspace, "owned.pid")));
      const pid = Number(fs.readFileSync(path.join(workspace, "owned.pid"), "utf8"));
      child.stdout.destroy(); await closed;
      assert.equal(stderr, ""); assert.throws(() => process.kill(pid, 0), /ESRCH/);
    } finally { child.kill(); }
  });
});
