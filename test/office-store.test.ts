import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { validateOffice } from "../src/shared/office-schema.js";

const base = {
  version: 1,
  building: "HQ",
  floors: [{ id: "floor-1", name: "Webapp", worktree: null }],
  rooms: [{ id: "r1", floorId: "floor-1", name: "Frontend", color: "blue", paths: ["web/"], maxDesks: 2 }],
  desks: [{ id: "d1", roomId: "r1", label: "FE-1" }],
  hallways: [],
  objects: [],
  roster: [],
};

describe("validateOffice", () => {
  it("accepts the sample office", () => {
    assert.equal(validateOffice(base).ok, true);
  });
  it("rejects a desk pointing at a missing room", () => {
    const bad = { ...base, desks: [{ id: "d9", roomId: "nope", label: "X" }] };
    const res = validateOffice(bad);
    assert.equal(res.ok, false);
    assert.match((res as { ok: false; error: string }).error, /room/);
  });
  it("rejects a hallway with unknown endpoint", () => {
    const bad = { ...base, hallways: [{ id: "h", fromRoomId: "r1", toRoomId: "ghost", open: true }] };
    assert.equal(validateOffice(bad).ok, false);
  });
  it("rejects desks over room maxDesks", () => {
    const bad = {
      ...base,
      desks: [
        { id: "d1", roomId: "r1", label: "A" },
        { id: "d2", roomId: "r1", label: "B" },
        { id: "d3", roomId: "r1", label: "C" },
      ],
    };
    assert.equal(validateOffice(bad).ok, false);
  });
});
