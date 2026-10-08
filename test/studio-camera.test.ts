import { it } from "node:test";
import assert from "node:assert/strict";
import { clampZoom, zoomScroll, fitZoom, fitProjection, followScroll } from "../src/dashboard/studio-camera.js";

it("keeps zoom bounded and fits tall overflow studios into the available viewport", () => {
  assert.equal(clampZoom(9), 4);
  assert.equal(clampZoom(.01), .2);
  assert.equal(fitZoom(480, 280, 960, 560), .5);
  assert.equal(fitZoom(480, 280, 960, 1120), .25);
  assert.equal(clampZoom(Number.NaN), 1);
});
it("centers a followed point within actual scroll bounds", () => {
  assert.equal(followScroll(500, 400, 1600), 300);
  assert.equal(followScroll(40, 400, 1600), 0);
  assert.equal(followScroll(1500, 400, 1600), 1200);
  assert.equal(followScroll(500, 800, 600), 0);
});
it("fills horizontal space in wide fit while keeping the entire vertical studio visible", () => {
  assert.deepEqual(fitProjection(1800, 760, 1440, 1140, true), { x: 1.25, y: 760 / 1140 });
  assert.deepEqual(fitProjection(480, 280, 960, 560, false), { x: .5, y: .5 });
  assert.equal(fitZoom(360, 240, 1440, 6000), .04, "Fit must go below the manual zoom minimum for tall overflow");
  assert.deepEqual(fitProjection(0, 0, 0, 0, true), { x: 1, y: 1 });
});
it("preserves the pixel under the zoom anchor", () => {
  assert.equal(zoomScroll(100, 200, 1, 2), 400);
  assert.equal(zoomScroll(100, 200, 2, 1), 0);
});
it("keeps zoom controls directional when a tall floor fits below the usual minimum", () => {
  const fit = fitZoom(360, 240, 1440, 6000);
  assert.equal(clampZoom(fit / 1.25, fit), fit);
  assert.equal(clampZoom(fit * 1.25, fit), .05);
});
