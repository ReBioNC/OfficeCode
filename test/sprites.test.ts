import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  BOARD_MAP,
  CHAR_FRAMES,
  WALK_FRAMES,
  COMPUTER_MAP,
  DESK_MAP,
  PRINTER_MAP,
  RACK_MAP,
  SOFA_MAP,
  TABLE_MAP,
  agentPalette,
  avatarFrame,
  AVATAR_STYLES,
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
  ["typeA", CHAR_FRAMES.typeA],
  ["typeB", CHAR_FRAMES.typeB],
  ["talkA", CHAR_FRAMES.talkA],
  ["talkB", CHAR_FRAMES.talkB],
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
    for (const f of Object.values(CHAR_FRAMES)) {
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
  it("renders twelve distinct models without losing pose dimensions or direction", () => {
    const looks = AVATAR_STYLES.map((_, index) => avatarFrame(`avatar-${index}`, CHAR_FRAMES.idle, "south", index));
    assert.equal(new Set(looks.map((map) => map.join("\n"))).size, 12);
    for (let model = 0; model < AVATAR_STYLES.length; model++) {
      for (const direction of ["north", "south", "east", "west"] as const) {
        for (const base of WALK_FRAMES[direction]) {
          const map = avatarFrame("stable-session", base, direction, model);
          assert.equal(map.length, 14);
          assert.ok(map.every((row) => row.length === 12));
          assert.ok([...map.join("")].every((pixel) => pixel === "." || pixel in agentPalette("build", "stable-session")));
          if (direction === "north") assert.ok(!map.join("").includes("E"));
        }
      }
    }
    assert.deepEqual(avatarFrame("stable-session", CHAR_FRAMES.idle), avatarFrame("stable-session", CHAR_FRAMES.idle));
    assert.deepEqual(CHAR_FRAMES.idle, allMaps[0][1]);
  });
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

describe("walking frames", () => {
  it("walks with eight distinct poses and faces the travel direction", () => {
    for (const frames of Object.values(WALK_FRAMES)) {
      assert.equal(new Set(frames.map((frame) => frame.join("\n"))).size, 8);
      for (const map of frames) {
        assert.equal(validateMap(map).ok, true);
        assert.equal(map.length, 14);
        assert.ok(map.every((row) => row.length === 12));
      }
    }
    assert.ok(WALK_FRAMES.south[0].some((row) => row.includes("E")));
    assert.ok(!WALK_FRAMES.north[0].some((row) => row.includes("E")), "walking north should show the back of the head");
    assert.deepEqual(WALK_FRAMES.west[0], WALK_FRAMES.east[0].map((row) => [...row].reverse().join("")));
  });
});
