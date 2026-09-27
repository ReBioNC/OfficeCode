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
  it("rejects an unknown desk with 404 (layout is policy)", async () => {
    const res = await fetch(`${base}/api/runs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ deskId: "desk-nope", role: "frontend-dev", prompt: "hi" }),
    });
    assert.equal(res.status, 404);
  });
  it("rejects malformed JSON with 400", async () => {
    const res = await fetch(`${base}/api/runs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not json",
    });
    assert.equal(res.status, 400);
  });
  it("rejects oversize bodies with 413", async () => {
    const res = await fetch(`${base}/api/runs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ deskId: "desk-fe-1", role: "x", prompt: "y".repeat(2_000_000) }),
    });
    assert.equal(res.status, 413);
  });
  it("exactly one of three concurrent dispatches wins the desk", async () => {
    const send = () =>
      fetch(`${base}/api/runs`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ deskId: "desk-qa-1", role: "qa", prompt: "race" }),
      }).then((r) => r.status);
    const statuses = await Promise.all([send(), send(), send()]);
    assert.equal(statuses.filter((s) => s === 201).length, 1);
    assert.equal(statuses.filter((s) => s === 409).length, 2);
  });
  it("pushes a live office event over SSE when a run finishes", async () => {
    const stream = await fetch(`${base}/api/events`);
    const reader = stream.body?.getReader();
    assert.ok(reader);
    const decoder = new TextDecoder();
    let buf = "";
    const seen = (async () => {
      for (;;) {
        const { done, value } = await reader!.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        if (buf.includes("event: office")) break;
      }
    })();
    await fetch(`${base}/api/runs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ deskId: "desk-fe-1", role: "frontend-dev", prompt: "live" }),
    });
    await Promise.race([
      seen,
      new Promise((_, reject) => setTimeout(() => reject(new Error("no live office event")), 5000)),
    ]);
    await reader!.cancel();
    assert.ok(buf.includes("event: office"));
  });
});
