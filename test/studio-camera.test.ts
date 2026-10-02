import { it } from "node:test";
import assert from "node:assert/strict";
import { clampZoom, zoomScroll, fitZoom } from "../src/dashboard/studio-camera.js";

it("keeps zoom bounded and fits tall overflow studios into the available viewport", () => {
  assert.equal(clampZoom(9), 4);
  assert.equal(clampZoom(.01), .2);
  assert.equal(fitZoom(480, 280, 960, 560), .5);
  assert.equal(fitZoom(480, 280, 960, 1120), .25);
  assert.equal(clampZoom(Number.NaN), 1);
});
it("preserves the pixel under the zoom anchor", () => {
  assert.equal(zoomScroll(100, 200, 1, 2), 400);
  assert.equal(zoomScroll(100, 200, 2, 1), 0);
});
