import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadOffice } from "../src/sidecar/office-store.js";
import { replay } from "../src/sidecar/ledgers.js";
import {
  registerMirrorRun,
  mirrorEvent,
  finishMirrorRun,
  getMirrorRun,
} from "../src/sidecar/runs.js";

let ws: string;
beforeEach(() => {
  ws = fs.mkdtempSync(path.join(os.tmpdir(), "officecode-mirror-"));
  fs.mkdirSync(path.join(ws, ".officecode.sample"), { recursive: true });
  fs.copyFileSync(
    path.join(process.cwd(), ".officecode.sample", "office.json"),
    path.join(ws, ".officecode.sample", "office.json"),
  );
});

describe("mirror", () => {
  it("registers an opencode session on the first free desk", async () => {
    const store = loadOffice(ws);
    const a = await registerMirrorRun(store, ws, { sessionId: "ses-1", role: "build", prompt: "do thing" });
    assert.equal(a.deskId, "desk-fe-1");
    assert.equal(a.state, "walking");
    const b = await registerMirrorRun(store, ws, { sessionId: "ses-2", role: "plan", prompt: "think" });
    assert.notEqual(b.deskId, a.deskId);
  });
  it("streams events into state, transcript, and ledger", async () => {
    const store = loadOffice(ws);
    await registerMirrorRun(store, ws, { sessionId: "ses-1", role: "build", prompt: "do" });
    await mirrorEvent(store, "ses-1", { state: "acting", message: "edit a.ts" });
    const run = getMirrorRun("ses-1");
    assert.ok(run);
    assert.equal(run.state, "acting");
    assert.match(fs.readFileSync(run.transcriptPath, "utf8"), /edit a\.ts/);
    assert.ok(replay(store.dir).some((e) => e.type === "run.state" && e.state === "acting"));
  });
  it("finishing frees the desk and seals the run done", async () => {
    const store = loadOffice(ws);
    const a = await registerMirrorRun(store, ws, { sessionId: "ses-1", role: "build", prompt: "do" });
    await finishMirrorRun(store, "ses-1", "done");
    assert.equal(store.occupants.has(a.deskId), false);
    assert.equal(a.state, "done");
    assert.equal(getMirrorRun("ses-1"), undefined);
  });
  it("rejects events for unknown sessions with 404", async () => {
    const store = loadOffice(ws);
    await assert.rejects(() => mirrorEvent(store, "nope", { state: "acting" }), /404/);
    await assert.rejects(() => finishMirrorRun(store, "nope", "done"), /404/);
  });
});
