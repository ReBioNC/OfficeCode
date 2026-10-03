import { it } from "node:test";
import assert from "node:assert/strict";
import { activityVisual, activityPose } from "../src/dashboard/activity-visuals";
import { CHAR_FRAMES, avatarFrame, agentPalette, validateMap } from "../src/dashboard/sprites";

const run = { id: "one", role: "build", prompt: "Feature", state: "acting" };
it("distinguishes actual editing, reading, search, browsing, terminal and planning", () => {
  for (const [activity, expected] of Object.entries({ editing: "editing", reading: "reading", "code-search": "search", "web-search": "web", terminal: "terminal", thinking: "thinking", delegating: "thinking" })) {
    assert.equal(activityVisual({ ...run, activity }), expected);
  }
});
it("shows a testing indicator only for a terminal tool running a recognizable test command", () => {
  for (const detail of ["Running tests", "npm test", "pnpm run test:unit", "node --test test/*.js", "pytest -q", "cargo test", "go test ./...", "vitest run", "dotnet test"]) {
    assert.equal(activityVisual({ ...run, activity: "terminal", detail }), "testing", detail);
  }
  for (const detail of ["git status", "echo npm test", "npm install jest", "cat jest.config.js"]) assert.equal(activityVisual({ ...run, activity: "terminal", detail }), "terminal");
  assert.equal(activityVisual({ ...run, activity: "reading", detail: "Read npm test documentation" }), "reading");
});
it("keeps permission and actual local work ahead of decorative wait/search effects", () => {
  assert.equal(activityVisual({ ...run, state: "waiting-approval", activity: "editing" }, true), "approval");
  assert.equal(activityVisual({ ...run, activity: "delegating", activeTools: [{ id: "read", name: "read", activity: "reading", detail: "file.ts" }] }), "reading");
  assert.equal(activityVisual({ ...run, activity: "delegating" }, true), "waiting");
  assert.equal(activityVisual({ ...run, state: "done", activity: "editing" }), "idle");
});
it("uses reading/checking poses instead of typing for every seated activity", () => {
  assert.notEqual(activityPose("reading", true, 0), activityPose("editing", true, 0));
  assert.notEqual(activityPose("terminal", true, 0), activityPose("editing", true, 0));
  assert.equal(new Set([0, 1, 2, 3].map(phase => activityPose("editing", true, phase))).size, 4);
  for (const kind of ["reading", "search", "web", "testing", "terminal", "editing", "thinking"] as const) {
    for (let phase = 0; phase < 4; phase++) {
      const frame = CHAR_FRAMES[activityPose(kind, true, phase)];
      assert.equal(validateMap(frame).ok, true);
      for (let model = 0; model < 12; model++) {
        const pose = avatarFrame("stable", frame, "south", model);
        assert.equal(pose.length, 14);
        assert.ok(pose.every(row => row.length === 12));
        assert.ok([...pose.join("")].every(pixel => pixel === "." || pixel in agentPalette("build", "stable")));
      }
    }
  }
});
