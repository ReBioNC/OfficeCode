import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { advanceRoute, advanceTimedRoute, planRoute, stepToward } from "../src/dashboard/agent-motion.js";
import { STUDIO_OBSTACLES } from "../src/dashboard/studio-map.js";

describe("stepToward", () => {
  it("moves at a bounded speed and reaches the chair without overshooting", () => {
    assert.deepEqual(stepToward({ x: 0, y: 0 }, { x: 30, y: 40 }, 10), { x: 6, y: 8 });
    assert.deepEqual(stepToward({ x: 24, y: 32 }, { x: 30, y: 40 }, 10), { x: 30, y: 40 });
  });
});

describe("timed walking", () => {
  it("moves the same distance at 30 and 60 frames per second", () => {
    for (const frames of [30, 60]) {
      let point = { x: 80, y: 160 }, route = [{ x: 400, y: 160 }];
      for (let frame = 0; frame < frames; frame++) {
        const next = advanceTimedRoute(point, route, 1000 / frames);
        point = next.point; route = next.route;
      }
      assert.ok(Math.abs(point.x - 200) < .00001, "one second of walking should travel 120px regardless of frame rate");
    }
  });
  it("does not jump after a hidden tab resumes or move twice on a same-time snapshot", () => {
    const route = [{ x: 400, y: 160 }];
    assert.deepEqual(advanceTimedRoute({ x: 80, y: 160 }, route, 0).point, { x: 80, y: 160 });
    assert.ok(advanceTimedRoute({ x: 80, y: 160 }, route, 5000).point.x <= 90);
  });
});

describe("office routes", () => {
  it("takes perpendicular turns instead of cutting diagonally through a desk", () => {
    const from = { x: 80, y: 160 }, to = { x: 240, y: 240 };
    const route = planRoute(from, to, [{ x: 120, y: 140, w: 60, h: 80 }]);
    assert.ok(route);
    let previous = from;
    for (const point of route) {
      assert.ok(previous.x === point.x || previous.y === point.y, "movement must be axis aligned");
      if (previous.y === point.y && point.y > 140 && point.y < 220) {
        assert.ok(Math.max(previous.x, point.x) <= 120 || Math.min(previous.x, point.x) >= 180, "must avoid desk");
      }
      if (previous.x === point.x && point.x > 120 && point.x < 180) {
        assert.ok(Math.max(previous.y, point.y) <= 140 || Math.min(previous.y, point.y) >= 220, "must avoid desk");
      }
      previous = point;
    }
    assert.deepEqual(previous, to);
  });
  it("passes through the doorway rather than the solid wall", () => {
    const from = { x: 80, y: 200 }, to = { x: 300, y: 200 };
    const route = planRoute(from, to, [
      { x: 180, y: 110, w: 12, h: 154 },
      { x: 180, y: 312, w: 12, h: 212 },
    ]);
    assert.ok(route);
    assert.ok(route.some((point) => point.y >= 264 && point.y <= 312), "route must use the doorway");
  });
  it("stops a route at an inaccessible destination", () => {
    assert.equal(planRoute({ x: 80, y: 160 }, { x: 140, y: 180 }, [{ x: 120, y: 140, w: 60, h: 80 }]), null);
  });
  it("connects studio seats through doors without intersecting furniture or partitions", () => {
    const seats = [
      { x: 181, y: 644 }, { x: 391, y: 644 }, { x: 601, y: 644 },
      { x: 181, y: 780 }, { x: 391, y: 780 }, { x: 601, y: 780 },
      { x: 530, y: 380 }, { x: 130, y: 360 }, { x: 947, y: 342 }, { x: 1072, y: 946 },
    ];
    for (const from of seats) for (const to of seats.slice(6)) {
      const route = planRoute(from, to, STUDIO_OBSTACLES);
      assert.ok(route, `unreachable seat ${JSON.stringify({ from, to })}`);
      let previous = from;
      for (const point of route) {
        assert.ok(previous.x === point.x || previous.y === point.y);
        for (const r of STUDIO_OBSTACLES) {
          const crosses = point.x === previous.x
            ? point.x > r.x && point.x < r.x + r.w && Math.max(point.y, previous.y) > r.y && Math.min(point.y, previous.y) < r.y + r.h
            : point.y > r.y && point.y < r.y + r.h && Math.max(point.x, previous.x) > r.x && Math.min(point.x, previous.x) < r.x + r.w;
          assert.equal(crosses, false, `route crosses ${JSON.stringify(r)}`);
        }
        previous = point;
      }
      assert.deepEqual(previous, to);
    }
  });
  it("spends the remaining step along the next straight leg at a corner", () => {
    assert.deepEqual(advanceRoute({ x: 80, y: 160 }, [{ x: 80, y: 240 }, { x: 240, y: 240 }], 100), {
      point: { x: 100, y: 240 }, route: [{ x: 240, y: 240 }], direction: "east",
    });
  });
});
