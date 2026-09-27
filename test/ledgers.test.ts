import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { appendEvent, replay } from "../src/sidecar/ledgers.js";
import { makeEvent } from "../src/shared/events.js";

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "officecode-"));
});

describe("ledgers", () => {
  it("appends then replays in order", () => {
    appendEvent(dir, makeEvent(1, "run-1", "run.created", { state: "walking" }));
    appendEvent(dir, makeEvent(2, "run-1", "run.chunk", { message: "hello" }));
    const events = replay(dir);
    assert.equal(events.length, 2);
    assert.equal(events[1].message, "hello");
  });
  it("never rewrites history: second append keeps first line", () => {
    appendEvent(dir, makeEvent(1, null, "office.updated"));
    appendEvent(dir, makeEvent(2, null, "office.updated"));
    const raw = fs.readFileSync(path.join(dir, "events.jsonl"), "utf8").trim().split("\n");
    assert.equal(raw.length, 2);
  });
});
