import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  CHAR_FRAMES,
  DESK_MAP,
  frameForState,
  snap,
  validateMap,
  type PixelMap,
} from "../src/dashboard/sprites.js";

const allMaps: Array<[string, PixelMap]> = [
  ["idle", CHAR_FRAMES.idle],
  ["walkA", CHAR_FRAMES.walkA],
  ["walkB", CHAR_FRAMES.walkB],
  ["work", CHAR_FRAMES.work],
  ["desk", DESK_MAP],
];

describe("sprite maps", () => {
  it("all rows have equal width and known pixels only", () => {
    for (const [name, map] of allMaps) {
      assert.equal(validateMap(map).ok, true, `${name}: ${JSON.stringify(validateMap(map))}`);
    }
  });
  it("character frames share the same dimensions", () => {
    const h = CHAR_FRAMES.idle.length;
    const w = CHAR_FRAMES.idle[0].length;
    for (const f of [CHAR_FRAMES.walkA, CHAR_FRAMES.walkB, CHAR_FRAMES.work]) {
      assert.equal(f.length, h);
      assert.ok(f.every((r) => r.length === w));
    }
  });
});

describe("frameForState", () => {
  it("alternates walk frames with tick", () => {
    assert.equal(frameForState("walking", 0), "walkA");
    assert.equal(frameForState("walking", 1), "walkB");
    assert.equal(frameForState("delivering", 4), "walkA");
  });
  it("maps work states to work/idle frames", () => {
    assert.equal(frameForState("acting", 0), "work");
    assert.equal(frameForState("thinking", 9), "idle");
    assert.equal(frameForState("blocked", 9), "idle");
    assert.equal(frameForState("done", 9), "idle");
  });
});

describe("snap", () => {
  it("snaps to integer grid for crisp pixels", () => {
    assert.equal(snap(10.6), 11);
    assert.equal(snap(10.2), 10);
  });
});
