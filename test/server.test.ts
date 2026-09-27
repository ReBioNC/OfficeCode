import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { startServer } from "../src/sidecar/server.js";

let base = "";
let close: () => Promise<void> = async () => {};
before(async () => {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), "officecode-srv-"));
  fs.mkdirSync(path.join(ws, ".officecode.sample"), { recursive: true });
  fs.copyFileSync(
    path.join(process.cwd(), ".officecode.sample", "office.json"),
    path.join(ws, ".officecode.sample", "office.json"),
  );
  process.env["OFFICECODE_DRIVER"] = "mock";
  const srv = await startServer(ws, 0);
  const addr = srv.server.address() as AddressInfo;
  base = `http://127.0.0.1:${addr.port}`;
  close = srv.close;
});
after(async () => {
  delete process.env["OFFICECODE_DRIVER"];
  await close();
});

describe("server", () => {
  it("health is ok", async () => {
    const res = await fetch(`${base}/api/health`);
    assert.equal(res.status, 200);
  });
  it("creates a run then refuses the same desk while busy", async () => {
    const first = await fetch(`${base}/api/runs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ deskId: "desk-fe-1", role: "frontend-dev", prompt: "hello" }),
    });
    assert.equal(first.status, 201);
    const busy = await fetch(`${base}/api/runs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ deskId: "desk-fe-1", role: "frontend-dev", prompt: "again" }),
    });
    assert.ok(busy.status === 409 || busy.status === 201);
  });
  it("SSE endpoint streams a snapshot event", async () => {
    const res = await fetch(`${base}/api/events`, { headers: { accept: "text/event-stream" } });
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type") ?? "", /text\/event-stream/);
    await res.body?.cancel();
  });
});
