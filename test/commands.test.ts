import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const COMMANDS = ["office-run", "office-staff", "office-models", "office-queue", "office-budget", "office-status"];

describe("commands", () => {
  it("every command doc exists with a description", () => {
    for (const cmd of COMMANDS) {
      const src = fs.readFileSync(`plugin/commands/${cmd}.md`, "utf8");
      assert.match(src, /description: /);
    }
  });
});
