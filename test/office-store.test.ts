import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { validateOffice } from "../src/shared/office-schema.js";
import { loadOffice } from "../src/sidecar/office-store.js";

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
  it("returns ok:false instead of throwing on malformed shapes", () => {
    assert.doesNotThrow(() => validateOffice({ ...base, rooms: null }));
    assert.equal(validateOffice({ ...base, rooms: null }).ok, false);
    assert.equal(validateOffice("nope").ok, false);
  });
  it("rejects a room pointing at a missing floor", () => {
    const bad = {
      ...base,
      rooms: [{ id: "r1", floorId: "ghost", name: "Frontend", color: "blue", paths: ["web/"], maxDesks: 2 }],
    };
    assert.equal(validateOffice(bad).ok, false);
  });
});

describe("loadOffice fallback", () => {
  it("seeds a built-in office when no sample file exists (foreign project)", () => {
    const ws = fs.mkdtempSync(path.join(os.tmpdir(), "officecode-foreign-"));
    const store = loadOffice(ws);
    assert.ok(store.office.desks.length > 0);
    assert.ok(store.office.rooms.length > 0);
    assert.equal(validateOffice(store.office).ok, true);
  });
});
