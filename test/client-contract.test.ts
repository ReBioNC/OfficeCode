import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

describe("dashboard SSE contract", () => {
  it("subscribes to named snapshot and office events", () => {
    const src = fs.readFileSync("src/dashboard/app.ts", "utf8");
    assert.ok(src.includes('addEventListener("snapshot"'), "must subscribe to snapshot event");
    assert.ok(src.includes('addEventListener("office"'), "must subscribe to office event");
  });
  it("disables dispatch with a friendly note when the desk is busy", () => {
    const src = fs.readFileSync("src/dashboard/app.ts", "utf8");
    assert.ok(src.includes("is busy"), "must explain busy desks in plain language");
  });
  it("has a models panel that loads and saves slots", () => {
    const src = fs.readFileSync("src/dashboard/app.ts", "utf8");
    assert.ok(src.includes('fetch("/api/models"'), "loads models");
    assert.ok(src.includes('"PUT"'), "saves models");
  });
});
