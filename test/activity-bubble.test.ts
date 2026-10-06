import { it } from "node:test";
import assert from "node:assert/strict";
import { activityBubble } from "../src/dashboard/activity-bubble";

const run = { id: "a", role: "build", prompt: "Private prompt", state: "acting", activity: "editing", detail: "Editing app.ts" };
it("shows actual local tool detail rather than a concurrent delegation or prompt", () => {
  assert.equal(activityBubble(run), "Editing app.ts");
  assert.equal(activityBubble({ ...run, activity: "delegating", detail: "Coordinating", activeTools: [{ id: "r", name: "read", activity: "reading", detail: "Reading README.md" }, { id: "d", name: "task", activity: "delegating", detail: "Delegate" }] }), "Reading README.md");
});
it("keeps permission, completion and delegation waits ahead of stale tool detail", () => {
  assert.equal(activityBubble({ ...run, state: "waiting-approval" }), "Needs permission");
  assert.equal(activityBubble({ ...run, state: "blocked" }), "Needs attention");
  assert.equal(activityBubble({ ...run, state: "done" }), "Done");
  assert.equal(activityBubble(run, "Waiting for 2 agents"), "Waiting for 2 agents");
  assert.equal(activityBubble({ ...run, activity: "thinking", state: "thinking" }), "Thinking…");
});
it("bounds multiline/unicode labels and uses a useful generic fallback", () => {
  assert.equal(activityBubble({ ...run, detail: "Reading\nREADME.md" }), "Reading README.md");
  assert.ok([...activityBubble({ ...run, detail: "🌟".repeat(80) })].length <= 36);
  assert.equal(activityBubble({ ...run, activity: "web-search", detail: "" }), "Searching the web");
  assert.equal(activityBubble({ ...run, activity: "terminal", detail: "Running tests" }), "Running tests");
});
