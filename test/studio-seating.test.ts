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
    for (const seat of seats.values()) assert.ok(planRoute({ x: 444, y: 1048 }, seat.point, STUDIO_OBSTACLES, 1116), `unreachable ${JSON.stringify(seat.point)}`);
  });
  it("extends the studio with reachable desks instead of recycling occupied places in a large crowd", () => {
    const seats = allocateStudioSeats(Array.from({ length: 48 }, (_, i) => ({ id: `crowd-${i}`, station: "thinking" })));
    const geometry = studioGeometry(seats);
    assert.equal(new Set([...seats.values()].map((seat) => seat.id)).size, 48);
    assert.ok(geometry.height > 1140);
    for (const seat of seats.values()) assert.ok(planRoute({ x: 444, y: 1048 }, seat.point, geometry.obstacles, geometry.height - 24), `unreachable ${seat.id}`);
  });
  it("moves only the agent changing activity and reuses a completed session's place", () => {
    const agents: StudioAgent[] = [{ id: "a", station: "thinking" }, { id: "b", station: "thinking" }, { id: "c", station: "thinking" }];
    const before = allocateStudioSeats(agents);
    const after = allocateStudioSeats([{ id: "b", station: "thinking" }, { id: "c", station: "terminal" }, { id: "d", station: "thinking" }], before);
    assert.deepEqual(after.get("b"), before.get("b"));
    assert.equal(after.get("d")?.id, before.get("a")?.id);
    assert.notEqual(after.get("c")?.id, before.get("c")?.id);
  });
  it("places each activity in its furnished room on the expanded floor", () => {
    const cases: Array<[StudioAgent["station"], number, number, number, number]> = [
      ["reading", 54, 350, 150, 404], ["web-search", 54, 350, 150, 404],
      ["thinking", 414, 790, 150, 404], ["delegating", 414, 790, 150, 404],
      ["editing", 54, 790, 492, 822], ["terminal", 54, 790, 492, 822],
      ["lounge", 858, 1386, 492, 1078],
    ];
    for (const [station, left, right, top, bottom] of cases) {
      const seat = allocateStudioSeats([{ id: "agent", station }]).get("agent")!;
      assert.ok(seat.point.x > left && seat.point.x < right && seat.point.y > top && seat.point.y < bottom, `${station} must use its room`);
    }
  });
  it("connects every activity seat to every other room without cutting through objects", () => {
    const seats = allocateStudioSeats(Array.from({ length: 27 }, (_, i) => ({ id: `visitor-${i}`, station: (["thinking", "reading", "editing", "lounge", "web-search"] as const)[i % 5] })));
    const geometry = studioGeometry(seats);
    for (const seat of seats.values()) {
      const route = planRoute({ x: 444, y: 1048 }, seat.point, geometry.obstacles, geometry.height - 24);
      assert.ok(route, `lobby cannot reach ${seat.id}`);
      let previous = { x: 444, y: 1048 };
      for (const point of route) {
        assert.ok(previous.x === point.x || previous.y === point.y);
        for (const obstacle of geometry.obstacles) {
          const crosses = previous.x === point.x
            ? point.x > obstacle.x && point.x < obstacle.x + obstacle.w && Math.max(point.y, previous.y) > obstacle.y && Math.min(point.y, previous.y) < obstacle.y + obstacle.h
            : point.y > obstacle.y && point.y < obstacle.y + obstacle.h && Math.max(point.x, previous.x) > obstacle.x && Math.min(point.x, previous.x) < obstacle.x + obstacle.w;
          assert.equal(crosses, false, `${seat.id} crosses an obstacle`);
        }
        previous = point;
      }
      assert.deepEqual(previous, seat.point);
    }
  });
});
