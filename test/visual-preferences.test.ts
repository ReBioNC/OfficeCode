import { it } from "node:test";
import assert from "node:assert/strict";
import { normalizePreferences, loadPreferences, savePreferences, chosenPeriod, motionPolicy } from "../src/dashboard/visual-preferences";
it("defaults to clock themes and preserves only valid visual options", () => {
  assert.deepEqual(normalizePreferences(null), { theme: "auto", motion: "full", labels: "normal", bubbles: true });
  assert.equal(normalizePreferences({ theme: "night", bubbles: false, motion: "off", labels: "large" }).bubbles, false);
  assert.equal(normalizePreferences({ theme: "unknown", motion: 5, labels: "huge", bubbles: "false" }).theme, "auto");
  assert.equal(chosenPeriod(normalizePreferences({ theme: "night" }), new Date(2026, 9, 6, 8)), "night");
  assert.equal(chosenPeriod(normalizePreferences(null), new Date(2026, 9, 6, 8)), "morning");
});
it("survives blocked/corrupt storage and persists explicit choices", () => {
  const blocked = { getItem() { throw Error("blocked"); }, setItem() { throw Error("blocked"); } };
  assert.equal(loadPreferences(blocked).theme, "auto");
  assert.doesNotThrow(() => savePreferences(blocked, normalizePreferences(null)));
  let value = "bad JSON";
  const storage = { getItem() { return value; }, setItem(_key: string, data: string) { value = data; } };
  assert.equal(loadPreferences(storage).bubbles, true);
  savePreferences(storage, normalizePreferences({ theme: "evening" }));
  assert.equal(loadPreferences(storage).theme, "evening");
});
it("honors system reduced motion regardless of visual settings", () => {
  assert.deepEqual(motionPolicy("full", true), { travel: false, animate: false, interval: 250 });
  assert.equal(motionPolicy("reduced", false).travel, false);
  assert.equal(motionPolicy("reduced", false).animate, true);
  assert.equal(motionPolicy("off", false).animate, false);
  assert.equal(motionPolicy("full", false).travel, true);
});
