import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { startServer } from "../src/sidecar/server.js";

async function managedServer() {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "officecode-lease-"));
  const result = await startServer(workspace, 0, { lease: { ttlMs: 400, startupGraceMs: 500, emptyGraceMs: 100 } });
  const port = (result.server.address() as AddressInfo).port;
  return { ...result, url: `http://127.0.0.1:${port}` };
}

async function lease(url: string, method: "POST" | "DELETE", id: string) {
  return fetch(`${url}/api/lease`, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id }),
  });
}

async function waitClosed(url: string, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try { await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(250) }); }
    catch { return; }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.fail("managed server remained online after its last lease ended");
}

describe("managed sidecar lifetime", () => {
  for (const mode of ["release", "expire"] as const) it(`finishes only disconnected owner's characters on ${mode} in a shared studio`, async () => {
    const server = await managedServer();
    const first = "d".repeat(32), second = "e".repeat(32);
    const post = (route: string, body: unknown) => fetch(server.url + route, {method: "POST", headers: {"content-type":"application/json"}, body:JSON.stringify(body)});
    try {
      await lease(server.url, "POST", first); await lease(server.url, "POST", second);
      const sid = `owner-${mode}`, other = `survivor-${mode}`;
      assert.equal((await post('/api/mirror/session', {sessionId:sid,ownerLeaseId:first})).status, 201);
      assert.equal((await post('/api/mirror/session', {sessionId:other,ownerLeaseId:second})).status, 201);
      assert.equal((await post('/api/mirror/session', {sessionId:sid,ownerLeaseId:second})).status, 409);
      assert.equal((await post('/api/mirror/session', {sessionId:'bad',ownerLeaseId:'invalid'})).status, 400);
      if (mode === 'release') await lease(server.url, "DELETE", first);
      else for (let n=0; n<7; n++) {
        await lease(server.url, "POST", second);
        await new Promise(resolve => setTimeout(resolve,100));
      }
      const runs = (await (await fetch(server.url+'/api/runs')).json()).runs;
      assert.equal(runs.find((r: any) => r.sessionId === sid).state, 'blocked');
      assert.equal(runs.find((r: any) => r.sessionId === other).state, 'walking');
      const occupants = (await (await fetch(server.url+'/api/office')).json()).occupants;
      assert.equal(Object.keys(occupants).length, 1);
      assert.equal((await post('/api/mirror/session', {sessionId:sid,ownerLeaseId:first})).status, 409);
      assert.equal((await (await lease(server.url, "POST", second)).json()).created, false);
      assert.equal((await (await lease(server.url, "POST", first)).json()).created, true);
      assert.equal((await post('/api/mirror/session', {sessionId:sid,ownerLeaseId:first})).status, 201);
    } finally { if (server.server.listening) await server.close(); }
  });
  it("stays online while another OpenCode instance holds a lease", async () => {
    const server = await managedServer();
    const first = "a".repeat(32);
    const second = "b".repeat(32);
    try {
      assert.equal((await lease(server.url, "POST", first)).status, 200);
      assert.equal((await lease(server.url, "POST", second)).status, 200);
      assert.equal((await (await fetch(`${server.url}/api/health`)).json()).activeLeases, 2);
      assert.equal((await lease(server.url, "DELETE", first)).status, 200);
      assert.equal((await (await fetch(`${server.url}/api/health`)).json()).activeLeases, 1);
      assert.equal((await fetch(`${server.url}/api/health`)).status, 200);
      assert.equal((await lease(server.url, "DELETE", second)).status, 200);
      await waitClosed(server.url);
    } finally {
      if (server.server.listening) await server.close();
    }
  });

  it("expires a lease when OpenCode exits without cleanup", async () => {
    const server = await managedServer();
    try {
      assert.equal((await lease(server.url, "POST", "c".repeat(32))).status, 200);
      await waitClosed(server.url);
    } finally {
      if (server.server.listening) await server.close();
    }
  });
});
