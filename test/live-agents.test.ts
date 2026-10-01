import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { selectVisibleAgents } from "../src/dashboard/live-agents.js";

describe("visible OpenCode agents", () => {
  it("clears the floor when the last task finishes", () => {
    assert.deepEqual(selectVisibleAgents([{ sessionId: "s1", state: "done" }]), []);
  });
  it("uses the latest turn and keeps agents waiting for permission visible", () => {
    const active = { sessionId: "s1", state: "acting" };
    const waiting = { sessionId: "s2", state: "waiting-approval" };
    assert.deepEqual(selectVisibleAgents([
      { sessionId: "s1", state: "done" }, active, waiting,
      { sessionId: "s3", state: "acting" }, { sessionId: "s3", state: "done" },
      { sessionId: "s4", state: "blocked" }, { state: "acting" },
    ]), [active, waiting]);
  });
});
