import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

describe("xss contract", () => {
  it("dashboard never uses innerHTML", () => {
    const src = fs.readFileSync("src/dashboard/app.ts", "utf8");
    assert.ok(!src.includes("innerHTML"), "app.ts must use textContent only");
    assert.ok(src.includes("textContent"), "app.ts must render text via textContent");
  });
});
