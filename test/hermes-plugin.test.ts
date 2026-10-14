import { it } from "node:test";
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

const root = process.cwd();
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

it("Hermes observer preserves host behavior and projects concurrent tools, delegation and turn boundaries", () => {
  execFileSync(process.env["OFFICECODE_PYTHON"] || (process.platform === "win32" ? "python" : "python3"),
    ["-B", "test/hermes_adapter_test.py"], { cwd: root, timeout: 20_000 });
});

it("Hermes bridge retries failed completion and rehydrates a recreated owner lease", { timeout: 20_000 }, async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "office-hermes-retry-"));
  const home = path.join(temp, "profile");
  fs.mkdirSync(home);
  const key = crypto.createHash("sha256").update(process.platform === "win32" ? home.toLowerCase() : home).digest("hex").slice(0, 16);
  let finishAttempts = 0;
  let hasAgent = false;
  let failNextLease = false;
  let leaseFailed = false;
  let recreateNextLease = false;
  const server = createServer((req, res) => {
    req.resume();
    res.setHeader("content-type", "application/json");
    if (req.url === "/api/health") res.end(JSON.stringify({ ok: true, service: "officecode", workspace: home, mirrorOnly: true, leaseManaged: true }));
    else if (req.url === "/api/lease" && req.method === "POST" && failNextLease) {
      failNextLease = false; leaseFailed = true; res.statusCode = 503; res.end('{}');
    }
    else if (req.url === "/api/lease" && req.method === "POST" && recreateNextLease) {
      recreateNextLease = false; res.end('{"created":true}');
    }
    else if (req.url === "/api/mirror/session") { hasAgent = true; res.end('{}'); }
    else if (req.url === "/api/mirror/finish") {
      finishAttempts++;
      if (finishAttempts === 1) { res.statusCode = 503; res.end('{}'); }
      else { hasAgent = false; res.end('{}'); }
    } else res.end('{}');
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const dir = path.join(temp, "OfficeCode/projects", key);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "connection.json"), JSON.stringify({ workspace: home, url }));
  const child = spawn(process.execPath, [path.join(root, "scripts/hermes-bridge.cjs")], {
    env: { ...process.env, LOCALAPPDATA: temp, OFFICECODE_HERMES_HOME: home, OFFICECODE_NO_SPAWN: "1" },
    stdio: ["pipe", "ignore", "ignore"], windowsHide: true,
  });
  try {
    child.stdin.write(JSON.stringify({ sessionId: "main", state: "thinking", prompt: "Work", activeTools: [] }) + "\n");
    const deadline = Date.now() + 15000;
    while (!hasAgent && Date.now() < deadline) await sleep(50);
    assert.equal(hasAgent, true);
    child.stdin.write(JSON.stringify({ sessionId: "main", outcome: "done" }) + "\n");
    while (hasAgent && Date.now() < deadline) await sleep(50);
    assert.equal(hasAgent, false, "failed completion must retry and remove the character");
    assert.equal(finishAttempts, 2);
    child.stdin.write(JSON.stringify({ sessionId: "main", state: "thinking", prompt: "Next", activeTools: [] }) + "\n");
    while (!hasAgent && Date.now() < deadline) await sleep(25);
    assert.equal(hasAgent, true);
    // Another owner kept the server alive, but our lease and quiet actor expired.
    hasAgent = false; recreateNextLease = true;
    while ((recreateNextLease || !hasAgent) && Date.now() < deadline) await sleep(25);
    assert.equal(hasAgent, true, "renewal must rehydrate quiet actors without new telemetry");
    failNextLease = true;
    while (!leaseFailed && Date.now() < deadline) await sleep(25);
    assert.equal(leaseFailed, true);
    child.stdin.end();
    while (hasAgent && Date.now() < deadline) await sleep(25);
    assert.equal(hasAgent, false, "shutdown cleans up even after renewal cleared transport tracking");
  } finally {
    child.stdin.end(); child.kill();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

it("Hermes bridge mirrors real event fixtures without model dispatch and closes with its parent pipe", { timeout: 30_000 }, async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "office-hermes-"));
  const home = path.join(temp, "profile");
  fs.mkdirSync(home);
  const key = crypto.createHash("sha256").update(process.platform === "win32" ? home.toLowerCase() : home).digest("hex").slice(0, 16);
  const registration = path.join(temp, "OfficeCode/projects", key, "connection.json");
  const child = spawn(process.execPath, [path.join(root, "scripts/hermes-bridge.cjs")], {
    env: { ...process.env, LOCALAPPDATA: temp, OFFICECODE_HERMES_HOME: home,
      OFFICECODE_PORT: "0", OFFICECODE_NO_SPAWN: "0", OFFICECODE_DRIVER: "mock", OFFICECODE_NODE: process.execPath },
    stdio: ["pipe", "pipe", "pipe"], windowsHide: true,
  });
  let errors = "";
  child.stderr.on("data", (data) => { errors += String(data); });
  let url = "";
  const emit = (data: Record<string, unknown>) => child.stdin.write(JSON.stringify(data) + "\n");
  async function waitFor<T>(read: () => Promise<T>, check: (value: T) => boolean): Promise<T> {
    const deadline = Date.now() + 12_000;
    while (Date.now() < deadline) {
      try { const value = await read(); if (check(value)) return value; } catch { /* startup */ }
      await sleep(60);
    }
    assert.fail(`Hermes bridge did not converge: ${errors}`);
  }
  const runs = async () => (await (await fetch(url + "/api/runs")).json()).runs as Array<any>;
  try {
    assert.equal(fs.existsSync(registration), false);
    emit({ sessionId: "main", role: "hermes", prompt: "Build the feature", state: "thinking", activity: "thinking", detail: "Planning", activeTools: [] });
    url = await waitFor(async () => JSON.parse(fs.readFileSync(registration, "utf8")).url as string, (value) => !!value);
    for (let i = 0; i < 8; i++) emit({ sessionId: `child-${i}`, parentSessionId: "main", role: "frontend-dev", prompt: "Implement", state: "acting", activity: "editing", detail: "Editing app.ts", activeTools: [] });
    const active = await waitFor(runs, (value) => value.filter((run) => run.state === "acting").length === 8);
    const parent = active.find((run) => run.role === "hermes")!;
    assert.equal(active.filter((run) => run.parentSessionId === parent.sessionId).length, 8);
    assert.match(parent.sessionId, /^hermes:/);
    const info = await (await fetch(url + "/api/health")).json();
    assert.equal(info.activeLeases, 1);
    assert.equal(info.mirrorOnly, true);
    // Kill only the sidecar this temporary test started; quiet children must reappear.
    process.kill(info.pid);
    emit({ sessionId: "main", role: "hermes", prompt: "Build the feature", state: "thinking", activity: "thinking", detail: "After restart", activeTools: [] });
    await waitFor(runs, (value) => value.filter((run) => run.state === "acting").length === 8
      && value.some((run) => run.detail === "After restart"));
    assert.equal((await fetch(url + "/api/runs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ deskId: "FE-1", role: "frontend-dev", prompt: "Must never run" }) })).status, 403);
    for (let i = 0; i < 8; i++) emit({ sessionId: `child-${i}`, outcome: i === 7 ? "blocked" : "done" });
    emit({ sessionId: "main", outcome: "done" });
    await waitFor(runs, (value) => value.every((run) => ["done", "blocked"].includes(run.state)));
    emit({ sessionId: "main", role: "hermes", prompt: "Next turn", state: "thinking", activity: "thinking", detail: "Planning", activeTools: [] });
    await waitFor(runs, (value) => value.some((run) => run.prompt === "Next turn" && run.state === "thinking"));
    emit({ sessionId: "main", outcome: "done" });
    emit({ sessionId: "main", role: "hermes", prompt: "Rapid next turn", state: "thinking", activity: "thinking", detail: "Planning", activeTools: [] });
    emit({ sessionId: "main", outcome: "done" });
    await waitFor(runs, (value) => value.some((run) => run.prompt === "Next turn" && run.state === "done")
      && value.some((run) => run.prompt === "Rapid next turn" && run.state === "done"));
    child.stdin.end();
    await waitFor(async () => { try { await fetch(url + "/api/health", { signal: AbortSignal.timeout(300) }); return false; } catch { return true; } }, Boolean);
    assert.equal(errors, "");
  } finally {
    child.stdin.destroy(); child.kill();
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
