import { it } from "node:test";
import assert from "node:assert/strict";
import { taskSummary } from "../src/dashboard/task-summary";
const run = { id: "p", sessionId: "parent", role: "build", prompt: "Feature", state: "done", startedAt: "2026-10-06T10:00:00Z", finishedAt: "2026-10-06T10:01:30Z" };
it("summarizes actual recorded tool outcomes and wall-clock duration", () => {
  const timeline = [
    { at: run.startedAt, state: "acting", activity: "editing", detail: "Editing app.ts" },
    { at: run.startedAt, state: "acting", activity: "editing", detail: "Editing app.ts", outcome: "completed" as const },
    { at: run.startedAt, state: "acting", activity: "terminal", detail: "Running tests", outcome: "error" as const },
  ];
  const summary = taskSummary({ ...run, timeline }, []);
  assert.equal(summary.duration, "1m 30s"); assert.equal(summary.tools, 2); assert.equal(summary.errors, 1);
  assert.deepEqual(summary.activities, { editing: 1, terminal: 1 });
  assert.equal(summary.partial, false);
});
it("counts unique real descendants within this turn, excludes old turns and cycles", () => {
  const child = { ...run, id: "c", sessionId: "child", parentSessionId: "parent", startedAt: "2026-10-06T10:00:05Z" };
  const grandchild = { ...child, id: "g", sessionId: "grandchild", parentSessionId: "child" };
  assert.equal(taskSummary(run, [run, child, child, grandchild, { ...child, id: "old", sessionId: "old", startedAt: "2026-10-06T09:00:00Z" }, { ...run, parentSessionId: "grandchild" }]).subagents, 2);
  assert.equal(taskSummary({ ...run, sessionId: undefined }, [child]).subagents, 0);
});
it("reports missing/partial history honestly and never invents elapsed time", () => {
  assert.equal(taskSummary({ ...run, finishedAt: undefined }, []).duration, "—");
  assert.equal(taskSummary({ ...run, startedAt: "invalid" }, []).duration, "—");
  assert.equal(taskSummary({ ...run, startedAt: "2026-10-07" }, []).duration, "—");
  assert.equal(taskSummary({ ...run, historyTruncated: 10 }, []).partial, true);
  assert.equal(taskSummary(run, []).tools, 0);
});
it("traverses resumed child turns while counting each descendant session once", () => {
  const first = { ...run, id: "first", sessionId: "child", parentSessionId: "parent", startedAt: "2026-10-06T10:00:05Z", finishedAt: "2026-10-06T10:00:10Z" };
  const resumed = { ...first, id: "resumed", startedAt: "2026-10-06T10:00:20Z", finishedAt: "2026-10-06T10:00:30Z" };
  const grandchild = { ...resumed, id: "g", sessionId: "grandchild", parentSessionId: "child", startedAt: "2026-10-06T10:00:25Z" };
  assert.equal(taskSummary(run, [run, first, resumed, grandchild]).subagents, 2);
});
