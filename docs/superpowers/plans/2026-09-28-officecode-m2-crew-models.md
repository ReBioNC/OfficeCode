# OfficeCode M2 (Crew & Models) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Staff the full website crew with per-role custom models: 9 more role agents, expanded office, models config API + dashboard picker, global concurrency queue, and an honest (estimate-labeled) budget board v1.

**Architecture:** Same three units as M1. New sidecar modules `models.ts` (per-role model slots persisted in `.officecode/models.json`), `queue.ts` (global-cap waiting line with 202 responses, pumped on run settle), `budgets.ts` (estimate-labeled spend ledger + cap enforcement). Dashboard gains Models and Budget panels plus a Queue list. No new runtime dependencies.

**Tech Stack:** TypeScript 5.x, Node 18+, zero runtime deps, `node:test` + `node:assert`, esbuild dashboard bundle.

**Spec:** `docs/superpowers/specs/2026-09-27-office-orchestrator-prd.md` — M2 implements PRD §6 (10 roles), §7.1–7.3 (per-role models, router caps, ledgers), §11 Flow B (fallback visible), roadmap M2 row. Deferred to M3+: hallway enforcement, handoffs, briefs, outbox UI, fallback auto-switching, Night Shift.

## Global Constraints

- All M1 constraints carry over (Node 18 floor, zero sidecar runtime deps, secrets never in frontend, ledger-first states, Windows-safe scripts, `textContent`-only dashboard rendering).
- Every spend figure is labeled `estimated: true` until real provider usage APIs land (M3+) — the dashboard shows "est." next to every dollar number.
- Model slots are user-owned strings — the sidecar never invents provider keys and never calls providers to validate them.
- Queue + budget refusals use friendly messages (202 queued / 402 over budget), never raw codes alone.
- `POST /api/runs` keeps M1 behavior (await-then-respond) — progressive streaming stays M3.

## Review Focus

- Queued run starts exactly once when a slot frees, never twice and never dropped — test pins it in Task 4.
- Over-budget POST is refused with 402 before any desk is claimed — test pins it in Task 5.
- PUT /api/models with an unknown role or empty model string returns 400 and leaves stored config unchanged — test pins it in Task 2.
- Model picker shows only user-configured values, never invents keys — test pins it in Task 3.
- Queue position advances visibly (1→started) rather than stalling silently — test pins it in Task 4.

---

## File Structure (new/changed in M2)

```
├── plugin/agents/pm.md, uiux-designer.md, backend-dev.md, api-dev.md,
│   database-dev.md, devops.md, qa-engineer.md, reviewer.md, docs-writer.md
├── .officecode.sample/office.json   # + Design, Backend, Data rooms & 4 desks (MODIFY)
├── src/sidecar/models.ts            # load/save/validate models.json (CREATE)
├── src/sidecar/queue.ts             # enqueue/pump waiting line (CREATE)
├── src/sidecar/budgets.ts           # estimate math + spend ledger + cap check (CREATE)
├── src/sidecar/server.ts            # /api/models, /api/queue, /api/budgets, 202/402 paths (MODIFY)
├── src/sidecar/runs.ts              # settle hook for pump (MODIFY, +setOnSettled)
├── src/dashboard/app.ts             # Models + Budget + Queue panels (MODIFY)
├── src/dashboard/index.html         # panel markup (MODIFY)
├── test/models.test.ts, test/queue.test.ts, test/budgets.test.ts (CREATE)
├── test/server-m2.test.ts           # 202/402/PUT-path API tests (CREATE)
└── docs/INSTALL.md                  # M2 section (MODIFY)
```

---

### Task 1: Crew — 9 role agents + expanded sample office

**Files:** Create 9 `plugin/agents/*.md`; Modify `.officecode.sample/office.json`; Create `test/roles.test.ts` (asserts each agent file exists with frontmatter `name:` + `description:`, and every agent name appears in models defaults of Task 2 — forward-checked in Task 2 test instead; this test only checks files).

- [ ] **Step 1: Write failing test `test/roles.test.ts`**

```ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const ROLES = ["pm", "uiux-designer", "backend-dev", "api-dev", "database-dev", "devops", "qa-engineer", "reviewer", "docs-writer", "frontend-dev"];

describe("roles", () => {
  it("every role has an agent file with name + description", () => {
    for (const role of ROLES) {
      const src = fs.readFileSync(`plugin/agents/${role}.md`, "utf8");
      assert.match(src, /name: /);
      assert.match(src, /description: /);
    }
  });
});
```

