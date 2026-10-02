import { it } from "node:test";
import assert from "node:assert/strict";
import { activityBounds, activityWidth, readPanelLayout } from "../src/dashboard/panel-layout";

it("keeps activity readable and reserves room for the studio at desktop widths", () => {
  for (const width of [961, 1000, 1440, 1920, 3840]) {
    const bounds = activityBounds(width);
    for (const ratio of [-1, 0, .1, .32, .6, 1, 2, NaN, Infinity]) {
      const actual = activityWidth(width, ratio);
      assert.ok(actual >= 280 && actual <= bounds.max);
      assert.ok(width - actual - 10 >= 480);
    }
  }
});

it("scales a saved panel proportion with the screen and clamps extreme preferences", () => {
  assert.equal(activityWidth(1440, .32), 460.8);
  assert.equal(activityWidth(1920, .32), 614.4);
  assert.equal(activityWidth(1000, .6), 510);
  assert.equal(activityWidth(1440, .01), 280);
});

it("recovers from damaged or mistyped browser preferences without hiding the activity panel", () => {
  for (const raw of [null, "{broken", "null", "[]", "false", "42", '{"ratio":"0.6","collapsed":"false"}', '{"ratio":0}', '{"ratio":2}']) {
    assert.deepEqual(readPanelLayout(raw), { ratio: .32, collapsed: false });
  }
  assert.deepEqual(readPanelLayout('{"ratio":0.25,"collapsed":true}'), { ratio: .25, collapsed: true });
});
