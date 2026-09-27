import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const ROLES = ["pm", "uiux-designer", "frontend-dev", "backend-dev", "api-dev", "database-dev", "devops", "qa-engineer", "reviewer", "docs-writer"];

describe("roles", () => {
  it("every role has an agent file with name + description", () => {
    for (const role of ROLES) {
      const src = fs.readFileSync(`plugin/agents/${role}.md`, "utf8");
      assert.match(src, /name: /);
      assert.match(src, /description: /);
    }
  });
});
