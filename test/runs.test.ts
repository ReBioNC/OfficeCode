import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadOffice } from "../src/sidecar/office-store.js";
import { MockDriver } from "../src/sidecar/drivers.js";
import { createRun, getRun } from "../src/sidecar/runs.js";

let ws: string;
beforeEach(() => {
  ws = fs.mkdtempSync(path.join(os.tmpdir(), "officecode-ws-"));
  fs.mkdirSync(path.join(ws, ".officecode.sample"), { recursive: true });
  fs.copyFileSync(
    path.join(process.cwd(), ".officecode.sample", "office.json"),
    path.join(ws, ".officecode.sample", "office.json"),
  );
});

describe("createRun", () => {
  it("runs mock to done with transcript, outbox, ledger", async () => {
    const store = loadOffice(ws);
    const run = await createRun(store, ws, new MockDriver(["hi"]), {
      deskId: "desk-fe-1",
      role: "frontend-dev",
      prompt: "Say hi",
    });
    assert.equal(run.state, "done");
    assert.match(fs.readFileSync(run.transcriptPath, "utf8"), /hi/);
    assert.equal(fs.existsSync(path.join(run.outboxDir, "manifest.json")), true);
    assert.equal(getRun(store, run.id)?.state, "done");
  });

  it("rejects a second run on the occupied desk with 409-style error", async () => {
    const store = loadOffice(ws);
    store.occupants.set("desk-fe-1", "run-existing");
    await assert.rejects(
      () =>
        createRun(store, ws, new MockDriver(["x"]), {
          deskId: "desk-fe-1",
          role: "frontend-dev",
          prompt: "second",
        }),
      /occupied/,
    );
  });

  it("exactly one of two concurrent dispatches wins the desk", async () => {
    const store = loadOffice(ws);
    const driver = new MockDriver(["ok"]);
    const results = await Promise.allSettled([
      createRun(store, ws, driver, { deskId: "desk-qa-1", role: "qa", prompt: "a" }),
      createRun(store, ws, driver, { deskId: "desk-qa-1", role: "qa", prompt: "b" }),
    ]);
    const ok = results.filter((r) => r.status === "fulfilled").length;
    assert.equal(ok, 1);
  });
});
