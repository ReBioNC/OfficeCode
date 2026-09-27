import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { roomRect, deskPoint } from "../src/dashboard/layout.js";

describe("layout", () => {
  it("places rooms in a row without overlap", () => {
    const a = roomRect(0, 800, 2);
    const b = roomRect(1, 800, 2);
    assert.ok(a.x + a.w <= b.x);
  });
  it("puts desks in a grid inside the room", () => {
    const room = roomRect(0, 800, 2);
    const p0 = deskPoint(room, 0, 3);
    const p2 = deskPoint(room, 2, 3);
    assert.ok(p0.x < p2.x || p0.y < p2.y);
    assert.ok(p0.x >= room.x && p0.x <= room.x + room.w);
  });
});
