import { it } from "node:test";
import assert from "node:assert/strict";
import { attentionFor, attentionRuns } from "../src/dashboard/agent-attention";
const run = { id: "a", sessionId: "s", role: "build", prompt: "Feature", state: "thinking" };
it("prioritizes permission and stopped runs over tool failures", () => {
  assert.equal(attentionFor({ ...run, state: "waiting-approval" })?.kind, "permission");
  assert.equal(attentionFor({ ...run, state: "blocked", detail: "CLI unavailable" })?.detail, "CLI unavailable");
  assert.equal(attentionFor({ ...run, state: "done" }), undefined);
});
it("reports actual failed tool outcomes until a newer outcome succeeds", () => {
  const error = { at: "2026-10-06T10:00:00Z", state: "acting", activity: "terminal", detail: "Running tests", outcome: "error" as const };
  assert.equal(attentionFor({ ...run, timeline: [error] })?.kind, "tool-error");
  assert.equal(attentionFor({ ...run, timeline: [error, { ...error, outcome: "completed" }] }), undefined);
  assert.equal(attentionFor({ ...run, detail: "error.ts" }), undefined);
});
it("does not resurface a prior turn's error after a session resumes", () => {
  assert.equal(attentionRuns([{ ...run, state: "blocked" }, { ...run, id: "new", state: "acting" }]).length, 0);
  assert.equal(attentionRuns([{ ...run, state: "blocked" }]).length, 1);
});
