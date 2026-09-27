import fs from "node:fs";
import path from "node:path";

export interface ModelSlot { provider: string; model: string; fallbacks: string[]; weight: number }
export interface ModelsDoc { version: number; slots: Record<string, ModelSlot> }

export const ROLES = ["pm", "uiux-designer", "frontend-dev", "backend-dev", "api-dev", "database-dev", "devops", "qa-engineer", "reviewer", "docs-writer"];

function blank(): ModelSlot {
  return { provider: "opencode", model: "", fallbacks: [], weight: 1 };
}

export const DEFAULT_MODELS: Record<string, ModelSlot> = Object.fromEntries(ROLES.map((r) => [r, blank()]));

export function modelsFile(dir: string): string {
  return path.join(dir, "models.json");
}

export function validateModelSlot(role: string, slot: ModelSlot): void {
  if (!ROLES.includes(role)) throw new Error(`unknown role: ${role}`);
  if (!slot.provider || typeof slot.provider !== "string") throw new Error(`role ${role}: provider required`);
  if (typeof slot.model !== "string") throw new Error(`role ${role}: model must be a string ("" = unassigned)`);
  if (!Array.isArray(slot.fallbacks)) throw new Error(`role ${role}: fallbacks must be an array`);
  if (typeof slot.weight !== "number" || slot.weight <= 0) throw new Error(`role ${role}: weight must be > 0`);
}

export function loadModels(dir: string): ModelsDoc {
  fs.mkdirSync(dir, { recursive: true });
  const file = modelsFile(dir);
  if (!fs.existsSync(file)) {
    const doc: ModelsDoc = { version: 1, slots: JSON.parse(JSON.stringify(DEFAULT_MODELS)) as Record<string, ModelSlot> };
    fs.writeFileSync(file, JSON.stringify(doc, null, 2), "utf8");
    return doc;
  }
  const doc = JSON.parse(fs.readFileSync(file, "utf8") as string) as ModelsDoc;
  for (const role of ROLES) if (!doc.slots[role]) doc.slots[role] = blank();
  return doc;
}

export function saveModels(dir: string, doc: ModelsDoc): void {
  for (const [role, slot] of Object.entries(doc.slots)) validateModelSlot(role, slot);
  fs.writeFileSync(modelsFile(dir), JSON.stringify({ version: 1, slots: doc.slots }, null, 2), "utf8");
}

export function detectOpencode(workspaceDir: string): { model: string | null; provider: string | null } {
  try {
    const raw = fs.readFileSync(path.join(workspaceDir, "opencode.json"), "utf8");
    const cfg = JSON.parse(raw) as { model?: unknown; provider?: unknown };
    return {
      model: typeof cfg.model === "string" ? cfg.model : null,
      provider: typeof cfg.provider === "string" ? cfg.provider : null,
    };
  } catch {
    return { model: null, provider: null };
  }
}