- [ ] **Step 2: Run to verify FAIL** (missing files): scoped `npx tsc test/roles.test.ts ...` then `node --test`. Expected: FAIL on ENOENT.
- [ ] **Step 3: Write the 9 agent files** (same frontmatter shape as `frontend-dev.md`, scope/DoD per PRD §6; keep each under 15 lines):

`plugin/agents/pm.md`:
```md
---
name: pm
description: Decomposes requests, staffs rooms, enforces budgets, accepts outbox.
tools:
  read: true
---

# PM / Orchestrator

You work in the Manager office. You never edit code directly.
Scope: plan, task graph, briefs, budgets. Definition of done: every task has an owner, a DoD checklist, and a budget slice.
```
(Analogous files: `uiux-designer.md` (write design/ only, DoD: tokens + HTML mockup), `backend-dev.md` (server/ paths), `api-dev.md` (contracts + OpenAPI), `database-dev.md` (migrations via DB console), `devops.md` (infra scripts, no prod without approval), `qa-engineer.md` (tests + acceptance list), `reviewer.md` (read + comment, no direct edit), `docs-writer.md` (docs/output only).)
- [ ] **Step 4: Expand `.officecode.sample/office.json`**: add rooms `room-design` (Design, purple, paths ["design/"], maxDesks 2), `room-backend` (Backend, red, paths ["server/"], maxDesks 3), `room-data` (Data, green, paths ["db/"], maxDesks 1); desks `desk-ui-1` (room-design), `desk-be-1`, `desk-be-2` (room-backend), `desk-db-1` (room-data). Validate with existing `validateOffice` via a scratch node eval.
- [ ] **Step 5: RUN `node scripts/build.cjs && node --test dist-test/test/roles.test.js`** — Expected: PASS. Then full `npm test` — Expected: all green.
- [ ] **Step 6: Commit** `git add plugin/agents test/roles.test.ts .officecode.sample/office.json` + `git commit -m "feat(crew): add 9 role agents and expand sample office"`.

### Task 2: Models config API

**Files:** Create `src/sidecar/models.ts`, `test/models.test.ts`.

**Interfaces:** Produces `loadModels()` / `saveModels()` / `DEFAULT_MODELS` / `validateModelSlot()` for server Task (wired in Task 4 commit? No — wire routes in this task too: modify `src/sidecar/server.ts` GET/PUT /api/models + `GET /api/models/opencode` best-effort detector).

ModelSlot: `{ provider: string; model: string; fallbacks: string[]; weight: number }`. models.json: `{ version: 1, slots: Record<string, ModelSlot> }`, seeded from DEFAULT_MODELS for all 10 roles (provider "opencode", model "", fallbacks [], weight 1 — empty model means "not assigned yet", dashboard prompts to pick).

- [ ] **Step 1: Write failing `test/models.test.ts`:**

```ts
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadModels, saveModels, validateModelSlot, DEFAULT_MODELS } from "../src/sidecar/models.js";

let dir: string;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), "officecode-models-")); });

describe("models", () => {
  it("seeds defaults for all 10 roles", () => {
    const m = loadModels(dir);
    for (const role of ["pm","uiux-designer","frontend-dev","backend-dev","api-dev","database-dev","devops","qa-engineer","reviewer","docs-writer"]) {
      assert.ok(m.slots[role], role);
    }
    assert.ok(Object.keys(DEFAULT_MODELS).length === 10);
  });
  it("rejects empty model strings and unknown roles on save", () => {
    const m = loadModels(dir);
    assert.throws(() => saveModels(dir, { ...m, slots: { ...m.slots, ghost: { provider: "x", model: "y", fallbacks: [], weight: 1 } } }), /unknown role/);
    assert.throws(() => saveModels(dir, { ...m, slots: { ...m.slots, qa: { provider: "x", model: "", fallbacks: [], weight: 1 } } }), /model/);
  });
  it("persists round-trip", () => {
    const m = loadModels(dir);
    m.slots["qa"] = { provider: "anthropic", model: "haiku", fallbacks: ["sonnet"], weight: 0.5 };
    saveModels(dir, m);
    assert.equal(loadModels(dir).slots["qa"].model, "haiku");
  });
});
```

- [ ] **Step 2: FAIL (TS2307), Step 3: write `src/sidecar/models.ts`:**

