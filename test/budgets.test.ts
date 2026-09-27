import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadBudgets, saveBudgets, estimateUsd, recordSpend, spentToday, overBudget } from "../src/sidecar/budgets.js";

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "officecode-budget-"));
});

describe("budgets", () => {
  it("estimates cost from chars with a 70/30 in/out split", () => {
    const rates = { testmodel: { inPer1M: 3, outPer1M: 15 } };
    // 4000 chars ≈ 1000 tokens: 700 in, 300 out → 700/1e6*3 + 300/1e6*15 = 0.0021 + 0.0045 = 0.0066
    const est = estimateUsd("testmodel", 4000, rates);
    assert.equal(est.usd, 0.0066);
    assert.equal(est.unknownRate, false);
  });
  it("flags unknown models instead of inventing a rate", () => {
    const est = estimateUsd("nope", 4000, {});
    assert.equal(est.usd, 0);
    assert.equal(est.unknownRate, true);
  });
  it("sums today's spend and detects cap breach", () => {
    const b = loadBudgets(dir);
    assert.equal(spentToday(dir), 0);
    recordSpend(dir, { ts: new Date().toISOString(), runId: "r1", model: "m", chars: 4000, usd: 5, estimated: true });
    assert.equal(spentToday(dir), 5);
    assert.equal(overBudget(dir), false);
    b.dailyUsdCap = 4;
    saveBudgets(dir, b);
    assert.equal(overBudget(dir), true);
  });
});
