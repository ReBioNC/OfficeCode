import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadOffice } from "../src/sidecar/office-store.js";
import { MockDriver } from "../src/sidecar/drivers.js";
import { createRun, listRuns, setOnSettled } from "../src/sidecar/runs.js";
import { enqueueOrRun, pumpQueue, pendingCount, pendingList } from "../src/sidecar/queue.js";

let ws: string;
beforeEach(() => {
  ws = fs.mkdtempSync(path.join(os.tmpdir(), "officecode-q-"));
  fs.mkdirSync(path.join(ws, ".officecode.sample"), { recursive: true });
  fs.copyFileSync(
    path.join(process.cwd(), ".officecode.sample", "office.json"),
    path.join(ws, ".officecode.sample", "office.json"),
  );
});

function armPump(store: ReturnType<typeof loadOffice>, workspace: string): void {
  setOnSettled(() => {
    void pumpQueue(store, workspace, () => new MockDriver(["pumped"]));
  });
}

describe("queue", () => {
  it("queues when at cap and pumps exactly once on settle", async () => {
    const store = loadOffice(ws);
    armPump(store, ws);
    const slow = new MockDriver(new Array(20).fill("tick "));
    const fast = new MockDriver(["ok"]);
    const p1 = createRun(store, ws, slow, { deskId: "desk-fe-1", role: "frontend-dev", prompt: "slow" });
    const q = await enqueueOrRun(store, ws, fast, { deskId: "desk-qa-1", role: "qa", prompt: "queued" }, 1);
    assert.equal(q.queued, true);
    if (q.queued) assert.equal(q.position, 1);
    assert.equal(pendingCount(), 1);
    assert.equal(pendingList()[0].role, "qa");
    const r1 = await p1;
    assert.equal(r1.state, "done");
    const deadline = Date.now() + 5000;
    for (;;) {
      const done = listRuns().find((r) => r.role === "qa" && r.state === "done");
      if (done) break;
      assert.ok(Date.now() < deadline, "queued run never started");
      await new Promise((r) => setTimeout(r, 50));
    }
    assert.equal(pendingCount(), 0);
  });

  it("runs immediately when below cap", async () => {
    const store = loadOffice(ws);
    armPump(store, ws);
    const res = await enqueueOrRun(store, ws, new MockDriver(["fast"]), { deskId: "desk-fe-1", role: "frontend-dev", prompt: "now" }, 8);
    assert.equal(res.queued, false);
  });
});
