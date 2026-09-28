import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  BOARD_MAP,
  CHAR_FRAMES,
  COMPUTER_MAP,
  DESK_MAP,
  PRINTER_MAP,
  RACK_MAP,
  SOFA_MAP,
  TABLE_MAP,
  agentPalette,
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
  ["computer", COMPUTER_MAP],
  ["printer", PRINTER_MAP],
  ["board", BOARD_MAP],
  ["rack", RACK_MAP],
  ["sofa", SOFA_MAP],
  ["table", TABLE_MAP],
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

describe("agentPalette", () => {
  it("keeps an agent's appearance stable and its role color consistent", () => {
    const first = agentPalette("build", "session-alpha");
    assert.deepEqual(agentPalette("build", "session-alpha"), first);
    assert.equal(first.C, agentPalette("build", "session-beta").C);
    assert.notDeepEqual(
      { skin: first.S, hair: first.H },
      { skin: agentPalette("build", "session-beta").S, hair: agentPalette("build", "session-beta").H },
    );
  });
});