```ts
import fs from "node:fs";
import path from "node:path";

export interface ModelSlot { provider: string; model: string; fallbacks: string[]; weight: number }
export interface ModelsDoc { version: number; slots: Record<string, ModelSlot> }

export const ROLES = ["pm","uiux-designer","frontend-dev","backend-dev","api-dev","database-dev","devops","qa-engineer","reviewer","docs-writer"];

function blank(): ModelSlot { return { provider: "opencode", model: "", fallbacks: [], weight: 1 }; }

export const DEFAULT_MODELS: Record<string, ModelSlot> = Object.fromEntries(ROLES.map((r) => [r, blank()]));

export function modelsFile(dir: string): string { return path.join(dir, "models.json"); }

export function validateModelSlot(role: string, slot: ModelSlot): void {
  if (!ROLES.includes(role)) throw new Error(`unknown role: ${role}`);
  if (!slot.provider || typeof slot.provider !== "string") throw new Error(`role ${role}: provider required`);
  if (!slot.model || typeof slot.model !== "string") throw new Error(`role ${role}: model required`);
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
```

- [ ] **Step 4: Wire routes in `src/sidecar/server.ts`:** `GET /api/models` → `loadModels(store.dir)`; `PUT /api/models` (same 1MB cap pattern as POST: reuse by extracting `readBody(req): Promise<string>` helper — minimal: duplicate the 15-line pattern, ledger the duplication as intentional to avoid refactor risk) → parse, `saveModels`, 200; errors → 400. `GET /api/models/opencode` → `detectOpencode(workspaceDir)`.
- [ ] **Step 5: Scoped compile + `node --test dist-test/test/models.test.js`** — Expected: PASS (3).
- [ ] **Step 6: Commit** `git commit -m "feat(models): add per-role model slots API"`.

### Task 3: Dashboard Models UI

**Files:** Modify `src/dashboard/index.html` (+Models section markup), `src/dashboard/app.ts` (render + save), extend `test/client-contract.test.ts` (asserts `fetch("/api/models"` PUT flow strings + still no innerHTML — covered by xss test).

- [ ] **Step 1: Failing contract additions:**

```ts
it("has a models panel that loads and saves slots", () => {
  const src = fs.readFileSync("src/dashboard/app.ts", "utf8");
  assert.ok(src.includes('fetch("/api/models"'), "loads models");
  assert.ok(src.includes('"PUT"'), "saves models");
});
```

- [ ] **Step 2: FAIL, Step 3: implement:** Models `<section>` with `<div id="models">`; `loadModelsUI()` builds one row per role via `createElement`/`textContent` only: role label, provider input, model input, fallbacks input (comma-separated), weight input, per-row Save button → PUT `/api/models` with full doc (re-read current doc, patch one slot). Status line via `textContent`. Call after `snapshot()`. Unassigned (empty model) rows get placeholder "pick a model…".
- [ ] **Step 4: esbuild + contract tests PASS; Step 5: Commit** `git commit -m "feat(dashboard): add per-role models panel"`.

### Task 4: Concurrency queue

**Files:** Create `src/sidecar/queue.ts`, `test/queue.test.ts`; Modify `src/sidecar/runs.ts` (+`setOnSettled`), `src/sidecar/server.ts` (cap check → 202, `GET /api/queue`), `src/dashboard/app.ts` + `index.html` (Queue list).

Queue design: `cap = Number(env OFFICECODE_MAX_CONCURRENT ?? 8)`. `active = store.occupants.size`. If `active >= cap` → create queued record WITHOUT claiming: `{id, deskId, role, prompt, state: "queued", ...}` pushed to in-memory `pending[]` + ledger `run.queued`; respond 202 `{queued: true, position}`. `setOnSettled(cb)` in runs.ts invoked after occupant delete; server registers pump: shift first pending whose desk is free → `createRun` (its claim chain serializes; on 409 requeue front and stop). `GET /api/queue` → pending summary.

- [ ] **Step 1: Failing `test/queue.test.ts` (runs-level, deterministic):**

```ts
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadOffice } from "../src/sidecar/office-store.js";
import { MockDriver } from "../src/sidecar/drivers.js";
import { createRun, setOnSettled } from "../src/sidecar/runs.js";
import { enqueueOrRun, pendingCount } from "../src/sidecar/queue.js";

let ws: string;
beforeEach(() => {
  ws = fs.mkdtempSync(path.join(os.tmpdir(), "officecode-q-"));
  fs.mkdirSync(path.join(ws, ".officecode.sample"), { recursive: true });
  fs.copyFileSync(path.join(process.cwd(), ".officecode.sample", "office.json"), path.join(ws, ".officecode.sample", "office.json"));
});

describe("queue", () => {
  it("queues when at cap and pumps exactly once on settle", async () => {
    const store = loadOffice(ws);
    const slow = new MockDriver(new Array(20).fill("tick "));
    const fast = new MockDriver(["ok"]);
    const p1 = createRun(store, ws, slow, { deskId: "desk-fe-1", role: "frontend-dev", prompt: "slow" });
    const q = enqueueOrRun(store, ws, fast, { deskId: "desk-qa-1", role: "qa", prompt: "queued" }, 1);
    assert.equal(q.queued, true);
    assert.equal(pendingCount(), 1);
    const [r1] = await Promise.all([p1]);
    assert.equal(r1.state, "done");
    await new Promise((r) => setTimeout(r, 200));
    assert.equal(pendingCount(), 0);
  });
});
```

