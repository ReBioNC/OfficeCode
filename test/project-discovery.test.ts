import { it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import http from "node:http";
import { discoverProjects } from "../src/sidecar/project-discovery";
import { localDashboardUrl } from "../src/shared/project-dashboard";

const current = { name: "Current", workspace: path.resolve("current"), url: "http://127.0.0.1:8787", current: true };
function record(root: string, workspace: string, url: string) {
  const key = crypto.createHash("sha256").update(process.platform === "win32" ? workspace.toLowerCase() : workspace).digest("hex").slice(0, 16);
  const directory = path.join(root, key); fs.mkdirSync(directory, { recursive: true });
  const file = path.join(directory, "connection.json"); fs.writeFileSync(file, JSON.stringify({ workspace, url, updatedAt: Date.now() })); return file;
}
async function fakeHealth(value: unknown, status = 200, headers = {}) {
  let requests = 0;
  const server = http.createServer((_req, res) => { requests++; res.writeHead(status, headers); res.end(JSON.stringify(value)); });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  return { url: `http://127.0.0.1:${(server.address() as import("node:net").AddressInfo).port}`, requests: () => requests,
    close: () => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()); }) };
}
it("accepts only literal local dashboard URLs without credentials or redirects", () => {
  assert.equal(localDashboardUrl("http://127.0.0.1:8787/"), current.url);
  for (const value of ["https://example.com", "http://localhost:8787", "http://user@127.0.0.1:8787", "http://127.0.0.1:8787/api/health", "http://127.0.0.1:0", "http://127.0.0.1:65536", "javascript:alert(1)"]) assert.equal(localDashboardUrl(value), undefined);
});
it("lists only verified connected OpenCode dashboards and leaves registration files unchanged", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "office-projects-")); const workspace = path.join(root, "project <img>");
  const good = await fakeHealth({ ok: true, service: "officecode", workspace, mirrorOnly: true, leaseManaged: true, activeLeases: 1 });
  const idleWorkspace = path.join(root, "closed");
  const idle = await fakeHealth({ ok: true, service: "officecode", workspace: idleWorkspace, mirrorOnly: true, leaseManaged: true, activeLeases: 0 });
  const wrong = await fakeHealth({ ok: true, service: "officecode", workspace: "different", mirrorOnly: true, leaseManaged: true, activeLeases: 1 });
  try {
    const file = record(root, workspace, good.url), before = fs.readFileSync(file, "utf8");
    record(root, idleWorkspace, idle.url); record(root, path.join(root, "wrong"), wrong.url);
    record(root, path.join(root, "external"), "http://example.com");
    const projects = await discoverProjects(root, current, 500);
    assert.equal(projects.length, 2); assert.deepEqual(projects[0], current);
    assert.equal(projects[1].workspace, workspace); assert.equal(projects[1].name, "project <img>");
    assert.equal(fs.readFileSync(file, "utf8"), before); assert.equal(good.requests(), 1);
  } finally { await Promise.all([good.close(), idle.close(), wrong.close()]); }
});
it("ignores corrupted, unreachable, redirected and non-OpenCode registrations", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "office-projects-invalid-"));
  const unrelated = await fakeHealth({ ok: true, service: "another-service" });
  const redirect = await fakeHealth({}, 302, { location: "https://example.com" });
  try {
    record(root, path.join(root, "unrelated"), unrelated.url); record(root, path.join(root, "redirect"), redirect.url);
    fs.writeFileSync(record(root, path.join(root, "broken"), current.url), "bad JSON");
    record(root, path.join(root, "missing"), "http://127.0.0.1:1");
    assert.deepEqual(await discoverProjects(root, current, 50), [current]);
    assert.deepEqual(await discoverProjects(path.join(root, "absent"), current, 50), [current]);
  } finally { await Promise.all([unrelated.close(), redirect.close()]); }
});
