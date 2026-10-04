import { it } from "node:test";
import assert from "node:assert/strict";
import { roomAt, roomResidents, hitComputer } from "../src/dashboard/studio-interactions";
import { STUDIO_ROOMS } from "../src/dashboard/studio-map";
import { allocateStudioSeats, studioGeometry } from "../src/dashboard/studio-seating";

it("selects all six room interiors while leaving corridors and the outer border unselected", () => {
  for (const room of STUDIO_ROOMS) assert.equal(roomAt({ x: room.x + room.w / 2, y: room.y + room.h / 2 }, 1140)?.id, room.id);
  for (const point of [{ x: 380, y: 300 }, { x: 824, y: 860 }, { x: 40, y: 100 }, { x: 1450, y: 600 }]) assert.equal(roomAt(point, 1140), undefined);
});
it("inspects the real extra workspace only when overflow adds it to the floor", () => {
  assert.equal(roomAt({ x: 181, y: 1256 }, 1412)?.id, "annex");
  assert.equal(roomAt({ x: 181, y: 1256 }, 1140), undefined);
});
it("lists current physical occupants rather than agents merely assigned to arrive later", () => {
  const positions = new Map([["working", { x: 181, y: 644 }], ["arriving", { x: 444, y: 1048 }], ["corridor", { x: 824, y: 860 }]]);
  assert.deepEqual(roomResidents("work", positions, 1140), ["working"]);
  assert.deepEqual(roomResidents("lobby", positions, 1140), ["arriving"]);
  assert.deepEqual(roomResidents("missing", positions, 1140), []);
});
it("links occupied computer screens to their assigned session and reports empty screens without inventing agents", () => {
  const seats = allocateStudioSeats([{ id: "editor", station: "editing" }]);
  assert.equal(hitComputer({ x: 181, y: 564 }, seats, [])?.sessionId, "editor");
  const empty = hitComputer({ x: 391, y: 564 }, seats, []);
  assert.ok(empty);
  assert.equal(empty.sessionId, undefined);
  assert.equal(hitComputer({ x: 181, y: 644 }, seats, []), undefined, "chair is not the monitor");
  assert.equal(hitComputer({ x: 824, y: 860 }, seats, []), undefined);
});
it("supports every occupied overflow monitor using the same desk geometry as rendering", () => {
  const seats = allocateStudioSeats(Array.from({ length: 48 }, (_, i) => ({ id: `agent-${i}`, station: "editing" as const })));
  const geometry = studioGeometry(seats);
  for (const [id, seat] of seats) if (seat.computer) {
    const [x, y] = seat.computer;
    assert.equal(hitComputer({ x: x + 27, y: y - 6 }, seats, geometry.extraDesks)?.sessionId, id);
  }
});
