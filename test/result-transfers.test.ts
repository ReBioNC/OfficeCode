import { it } from "node:test";
import assert from "node:assert/strict";
import { completionTransfers, transferPoint } from "../src/dashboard/result-transfers";

const parent = { id: "parent-turn", sessionId: "parent", role: "plan", prompt: "Feature", state: "thinking" };
const child = { id: "child-turn", sessionId: "child", parentSessionId: "parent", role: "build", prompt: "Implement", state: "acting" };
const positions = new Map([["child", { x: 181, y: 644 }], ["parent", { x: 980, y: 750 }]]);
it("creates one result only for an observed successful child completion toward its real active parent", () => {
  const results = completionTransfers([parent, child], [parent, { ...child, state: "done" }], positions);
  assert.deepEqual(results, [{ childId: child.id, parentId: parent.id, from: { x: 181, y: 644 }, to: { x: 980, y: 750 } }]);
});
it("does not invent transfers on first load, duplicate snapshots, failures, missing links or absent parents", () => {
  const done = { ...child, state: "done" };
  assert.deepEqual(completionTransfers([], [parent, done], positions), []);
  assert.deepEqual(completionTransfers([parent, done], [parent, done], positions), []);
  assert.deepEqual(completionTransfers([parent, child], [parent, { ...child, state: "blocked" }], positions), []);
  assert.deepEqual(completionTransfers([child], [done], positions), []);
  assert.deepEqual(completionTransfers([parent, child], [{ ...parent, state: "done" }, done], positions), []);
  assert.deepEqual(completionTransfers([parent, child], [parent, { ...done, parentSessionId: undefined }], positions), []);
  assert.deepEqual(completionTransfers([parent, child], [parent, done], new Map()), []);
});
it("uses turn identities so a new turn cannot replay or redirect an old result", () => {
  assert.deepEqual(completionTransfers([parent, child], [parent, { ...child, id: "next-turn", state: "done" }], positions), []);
  assert.deepEqual(completionTransfers([parent, child], [{ ...parent, id: "new-parent-turn" }, { ...child, state: "done" }], positions), []);
});
it("keeps the packet at its endpoints and lifts it smoothly above the floor between them", () => {
  const a = { x: 100, y: 600 }, b = { x: 500, y: 600 };
  assert.deepEqual(transferPoint(a, b, 0), a);
  assert.deepEqual(transferPoint(a, b, 1), b);
  assert.deepEqual(transferPoint(a, b, -1), a);
  assert.deepEqual(transferPoint(a, b, 2), b);
  const middle = transferPoint(a, b, .5);
  assert.equal(middle.x, 300);
  assert.ok(middle.y < 600);
});
