import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getStudioPeriod, recolorStudioPixels } from "../src/dashboard/studio-theme.js";

describe("local studio clock", () => {
  it("switches at local boundaries and wraps through midnight", () => {
    for (const [hour, minute, expected] of [
      [0, 0, "night"], [4, 59, "night"], [5, 0, "morning"], [10, 59, "morning"],
      [11, 0, "day"], [15, 59, "day"], [16, 0, "evening"], [18, 59, "evening"], [19, 0, "night"], [23, 59, "night"],
    ] as const) assert.equal(getStudioPeriod(new Date(2026, 9, 1, hour, minute)), expected, `${hour}:${minute}`);
  });
  it("follows a changed system clock on the next check instead of freezing the initial period", () => {
    assert.equal(getStudioPeriod(new Date(2026, 9, 1, 8)), "morning");
    assert.equal(getStudioPeriod(new Date(2026, 9, 1, 20)), "night");
    assert.equal(getStudioPeriod(new Date(2026, 9, 2, 12)), "day");
  });
});

describe("studio material colors", () => {
  it("preserves the existing night artwork and its transparency", () => {
    const pixels = new Uint8ClampedArray([57, 61, 105, 128, 53, 57, 97, 255]);
    const original = [...pixels];
    recolorStudioPixels(pixels, "night");
    assert.deepEqual([...pixels], original);
  });
  it("keeps textured tiles distinct while leaving role colors and alpha unchanged", () => {
    const pixels = new Uint8ClampedArray([57, 61, 105, 128, 53, 57, 97, 255, 255, 130, 125, 255]);
    recolorStudioPixels(pixels, "morning");
    assert.deepEqual([...pixels.slice(0, 4)], [165, 197, 184, 128]);
    assert.notDeepEqual([...pixels.slice(0, 3)], [...pixels.slice(4, 7)]);
    assert.deepEqual([...pixels.slice(8)], [255, 130, 125, 255]);
  });
});
