import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { stepToward } from "../src/dashboard/agent-motion.js";

describe("stepToward", () => {
  it("moves at a bounded speed and reaches the chair without overshooting", () => {
    assert.deepEqual(stepToward({ x: 0, y: 0 }, { x: 30, y: 40 }, 10), { x: 6, y: 8 });
    assert.deepEqual(stepToward({ x: 24, y: 32 }, { x: 30, y: 40 }, 10), { x: 30, y: 40 });
  });
});
