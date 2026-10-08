import { it } from "node:test";
import assert from "node:assert/strict";
import { featureRoot, featureMembers } from "../src/dashboard/feature-focus";
const root = { id: "root", sessionId: "p", startedAt: "2026-10-08T10:00:00Z" };
const child = { id: "child", sessionId: "c", parentSessionId: "p", startedAt: "2026-10-08T10:00:10Z" };
const grandchild = { id: "grandchild", sessionId: "g", parentSessionId: "c", startedAt: "2026-10-08T10:00:15Z" };
it("finds the real main turn and all nested descendants without unrelated runs", () => {
  const all = [root, child, grandchild, { id: "other", sessionId: "o" }];
  assert.equal(featureRoot(all, "grandchild"), "root");
  assert.deepEqual([...featureMembers(all, "root")], ["root", "child", "grandchild"]);
  assert.equal(featureRoot(all, "missing"), undefined);
});
it("does not move a captured feature to a later root or child turn", () => {
  const finished = { ...root, finishedAt: "2026-10-08T10:01:00Z" };
  const later = { ...root, id: "later", startedAt: "2026-10-08T10:02:00Z" };
  const resumedChild = { ...child, id: "resumed", startedAt: "2026-10-08T10:02:10Z" };
  assert.deepEqual([...featureMembers([finished, child, later, resumedChild], "root")], ["root", "child"]);
  assert.equal(featureRoot([finished, child, later, resumedChild], "resumed"), "later");
});
it("bounds malformed cycles and falls back to a known child when its parent is missing", () => {
  const all = [{ id: "a", sessionId: "a", parentSessionId: "b" }, { id: "b", sessionId: "b", parentSessionId: "a" }];
  assert.ok(featureRoot(all, "a")); assert.equal(featureMembers(all, "a").size, 2);
  assert.equal(featureRoot([child], "child"), "child");
});