Wiring: `setOnSettled(() => pump)` registered by queue module init `armPump(store, ws, driverFor)`? Keep explicit: `queue.ts` exports `enqueueOrRun(store, ws, driver, input, cap)` and `pumpQueue(store, ws, driverForRole)`; server calls `setOnSettled(() => { void pumpQueue(...) })` with a driver factory `(role) => selectDriver(env)` — pump uses `loadModels` slot? M2 pump uses mock/cli by env (model routing to real per-role drivers is M3; document). Queued record creation needs transcript header + outbox paths — reuse a `prepareRun()` export from runs.ts? Minimal: queue stores input only; the 202 response contains a `queueId`; the run record is created at pump time by createRun. Position = index+1. `GET /api/queue` lists inputs (no fake run ids — honest: `{position, deskId, role, prompt}`). Rework test: `q.queued === true`, position 1; after settle + pump, `GET /api/runs` contains the qa run done. Adjust test to poll `listRuns()` for role qa done within 5s.

- [ ] **Step 2: FAIL (TS2307), Step 3: implement `queue.ts` + `setOnSettled` in runs.ts** (call settled callbacks after `store.occupants.delete`), server 202 path + `GET /api/queue`, dashboard Queue `<ul id="queue">` refreshed in `snapshot()`.
- [ ] **Step 4: Tests PASS; Step 5: Commit** `git commit -m "feat(queue): add global concurrency cap with 202 waiting line"`.

### Task 5: Budget board v1 (estimates, honestly labeled)

**Files:** Create `src/sidecar/budgets.ts`, `test/budgets.test.ts`; Modify `server.ts` (`GET /api/budgets`, 402 guard in POST before desk claim), dashboard Budget panel, `test/server-m2.test.ts` (PUT validation 400s, 402 path, queue 202 path at HTTP level with cap env).

`budgets.ts`: `loadBudgets(dir)` → `{ version: 1, dailyUsdCap: 20, rates: { [model: string]: { inPer1M: number; outPer1M: number } } }` seeded with 3 common entries (haiku/sonnet/opus-class placeholders — labeled defaults, user-editable). `estimateUsd(model, chars, rates)`: tokens = chars/4, in 70% / out 30%, unknown model → rate 0 + `unknownRate: true`. `recordSpend(dir, entry)` → append `spend.jsonl {ts, runId, model, chars, usd, estimated: true}`. `spentToday(dir)` sums today's entries. Cap check helper `overBudget(dir): boolean`.

402 guard placement in POST handler: after body parse, before desk validation: `if (overBudget(store.dir)) { 404? no → 402 { error: "daily budget cap reached (est. $X of $Y). Raise cap in Budget panel." } }`.

Dashboard: Budget section: cap input + save (PUT /api/budgets), "spent today (est.)" bar, rates note. Contract test: `fetch("/api/budgets"` present.

- [ ] Steps follow TDD: failing tests → impl → green → commit `git commit -m "feat(budgets): add estimate-labeled budget board v1"`.

### Task 6: Docs + full gate

- [ ] Update `docs/INSTALL.md` (+M2: roles, models panel, queue, budgets), `docs/INDEX.md` (+plan link).
- [ ] Run `npm test` (all suites incl. server-m2) + `npm run smoke` — Expected: green.
- [ ] Commit `git commit -m "docs(m2): document crew, models, queue, budgets"`.

## Self-Review

**Coverage:** PRD §6 → T1; §7.1 → T2+T3; §7.2 caps/queue → T4 (fallback auto-switch stays M3, stated); §7.3 ledgers → T5 (estimates labeled); Flow B visible-fallback → partially (queued/402 states visible; model auto-fallback M3). No M2-scope gap.
**Placeholders:** none — every step has exact code/commands/expected.
**Types:** `ModelSlot`, queue input shape `{deskId, role, prompt}` matches createRun input; `RunRecord.state` gains `"queued"` literal — update `RUN_STATES` in Task 4 commit (add "queued" + test assert includes it).
**Review Focus:** all five lines have owning-task tests (T4 ×2, T5, T2, T3).
