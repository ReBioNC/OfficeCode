import { it } from "node:test";
import assert from "node:assert/strict";
import { resolveFocus, hitAgent } from "../src/dashboard/agent-inspector.js";

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
