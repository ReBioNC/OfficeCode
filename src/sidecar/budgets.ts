import fs from "node:fs";
import path from "node:path";

export interface ModelRate { inPer1M: number; outPer1M: number }
export interface BudgetsDoc {
  version: number;
  dailyUsdCap: number;
  rates: Record<string, ModelRate>;
}
export interface SpendEntry {
  ts: string;
  runId: string;
  model: string;
  chars: number;
  usd: number;
  estimated: true;
}

const DEFAULT_RATES: Record<string, ModelRate> = {
  haiku: { inPer1M: 0.8, outPer1M: 4 },
  sonnet: { inPer1M: 3, outPer1M: 15 },
  opus: { inPer1M: 15, outPer1M: 75 },
};

export function budgetsFile(dir: string): string {
  return path.join(dir, "budgets.json");
}

export function spendFile(dir: string): string {
  return path.join(dir, "spend.jsonl");
}

export function loadBudgets(dir: string): BudgetsDoc {
  fs.mkdirSync(dir, { recursive: true });
  const file = budgetsFile(dir);
  if (!fs.existsSync(file)) {
    const doc: BudgetsDoc = { version: 1, dailyUsdCap: 20, rates: { ...DEFAULT_RATES } };
    fs.writeFileSync(file, JSON.stringify(doc, null, 2), "utf8");
    return doc;
  }
  return JSON.parse(fs.readFileSync(file, "utf8") as string) as BudgetsDoc;
}

export function saveBudgets(dir: string, doc: BudgetsDoc): void {
  if (typeof doc.dailyUsdCap !== "number" || doc.dailyUsdCap < 0) {
    throw new Error("dailyUsdCap must be a number >= 0");
  }
  if (!doc.rates || typeof doc.rates !== "object") throw new Error("rates object required");
  fs.writeFileSync(budgetsFile(dir), JSON.stringify({ version: 1, dailyUsdCap: doc.dailyUsdCap, rates: doc.rates }, null, 2), "utf8");
}

export function estimateUsd(
  model: string,
  chars: number,
  rates: Record<string, ModelRate>,
): { usd: number; unknownRate: boolean } {
  const rate = rates[model];
  if (!rate) return { usd: 0, unknownRate: true };
  const tokens = chars / 4;
  const usd = ((tokens * 0.7) / 1_000_000) * rate.inPer1M + ((tokens * 0.3) / 1_000_000) * rate.outPer1M;
  return { usd: Math.round(usd * 1_000_000) / 1_000_000, unknownRate: false };
}

export function recordSpend(dir: string, entry: SpendEntry): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(spendFile(dir), JSON.stringify(entry) + "\n", "utf8");
}

function readSpend(dir: string): SpendEntry[] {
  const file = spendFile(dir);
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, "utf8")
    .split("\n")
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l) as SpendEntry);
}

export function spentToday(dir: string): number {
  const today = new Date().toISOString().slice(0, 10);
  return readSpend(dir)
    .filter((e) => e.ts.slice(0, 10) === today)
    .reduce((sum, e) => sum + e.usd, 0);
}

export function overBudget(dir: string): boolean {
  return spentToday(dir) >= loadBudgets(dir).dailyUsdCap;
}

export function settleSpend(
  storeDir: string,
  run: { id: string; role: string; transcriptPath: string },
  slotsOf: (dir: string) => { slots: Record<string, { model: string }> },
): void {
  let chars = 0;
  try {
    chars = fs.readFileSync(run.transcriptPath, "utf8").length;
  } catch {
    chars = 0;
  }
  const model = slotsOf(storeDir).slots[run.role]?.model || "unassigned";
  const { usd } = estimateUsd(model, chars, loadBudgets(storeDir).rates);
  recordSpend(storeDir, { ts: new Date().toISOString(), runId: run.id, model, chars, usd, estimated: true });
}
