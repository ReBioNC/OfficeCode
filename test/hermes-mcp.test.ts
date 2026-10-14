import { it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { spawn } from "node:child_process";

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
it("Hermes MCP startup creates no actors, shares leases, speaks only JSON and closes with its hosts", { timeout: 25_000 }, async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "office-mcp-"));
  const home = path.join(temp, "profile");
  const studio = path.join(temp, "project");
  fs.mkdirSync(path.join(home, "plugins/officecode"), { recursive: true }); fs.mkdirSync(studio);
  fs.writeFileSync(path.join(home, "plugins/officecode/office-dashboard.json"), JSON.stringify({ root: process.cwd(), studioWorkspace: studio }));
  const clients: ReturnType<typeof spawn>[] = [];
  const start = () => {
    const child = spawn(process.execPath, ["scripts/hermes-mcp.cjs"], {
      env: { ...process.env, HERMES_HOME: home, LOCALAPPDATA: temp, OFFICECODE_NO_SPAWN: "0", OFFICECODE_PORT: "0" },
      stdio: ["pipe", "pipe", "pipe"], windowsHide: true,
    });
    clients.push(child);
    let id = 0;
    const pending = new Map<number, (value: any) => void>();
    let error = "";
    child.stderr!.on("data", (data) => { error += data; });
    const lines = readline.createInterface({ input: child.stdout! });
    lines.on("line", (line) => { const response = JSON.parse(line); pending.get(response.id)?.(response); });
    const rpc = (method: string, params: any = {}) => new Promise<any>((resolve, reject) => {
      const call = ++id;
      const timer = setTimeout(() => reject(new Error(`MCP ${method} timed out: ${error}`)), 12_000);
      pending.set(call, (value) => { clearTimeout(timer); pending.delete(call); resolve(value); });
      child.stdin!.write(JSON.stringify({ jsonrpc: "2.0", id: call, method, params }) + "\n");
    });
    return { child, rpc };
  };
  let url = "";
  const wait = async (check: () => Promise<boolean>) => {
    const deadline = Date.now() + 8000;
    while (Date.now() < deadline) { if (await check()) return; await pause(60); }
    assert.fail("MCP sidecar lease lifecycle did not converge");
  };
  try {
    const first = start();
    const initialized = await first.rpc("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "hermes-test", version: "1" } });
    assert.equal(initialized.result.serverInfo.name, "officecode");
    const listing = await first.rpc("tools/list");
    assert.deepEqual(listing.result.tools.map((tool: any) => tool.name), ["officecode_status"]);
    assert.equal(listing.result.tools[0].annotations.readOnlyHint, true);
    const status = await first.rpc("tools/call", { name: "officecode_status", arguments: {} });
    const info = JSON.parse(status.result.content[0].text);
    assert.equal(info.status, "online");
    assert.equal(info.studioWorkspace, studio);
    url = info.url;
    assert.deepEqual((await (await fetch(url + "/api/runs")).json()).runs, []);
    assert.equal((await (await fetch(url + "/api/health")).json()).activeLeases, 1);
    const second = start();
    await second.rpc("initialize", { protocolVersion: "2024-11-05" });
    const secondStatus = JSON.parse((await second.rpc("tools/call", { name: "officecode_status", arguments: {} })).result.content[0].text);
    assert.equal(secondStatus.url, url);
    await wait(async () => (await (await fetch(url + "/api/health")).json()).activeLeases === 2);
    first.child.stdin!.end();
    await wait(async () => (await (await fetch(url + "/api/health")).json()).activeLeases === 1);
    second.child.stdin!.end();
    await wait(async () => { try { await fetch(url + "/api/health", { signal: AbortSignal.timeout(250) }); return false; } catch { return true; } });
  } finally {
    for (const child of clients) { child.stdin?.destroy(); child.kill(); }
    fs.rmSync(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});
