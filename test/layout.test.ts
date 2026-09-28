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
  it("keeps five rooms and their desks inside the floor", () => {
    const rooms = Array.from({ length: 5 }, (_, i) => roomRect(i, 960, 5));
    for (let i = 0; i < rooms.length; i++) {
      const room = rooms[i];
      assert.ok(room.x >= 0 && room.x + room.w <= 960);
      assert.ok(room.y >= 0 && room.y + room.h <= 560);
      for (const point of [0, 1, 2].map((index) => deskPoint(room, index, 3))) {
        assert.ok(point.x >= room.x + 18 && point.x <= room.x + room.w - 18);
        assert.ok(point.y >= room.y + 30 && point.y <= room.y + room.h - 30);
      }
      for (const other of rooms.slice(i + 1)) {
        assert.ok(room.x + room.w <= other.x || other.x + other.w <= room.x || room.y + room.h <= other.y || other.y + other.h <= room.y);
      }
    }
  });
});
