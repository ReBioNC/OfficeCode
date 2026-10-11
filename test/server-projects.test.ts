import { it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import crypto from "node:crypto";
import { startServer } from "../src/sidecar/server";
it("exposes the current project with a real bound URL through a read-only endpoint", async () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "office-server-projects-"));
  const server = await startServer(workspace, 0, { projectsRoot: path.join(workspace, "empty-registry") });
  try {
    const base = `http://127.0.0.1:${(server.server.address() as import("node:net").AddressInfo).port}`;
    const response = await fetch(`${base}/api/projects`); assert.equal(response.status, 200);
    const body = await response.json() as { projects: { name: string; workspace: string; url: string; current: boolean }[] };
    assert.deepEqual(body.projects, [{ name: path.basename(workspace), workspace, url: base, current: true }]);
    const office = await (await fetch(`${base}/api/office`)).json() as { occupants: object };
    assert.deepEqual(office.occupants, {});
  } finally { await server.close(); }
});
it("rechecks the selected target after discovery and removes a dashboard that disconnected", async () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "office-server-project-verify-"));
  const registry = path.join(workspace, "registry"), targetWorkspace = path.join(workspace, "other");
  let checks = 0;
  const target = http.createServer((_req, res) => {
    checks++;
    res.end(JSON.stringify({ ok: true, service: "officecode", workspace: targetWorkspace, mirrorOnly: true, leaseManaged: true, activeLeases: checks === 1 ? 1 : 0 }));
  });
  await new Promise<void>(resolve => target.listen(0, "127.0.0.1", resolve));
  const targetUrl = `http://127.0.0.1:${(target.address() as import("node:net").AddressInfo).port}`;
  const key = crypto.createHash("sha256").update(process.platform === "win32" ? targetWorkspace.toLowerCase() : targetWorkspace).digest("hex").slice(0, 16);
  fs.mkdirSync(path.join(registry, key), { recursive: true });
  fs.writeFileSync(path.join(registry, key, "connection.json"), JSON.stringify({ workspace: targetWorkspace, url: targetUrl }));
  const server = await startServer(workspace, 0, { projectsRoot: registry });
  try {
    const base = `http://127.0.0.1:${(server.server.address() as import("node:net").AddressInfo).port}`;
    const body = await (await fetch(`${base}/api/projects?verify=${encodeURIComponent(targetUrl)}`)).json() as { projects: object[]; verified: boolean };
    assert.equal(checks, 2); assert.equal(body.verified, false); assert.equal(body.projects.length, 1);
    const external = await (await fetch(`${base}/api/projects?verify=${encodeURIComponent("https://example.com")}`)).json() as { verified: boolean };
    assert.equal(external.verified, false);
  } finally {
    await server.close(); target.closeAllConnections(); await new Promise<void>(resolve => target.close(() => resolve()));
  }
});
