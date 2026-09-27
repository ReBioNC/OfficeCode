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
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), "officecode-m2-"));
  fs.mkdirSync(path.join(ws, ".officecode.sample"), { recursive: true });
  fs.copyFileSync(
    path.join(process.cwd(), ".officecode.sample", "office.json"),
    path.join(ws, ".officecode.sample", "office.json"),
  );
  process.env["OFFICECODE_DRIVER"] = "mock";
  process.env["OFFICECODE_MAX_CONCURRENT"] = "1";
  const srv = await startServer(ws, 0);
  const addr = srv.server.address() as AddressInfo;
  base = `http://127.0.0.1:${addr.port}`;
  close = srv.close;
});
after(async () => {
  delete process.env["OFFICECODE_DRIVER"];
  delete process.env["OFFICECODE_MAX_CONCURRENT"];
  await close();
});

async function postRun(deskId: string, prompt = "m2"): Promise<number> {
  const res = await fetch(`${base}/api/runs`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ deskId, role: "frontend-dev", prompt }),
  });
  return res.status;
}

describe("m2 api", () => {
  it("rejects unknown roles on PUT /api/models", async () => {
    const res = await fetch(`${base}/api/models`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slots: { ghost: { provider: "x", model: "y", fallbacks: [], weight: 1 } } }),
    });
    assert.equal(res.status, 400);
  });
  it("rejects negative caps on PUT /api/budgets", async () => {
    const res = await fetch(`${base}/api/budgets`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ dailyUsdCap: -1, rates: {} }),
    });
    assert.equal(res.status, 400);
  });
  it("queues excess dispatches with 202 under cap 1", async () => {
    const statuses = await Promise.all([
      postRun("desk-fe-1", "one"),
      postRun("desk-qa-1", "two"),
      postRun("desk-ui-1", "three"),
    ]);
    assert.equal(statuses.filter((s) => s === 201).length, 1);
    assert.equal(statuses.filter((s) => s === 202).length, 2);
    // Pumped mock runs finish in ms, so the queue may already be draining:
    // poll until all three runs are done.
    const deadline = Date.now() + 8000;
    for (;;) {
      const all = (await (await fetch(`${base}/api/runs`)).json()) as { runs: Array<{ state: string }> };
      if (all.runs.filter((r) => r.state === "done").length === 3) break;
      assert.ok(Date.now() < deadline, "queued runs never completed");
      await new Promise((r) => setTimeout(r, 100));
    }
  });
  it("refuses dispatches with 402 once the cap is hit", async () => {
    const put = await fetch(`${base}/api/budgets`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ dailyUsdCap: 0, rates: {} }),
    });
    assert.equal(put.status, 200);
    assert.equal(await postRun("desk-be-1", "blocked by budget"), 402);
    const restore = await fetch(`${base}/api/budgets`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ dailyUsdCap: 20, rates: {} }),
    });
    assert.equal(restore.status, 200);
  });
});
