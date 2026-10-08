import { it } from "node:test";
import assert from "node:assert/strict";
import { exportSize, photoFilename } from "../src/dashboard/photo-export";
it("exports the full studio at its display aspect without viewport crop", () => {
  assert.deepEqual(exportSize(1440, 1140, 2), { width: 2880, height: 1140 });
  assert.deepEqual(exportSize(1440, 1140, 1), { width: 1440, height: 1140 });
});
it("bounds export memory/dimensions for huge annex floors and invalid input", () => {
  const result = exportSize(1440, 20000, 4);
  assert.ok(result.width * result.height <= 16_000_000);
  assert.ok(result.height <= 8192 && result.width <= 8192);
  assert.ok(Math.abs(result.width / result.height - 5760 / 20000) < .001);
  assert.deepEqual(exportSize(0, NaN, Infinity), { width: 1, height: 1 });
});
it("uses a stable safe filename with a local timestamp", () => {
  assert.equal(photoFilename("night", new Date(2026, 9, 8, 9, 5, 2)), "officecode-studio-night-20261008-090502.png");
});
