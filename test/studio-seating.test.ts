import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { allocateStudioSeats, studioGeometry, type StudioAgent } from "../src/dashboard/studio-seating.js";
import { planRoute } from "../src/dashboard/agent-motion.js";
import { STUDIO_OBSTACLES } from "../src/dashboard/studio-map.js";

describe("studio crowd seating", () => {
  it("gives eight simultaneous planners different seats", () => {
    const agents: StudioAgent[] = Array.from({ length: 8 }, (_, i) => ({ id: `planner-${i}`, station: i === 0 ? "delegating" : "thinking" }));
    const seats = allocateStudioSeats(agents);
    assert.equal(new Set([...seats.values()].map((s) => `${s.point.x},${s.point.y}`)).size, 8);
  });
  it("keeps remaining sessions at their seats when an earlier session completes or input order changes", () => {
    const agents: StudioAgent[] = Array.from({ length: 6 }, (_, i) => ({ id: `agent-${i}`, station: "editing" }));
    const before = allocateStudioSeats(agents);
    const after = allocateStudioSeats(agents.slice(1).reverse(), before);
    for (const agent of agents.slice(1)) assert.deepEqual(after.get(agent.id), before.get(agent.id));
  });
  it("keeps ten readers inside reachable studio spaces rather than spilling into other furniture", () => {
    const seats = allocateStudioSeats(Array.from({ length: 10 }, (_, i) => ({ id: `reader-${i}`, station: "reading" })));
    for (const seat of seats.values()) assert.ok(planRoute({ x: 200, y: 292 }, seat.point, STUDIO_OBSTACLES), `unreachable ${JSON.stringify(seat.point)}`);
  });
  it("extends the studio with reachable desks instead of recycling occupied places in a large crowd", () => {
    const seats = allocateStudioSeats(Array.from({ length: 32 }, (_, i) => ({ id: `crowd-${i}`, station: "thinking" })));
    const geometry = studioGeometry(seats);
    assert.equal(new Set([...seats.values()].map((seat) => seat.id)).size, 32);
    assert.ok(geometry.height > 560);
    for (const seat of seats.values()) assert.ok(planRoute({ x: 200, y: 292 }, seat.point, geometry.obstacles, geometry.height - 24), `unreachable ${seat.id}`);
  });
  it("moves only the agent changing activity and reuses a completed session's place", () => {
    const agents: StudioAgent[] = [{ id: "a", station: "thinking" }, { id: "b", station: "thinking" }, { id: "c", station: "thinking" }];
    const before = allocateStudioSeats(agents);
    const after = allocateStudioSeats([{ id: "b", station: "thinking" }, { id: "c", station: "terminal" }, { id: "d", station: "thinking" }], before);
    assert.deepEqual(after.get("b"), before.get("b"));
    assert.equal(after.get("d")?.id, before.get("a")?.id);
    assert.notEqual(after.get("c")?.id, before.get("c")?.id);
  });
});
