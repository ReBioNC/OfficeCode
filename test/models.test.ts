import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadModels, saveModels, DEFAULT_MODELS } from "../src/sidecar/models.js";

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "officecode-models-"));
});

describe("models", () => {
  it("seeds defaults for all 10 roles", () => {
    const m = loadModels(dir);
    for (const role of ["pm", "uiux-designer", "frontend-dev", "backend-dev", "api-dev", "database-dev", "devops", "qa-engineer", "reviewer", "docs-writer"]) {
      assert.ok(m.slots[role], role);
    }
    assert.equal(Object.keys(DEFAULT_MODELS).length, 10);
  });
  it("rejects unknown roles, bad weights, and missing providers on save", () => {
    const m = loadModels(dir);
    assert.throws(
      () => saveModels(dir, { ...m, slots: { ...m.slots, ghost: { provider: "x", model: "y", fallbacks: [], weight: 1 } } }),
      /unknown role/,
    );
    assert.throws(
      () => saveModels(dir, { ...m, slots: { ...m.slots, "qa-engineer": { provider: "", model: "haiku", fallbacks: [], weight: 1 } } }),
      /provider/,
    );
    assert.throws(
      () => saveModels(dir, { ...m, slots: { ...m.slots, "qa-engineer": { provider: "x", model: "haiku", fallbacks: [], weight: 0 } } }),
      /weight/,
    );
  });
  it("allows blank model strings (unassigned slots)", () => {
    const m = loadModels(dir);
    assert.doesNotThrow(() => saveModels(dir, m));
  });
  it("persists round-trip", () => {
    const m = loadModels(dir);
    m.slots["qa-engineer"] = { provider: "anthropic", model: "haiku", fallbacks: ["sonnet"], weight: 0.5 };
    saveModels(dir, m);
    assert.equal(loadModels(dir).slots["qa-engineer"].model, "haiku");
  });
});


