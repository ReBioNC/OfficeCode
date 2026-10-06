import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

// The dashboard is VISUAL ONLY. All control (dispatch, models, budgets)
// happens from opencode prompts (plugin/commands/*.md). The browser must
// never mutate server state.
describe("dashboard visual-only contract", () => {
  it("subscribes to named snapshot and office events", () => {
    const src = fs.readFileSync("src/dashboard/app.ts", "utf8");
    assert.ok(src.includes('addEventListener("snapshot"'), "must subscribe to snapshot event");
    assert.ok(src.includes('addEventListener("office"'), "must subscribe to office event");
  });
  it("only reads state, never mutates it", () => {
    const src = fs.readFileSync("src/dashboard/app.ts", "utf8");
    for (const route of ["/api/office", "/api/runs", "/api/queue", "/api/budgets"]) {
      assert.ok(src.includes(`"${route}"`), `loads ${route}`);
    }
    assert.ok(src.includes('cache: "no-store"'), "reads fresh API state");
    assert.ok(!src.includes('"PUT"'), "no PUT from dashboard");
    assert.ok(!src.includes('method: "POST"'), "no POST from dashboard");
    assert.ok(!src.includes("<form"), "no forms in dashboard code");
  });
  it("has no dispatch forms and permits only local visual inputs", () => {
    const html = fs.readFileSync("src/dashboard/index.html", "utf8");
    assert.ok(!html.includes("<form"), "sidebar has no forms");
    assert.deepEqual([...html.matchAll(/<input\b[^>]*\bid="([^"]+)"/g)].map(match => match[1]), ["pref-bubbles"], "only the local bubble setting is an input");
    assert.deepEqual([...html.matchAll(/<select\b[^>]*\bid="([^"]+)"/g)].map(match => match[1]), ["pref-theme", "pref-motion", "pref-labels"], "select controls only customize local visuals");
  });
  it("shows role pills and status bubbles in the studio", () => {
    const src = fs.readFileSync("src/dashboard/app.ts", "utf8");
    assert.ok(src.includes("ROLE_PILL"), "role pills drawn");
    assert.ok(src.includes("BUBBLE_TEXT"), "status bubbles drawn");
  });
});
