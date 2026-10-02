import { it } from "node:test";
import assert from "node:assert/strict";
import { resolveFocus, hitAgent, delegationRows } from "../src/dashboard/agent-inspector.js";
import { stepDuration } from "../src/shared/run-history.js";

it("computes elapsed workflow time against the next event or completion", () => {
  const step = { at: "2026-10-02T08:00:00.000Z", state: "acting", activity: "reading", detail: "Read" };
  assert.equal(stepDuration(step, "2026-10-02T08:01:05.000Z"), "1m 5s");
  assert.equal(stepDuration(step, undefined, Date.parse("2026-10-02T08:00:12.000Z")), "12s");
  assert.equal(stepDuration(step, "2026-10-02T07:00:00.000Z"), "0s");
});

it("keeps a selected completed run inspectable without putting it back on the floor", () => {
  const first = { id: "one", state: "done" }, second = { id: "two", state: "acting" };
  assert.equal(resolveFocus([first, second], [second], "one"), first);
  assert.equal(resolveFocus([first, second], [second], "missing"), second);
  assert.equal(resolveFocus([first], [], undefined), first);
  assert.equal(resolveFocus([], [], undefined), undefined);
});

it("selects the frontmost character under the pointer, leaving empty space unselected", () => {
  const positions = [{ id: "back", x: 100, y: 100 }, { id: "front", x: 100, y: 110 }];
  assert.equal(hitAgent(positions, 100, 95), "front");
  assert.equal(hitAgent(positions, 300, 95), undefined);
});

it("orders nested delegations parent first and safely handles missing parents or cycles", () => {
  const runs = [{sessionId:"grandchild",parentSessionId:"child"},{sessionId:"child",parentSessionId:"root"},{sessionId:"root"}];
  assert.deepEqual(delegationRows(runs).map(({run,depth})=>[run.sessionId,depth]),[["root",0],["child",1],["grandchild",2]]);
  assert.equal(delegationRows([{sessionId:"orphan",parentSessionId:"missing"}])[0].depth,1);
  assert.equal(delegationRows([{sessionId:"a",parentSessionId:"b"},{sessionId:"b",parentSessionId:"a"}]).length,2);
});
