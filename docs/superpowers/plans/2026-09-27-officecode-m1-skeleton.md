# OfficeCode M1 Skeleton Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the smallest working OfficeCode loop: empty office floor in the browser, one 2D character backed by one real bounded run (OpenCode CLI driver, mock fallback), with transcript, JSONL ledger, and Outbox file.

**Architecture:** Single Node+TypeScript codebase in three units: `shared/` (versioned event + office-schema contracts), `sidecar/` (owns secrets, office store, run lifecycle, HTTP+SSE API, disk ledgers), `dashboard/` (secret-free Canvas UI fed only by sidecar SSE). OpenCode is driven through a `Driver` interface; M1 ships `CliDriver` (spawns the user's `opencode` CLI) and `MockDriver` (scripted events for CI without keys).

**Tech Stack:** TypeScript 5.x, Node 18+ (CI matches Node 22), zero runtime dependencies in `sidecar` (Node core: `http`, `fs`, `events`, `crypto`, `child_process`), dashboard in vanilla TS + Canvas 2D bundled with esbuild, tests with `node:test` + `node:assert` on compiled output, devDependencies only: `typescript`, `esbuild`, `@types/node`.

**Spec:** `docs/superpowers/specs/2026-09-27-office-orchestrator-prd.md` — M1 implements PRD §5 (office metaphor, character-state subset), §8 (sidecar+dashboard+plugin shape), §11 Flow A (minimal), §12 fast gate subset. Deferred to M2–M4: per-role model picker UI, hallway enforcement, handoffs, briefs, budgets, Night Shift, schedules, connectors, voice, Tauri.

## Global Constraints

- Node floor is 18+, CI matches Node 22 — no API newer than Node 18 in `sidecar` (`fetch` in dashboard only, never in sidecar).
- `sidecar` has zero runtime dependencies — only Node core modules plus compiled `shared/` output.
- Secrets (provider keys) live in sidecar env / OS keychain / existing OpenCode auth only — the dashboard bundle must contain no key, token, or `Authorization` header.
- Dashboard state comes only from sidecar SSE + snapshot endpoints — never from direct provider calls or localStorage-invented runs.
- Every character state shown must map to a ledger event — states outside the M1 subset (`waiting-approval`, `in-handoff`, `sleeping`) are not rendered and not emitted.
- M1 character-state subset: `off-duty`, `walking`, `thinking`, `acting`, `delivering`, `done`, `blocked` — exact string literals, shared from `shared/events.ts`.
- Windows 10/11 is the primary target — paths via `node:path`, no POSIX-only shell syntax in npm scripts (use `node` one-liners, not `rm -rf` / `&&` chains that need sh).
- `opencode.json` and user OpenCode config are read-only in M1 — the sidecar never writes outside `<workspace>/.officecode/` and `<workspace>/output/outbox/`.
- JSONL ledgers are append-only — writers use `fs.appendFileSync`, never rewrite history; restart reconstructs state by replay.
- npm scripts must work on Windows PowerShell 5.1 and POSIX sh without modification.

## Review Focus

- Dispatch to an occupied desk returns 409 and the desk stays occupied by the original run — test pins it in Task 5.
- `opencode` CLI missing on PATH marks the run `blocked(missing-cli)` with an actionable message while the sidecar keeps serving — test pins it in Task 4.
- SSE disconnect then reconnect refetches the snapshot and resumes live events with no duplicated runs — test pins it in Task 6.
- Two concurrent dispatches to the same free desk result in exactly one 201 and one 409 — test pins it in Task 5.
- Prompt text containing `<script>` renders as inert text in transcript panel and Outbox preview, never executes — test pins it in Task 7.

---

## File Structure

```
officecode (repo root, branch feat/office-orchestrator)
├── package.json                    # scripts: build, test, dev, typecheck, smoke
├── tsconfig.json                   # single project, outDir dist, rootDir .
├── .gitignore                      # node_modules, dist, .officecode (except sample), output
├── scripts/
│   ├── build.cjs                   # Windows-safe build (tsc + esbuild + copy)
│   └── smoke.cjs                   # end-to-end proof gate
├── src/
│   ├── shared/
│   │   ├── events.ts               # RunState literals, OfficeEvent types, emit helpers
│   │   └── office-schema.ts        # Office/Room/Desk/Hallway/Object types + validateOffice()
│   ├── sidecar/
│   │   ├── index.ts                # bootstrap: load office, start server
│   │   ├── office-store.ts         # load/save/validate office.json, desk occupancy
│   │   ├── ledgers.ts              # append-only JSONL writers + replay()
│   │   ├── drivers.ts              # Driver interface + MockDriver + CliDriver
│   │   ├── runs.ts                 # run lifecycle: create/stream/finish → transcript+outbox+events
│   │   └── server.ts               # http API + SSE hub (no secrets in responses)
│   └── dashboard/
│       ├── index.html              # floor canvas + dispatch form + transcript + outbox panels
│       ├── app.ts                  # SSE client + fetch + render loop (no secrets)
│       └── layout.ts               # pure room→pixel rect math (unit-tested, no DOM)
├── test/
│   ├── office-store.test.ts        # layout-is-policy validation tests
│   ├── ledgers.test.ts             # append/replay tests
│   ├── drivers.test.ts             # mock driver script + cli-missing tests
│   ├── runs.test.ts                # lifecycle + desk-occupancy race tests
│   ├── server.test.ts              # API + SSE tests (real http, ephemeral port)
│   ├── layout.test.ts              # canvas-math tests
│   └── xss-contract.test.ts        # dashboard renders text via textContent only
├── plugin/
│   ├── agents/frontend-dev.md      # first role template (real OpenCode agent file)
│   └── commands/
│       ├── office-run.md           # /office.run slash-command doc
│       └── office-staff.md         # /office.staff slash-command doc
├── docs/
│   ├── INDEX.md                    # doc map (new)
│   ├── INSTALL.md                  # install + run (new)
│   └── PRIVACY.md                  # data map (new)
├── .officecode.sample/office.json  # starter floor: Frontend + QA rooms, 2 desks, 1 hallway
└── dashboard/public/               # build output (gitignored): index.html + app.js
```

Compile model: `tsc -p tsconfig.json` compiles `src/**/*.ts` to `dist/`; `scripts/build.cjs` additionally compiles `src/shared`, `src/sidecar`, `src/dashboard/layout.ts` plus `test/*.ts` to `dist-test/` for `node --test`; esbuild bundles `src/dashboard/app.ts` (which imports `./layout` without extension so both tsc and esbuild resolve it) to `dashboard/public/app.js`.

---

### Task 1: Repo scaffolding + sample office

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.gitignore`
- Create: `scripts/build.cjs`
- Create: `.officecode.sample/office.json`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: `npm run build | test | dev | typecheck | smoke` scripts and `Office` JSON shape consumed by Task 2 (`validateOffice`) and Task 3 (store loads this file).

- [ ] **Step 1: Write package.json**

```json
{
  "name": "officecode",
  "version": "0.1.0",
  "private": true,
  "type": "commonjs",
  "engines": { "node": ">=18" },
  "scripts": {
    "typecheck": "tsc --noEmit -p tsconfig.json",
    "build": "node scripts/build.cjs",
    "test": "node scripts/build.cjs && node --test dist-test/",
    "dev": "node scripts/build.cjs && node dist/src/sidecar/index.js",
    "smoke": "node scripts/build.cjs && node scripts/smoke.cjs"
  },
  "devDependencies": {
    "@types/node": "22.7.0",
    "esbuild": "0.23.0",
    "typescript": "5.6.2"
  }
}
```

- [ ] **Step 2: Write tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "CommonJS",
    "moduleResolution": "Node",
    "strict": true,
    "declaration": false,
    "sourceMap": true,
    "outDir": "dist",
    "rootDir": ".",
    "types": ["node"],
    "lib": ["ES2022", "DOM"]
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist", "dist-test", "dashboard/public"]
}
```

- [ ] **Step 3: Write .gitignore**

```gitignore
node_modules/
dist/
dist-test/
dashboard/public/
.officecode/
output/
*.log
.DS_Store
```

- [ ] **Step 4: Write scripts/build.cjs** (Windows-safe, no shell chains)

```js
const { execSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const run = (cmd) => execSync(cmd, { cwd: root, stdio: "inherit" });

fs.mkdirSync(path.join(root, "dist-test"), { recursive: true });
fs.mkdirSync(path.join(root, "dashboard", "public"), { recursive: true });

run("npx tsc -p tsconfig.json");
run(
  "npx tsc src/shared/events.ts src/shared/office-schema.ts " +
    "src/sidecar/index.ts src/sidecar/office-store.ts src/sidecar/ledgers.ts " +
    "src/sidecar/drivers.ts src/sidecar/runs.ts src/sidecar/server.ts " +
    "src/dashboard/layout.ts " +
    "test/office-store.test.ts test/ledgers.test.ts test/drivers.test.ts " +
    "test/runs.test.ts test/server.test.ts test/layout.test.ts test/xss-contract.test.ts " +
    "--outDir dist-test --module commonjs --target ES2022 --moduleResolution node " +
    "--strict --sourceMap false --declaration false --types node --lib ES2022,DOM"
);
run("npx esbuild src/dashboard/app.ts --bundle --format=iife --target=es2020 --outfile=dashboard/public/app.js");
fs.copyFileSync(
  path.join(root, "src", "dashboard", "index.html"),
  path.join(root, "dashboard", "public", "index.html")
);
console.log("build ok");
```

- [ ] **Step 5: Write .officecode.sample/office.json**

```json
{
  "version": 1,
  "building": "HQ",
  "floors": [{ "id": "floor-1", "name": "Webapp", "worktree": null }],
  "rooms": [
    { "id": "room-frontend", "floorId": "floor-1", "name": "Frontend", "color": "blue", "paths": ["web/"], "maxDesks": 3 },
    { "id": "room-qa", "floorId": "floor-1", "name": "QA", "color": "green", "paths": ["web/", "tests/"], "maxDesks": 2 }
  ],
  "desks": [
    { "id": "desk-fe-1", "roomId": "room-frontend", "label": "FE-1" },
    { "id": "desk-qa-1", "roomId": "room-qa", "label": "QA-1" }
  ],
  "hallways": [
    { "id": "hall-fe-qa", "fromRoomId": "room-frontend", "toRoomId": "room-qa", "open": true }
  ],
  "objects": [
    { "id": "obj-printer", "roomId": "room-qa", "kind": "printer", "grants": ["read"] }
  ],
  "roster": []
}
```

- [ ] **Step 6: Install, typecheck, commit**

Run: `npm install`
Expected: `node_modules/` created, no errors.

Run: `npm run typecheck`
Expected: passes. If tsc errors on an empty program (no `src/**/*.ts` matched yet), create `src/.keep.ts` containing `export {};` and rerun.

Run: `git add package.json tsconfig.json .gitignore scripts/build.cjs .officecode.sample/office.json`
Expected: staged (plus `src/.keep.ts` only if it was needed).

```bash
git commit -m "feat(scaffold): add TS project, build scripts, sample office"
```

---

### Task 2: Shared contracts (events + office schema)

**Files:**
- Create: `src/shared/events.ts`
- Create: `src/shared/office-schema.ts`
- Create: `test/office-store.test.ts`

**Interfaces:**
- Consumes: sample office JSON shape from Task 1.
- Produces: `RunState`, `OfficeEvent`, `makeEvent()` for Tasks 4–6; `Office`, `validateOffice()` for Task 3.

- [ ] **Step 1: Write the failing test `test/office-store.test.ts`** (covers schema validation owned by this task; store behavior covered in Task 3)

```ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { validateOffice } from "../src/shared/office-schema.js";

const base = {
  version: 1,
  building: "HQ",
  floors: [{ id: "floor-1", name: "Webapp", worktree: null }],
  rooms: [{ id: "r1", floorId: "floor-1", name: "Frontend", color: "blue", paths: ["web/"], maxDesks: 2 }],
  desks: [{ id: "d1", roomId: "r1", label: "FE-1" }],
  hallways: [],
  objects: [],
  roster: [],
};

describe("validateOffice", () => {
  it("accepts the sample office", () => {
    assert.equal(validateOffice(base).ok, true);
  });
  it("rejects a desk pointing at a missing room", () => {
    const bad = { ...base, desks: [{ id: "d9", roomId: "nope", label: "X" }] };
    const res = validateOffice(bad);
    assert.equal(res.ok, false);
    assert.match((res as { ok: false; error: string }).error, /room/);
  });
  it("rejects a hallway with unknown endpoint", () => {
    const bad = { ...base, hallways: [{ id: "h", fromRoomId: "r1", toRoomId: "ghost", open: true }] };
    assert.equal(validateOffice(bad).ok, false);
  });
  it("rejects desks over room maxDesks", () => {
    const bad = {
      ...base,
      desks: [
        { id: "d1", roomId: "r1", label: "A" },
        { id: "d2", roomId: "r1", label: "B" },
        { id: "d3", roomId: "r1", label: "C" },
      ],
    };
    assert.equal(validateOffice(bad).ok, false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node scripts/build.cjs && node --test dist-test/test/office-store.test.js`
Expected: FAIL with `Cannot find module` (contracts do not exist yet).

- [ ] **Step 3: Write `src/shared/events.ts`**

```ts
export const RUN_STATES = [
  "off-duty",
  "walking",
  "thinking",
  "acting",
  "delivering",
  "done",
  "blocked",
] as const;
export type RunState = (typeof RUN_STATES)[number];

export type OfficeEventType =
  | "run.created"
  | "run.state"
  | "run.chunk"
  | "run.finished"
  | "office.updated";

export interface OfficeEvent {
  seq: number;
  ts: string;
  runId: string | null;
  type: OfficeEventType;
  state?: RunState;
  message?: string;
}

export function makeEvent(
  seq: number,
  runId: string | null,
  type: OfficeEventType,
  extra: Partial<Pick<OfficeEvent, "state" | "message">> = {},
): OfficeEvent {
  return { seq, ts: new Date().toISOString(), runId, type, ...extra };
}
```

- [ ] **Step 4: Write `src/shared/office-schema.ts`**

```ts
export interface Floor { id: string; name: string; worktree: string | null }
export interface Room {
  id: string; floorId: string; name: string; color: string;
  paths: string[]; maxDesks: number;
}
export interface Desk { id: string; roomId: string; label: string }
export interface Hallway { id: string; fromRoomId: string; toRoomId: string; open: boolean }
export interface PlacedObject { id: string; roomId: string; kind: string; grants: string[] }
export interface Office {
  version: number; building: string; floors: Floor[]; rooms: Room[];
  desks: Desk[]; hallways: Hallway[]; objects: PlacedObject[]; roster: unknown[];
}

export function validateOffice(doc: unknown): { ok: true } | { ok: false; error: string } {
  if (typeof doc !== "object" || doc === null) return { ok: false, error: "office must be an object" };
  const o = doc as Record<string, unknown>;
  for (const k of ["version", "building", "floors", "rooms", "desks", "hallways", "objects", "roster"]) {
    if (!(k in o)) return { ok: false, error: `office missing key: ${k}` };
  }
  const office = o as unknown as Office;
  const roomIds = new Set(office.rooms.map((r) => r.id));
  for (const d of office.desks) {
    if (!roomIds.has(d.roomId)) return { ok: false, error: `desk ${d.id} points at missing room ${d.roomId}` };
  }
  const perRoom = new Map<string, number>();
  for (const d of office.desks) perRoom.set(d.roomId, (perRoom.get(d.roomId) ?? 0) + 1);
  for (const r of office.rooms) {
    if ((perRoom.get(r.id) ?? 0) > r.maxDesks)
      return { ok: false, error: `room ${r.id} exceeds maxDesks ${r.maxDesks}` };
  }
  for (const h of office.hallways) {
    if (!roomIds.has(h.fromRoomId) || !roomIds.has(h.toRoomId))
      return { ok: false, error: `hallway ${h.id} has unknown endpoint room` };
  }
  for (const ob of office.objects) {
    if (!roomIds.has(ob.roomId)) return { ok: false, error: `object ${ob.id} points at missing room ${ob.roomId}` };
  }
  return { ok: true };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node scripts/build.cjs && node --test dist-test/test/office-store.test.js`
Expected: PASS (4 tests). Other suites fail — that is fine, their tasks are next.

- [ ] **Step 6: Commit**

```bash
git add src/shared/events.ts src/shared/office-schema.ts test/office-store.test.ts
git commit -m "feat(contracts): add run states, office events, layout validation"
```

---

### Task 3: Office store + append-only ledgers

**Files:**
- Create: `src/sidecar/office-store.ts`
- Create: `src/sidecar/ledgers.ts`
- Create: `test/ledgers.test.ts`

**Interfaces:**
- Consumes: `validateOffice`, `Office` (Task 2); sample office (Task 1).
- Produces: `loadOffice()` / `occupants` map for Task 5; `appendEvent()` / `replay()` / `nextSeq()` for Tasks 4–6.

- [ ] **Step 1: Write the failing test `test/ledgers.test.ts`**

```ts
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { appendEvent, replay } from "../src/sidecar/ledgers.js";
import { makeEvent } from "../src/shared/events.js";

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "officecode-"));
});

describe("ledgers", () => {
  it("appends then replays in order", () => {
    appendEvent(dir, makeEvent(1, "run-1", "run.created", { state: "walking" }));
    appendEvent(dir, makeEvent(2, "run-1", "run.chunk", { message: "hello" }));
    const events = replay(dir);
    assert.equal(events.length, 2);
    assert.equal(events[1].message, "hello");
  });
  it("never rewrites history: second append keeps first line", () => {
    appendEvent(dir, makeEvent(1, null, "office.updated"));
    appendEvent(dir, makeEvent(2, null, "office.updated"));
    const raw = fs.readFileSync(path.join(dir, "events.jsonl"), "utf8").trim().split("\n");
    assert.equal(raw.length, 2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node scripts/build.cjs && node --test dist-test/test/ledgers.test.js`
Expected: FAIL with `Cannot find module '../src/sidecar/ledgers.js'`.

- [ ] **Step 3: Write `src/sidecar/ledgers.ts`**

```ts
import fs from "node:fs";
import path from "node:path";
import type { OfficeEvent } from "../shared/events.js";

export function eventsPath(dir: string): string {
  return path.join(dir, "events.jsonl");
}

export function appendEvent(dir: string, event: OfficeEvent): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(eventsPath(dir), JSON.stringify(event) + "\n", "utf8");
}

export function replay(dir: string): OfficeEvent[] {
  const file = eventsPath(dir);
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, "utf8")
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as OfficeEvent);
}

export function nextSeq(dir: string): number {
  return replay(dir).length + 1;
}
```

- [ ] **Step 4: Write `src/sidecar/office-store.ts`**

```ts
import fs from "node:fs";
import path from "node:path";
import { validateOffice, type Office } from "../shared/office-schema.js";

export interface OfficeStore {
  dir: string;
  office: Office;
  occupants: Map<string, string>;
}

export function officeFile(dir: string): string {
  return path.join(dir, "office.json");
}

export function loadOffice(workspaceDir: string): OfficeStore {
  const dir = path.join(workspaceDir, ".officecode");
  fs.mkdirSync(dir, { recursive: true });
  const file = officeFile(dir);
  if (!fs.existsSync(file)) {
    const sample = fs.readFileSync(
      path.join(workspaceDir, ".officecode.sample", "office.json"),
      "utf8",
    );
    fs.writeFileSync(file, sample, "utf8");
  }
  const doc = JSON.parse(fs.readFileSync(file, "utf8") as string) as unknown;
  const res = validateOffice(doc);
  if (res.ok === false) throw new Error(`invalid office.json: ${res.error}`);
  return { dir, office: doc as Office, occupants: new Map() };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `node scripts/build.cjs && node --test dist-test/test/ledgers.test.js dist-test/test/office-store.test.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/sidecar/office-store.ts src/sidecar/ledgers.ts test/ledgers.test.ts
git commit -m "feat(sidecar): add office store and append-only JSONL ledgers"
```

---

### Task 4: Drivers (Mock + CLI) with missing-CLI safety

**Files:**
- Create: `src/sidecar/drivers.ts`
- Create: `test/drivers.test.ts`

**Interfaces:**
- Consumes: `DriverChunk` callbacks only (no dependency on Tasks 2–3 at runtime).
- Produces: `Driver`, `MockDriver`, `CliDriver`, `selectDriver()` for Task 5. `Driver.start(prompt, onEvent)` streams `{kind: "chunk" | "done" | "error", text?}` callbacks and resolves the exit code.

- [ ] **Step 1: Write the failing test `test/drivers.test.ts`**

```ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MockDriver, CliDriver, selectDriver } from "../src/sidecar/drivers.js";

describe("MockDriver", () => {
  it("streams script chunks then done", async () => {
    const driver = new MockDriver(["hello ", "world"]);
    const chunks: string[] = [];
    const code = await driver.start("demo", (e) => {
      if (e.kind === "chunk") chunks.push(e.text ?? "");
    });
    assert.equal(code, 0);
    assert.equal(chunks.join(""), "hello world");
  });
});

describe("selectDriver", () => {
  it("uses mock when OFFICECODE_DRIVER=mock", () => {
    assert.equal(selectDriver({ OFFICECODE_DRIVER: "mock" }).name, "mock");
  });
  it("uses cli otherwise", () => {
    assert.equal(selectDriver({}).name, "cli");
  });
});

describe("CliDriver missing binary", () => {
  it("reports missing-cli instead of throwing", async () => {
    const driver = new CliDriver("__definitely_not_a_real_binary__", []);
    const seen: string[] = [];
    const code = await driver.start("hi", (e) => {
      if (e.kind === "error") seen.push(e.message);
    });
    assert.equal(code, 127);
    assert.match(seen.join(" "), /missing-cli/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node scripts/build.cjs && node --test dist-test/test/drivers.test.js`
Expected: FAIL with `Cannot find module`.

- [ ] **Step 3: Write `src/sidecar/drivers.ts`**

```ts
import { spawn } from "node:child_process";

export type DriverChunk =
  | { kind: "chunk"; text: string }
  | { kind: "done"; code: number }
  | { kind: "error"; message: string };

export interface Driver {
  name: string;
  start(prompt: string, onEvent: (e: DriverChunk) => void): Promise<number>;
}

export class MockDriver implements Driver {
  name = "mock";
  constructor(private script: string[] = ["Working on it... ", "done."]) {}
  async start(_prompt: string, onEvent: (e: DriverChunk) => void): Promise<number> {
    for (const text of this.script) {
      await new Promise((r) => setTimeout(r, 5));
      onEvent({ kind: "chunk", text });
    }
    onEvent({ kind: "done", code: 0 });
    return 0;
  }
}

export class CliDriver implements Driver {
  name = "cli";
  constructor(private command = "opencode", private args: string[] = ["run"]) {}
  start(prompt: string, onEvent: (e: DriverChunk) => void): Promise<number> {
    return new Promise((resolve) => {
      let child;
      try {
        child = spawn(this.command, [...this.args, prompt], { shell: false });
      } catch (err) {
        onEvent({ kind: "error", message: `missing-cli: ${(err as Error).message}` });
        resolve(127);
        return;
      }
      child.on("error", (err: Error) => {
        const code = (err as NodeJS.ErrnoException).code;
        const missing =
          code === "ENOENT"
            ? "missing-cli: opencode not found on PATH. Install OpenCode or set OFFICECODE_DRIVER=mock."
            : err.message;
        onEvent({ kind: "error", message: missing });
        resolve(127);
      });
      child.stdout?.on("data", (d: Buffer) => onEvent({ kind: "chunk", text: d.toString("utf8") }));
      child.stderr?.on("data", (d: Buffer) => onEvent({ kind: "chunk", text: d.toString("utf8") }));
      child.on("close", (exitCode: number | null) => {
        onEvent({ kind: "done", code: exitCode ?? 0 });
        resolve(exitCode ?? 0);
      });
    });
  }
}

export function selectDriver(env: Record<string, string | undefined>): Driver {
  if (env["OFFICECODE_DRIVER"] === "mock") return new MockDriver();
  return new CliDriver();
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node scripts/build.cjs && node --test dist-test/test/drivers.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/sidecar/drivers.ts test/drivers.test.ts
git commit -m "feat(sidecar): add mock and CLI drivers with missing-CLI safety"
```

---

### Task 5: Run lifecycle (ledger-first, desk occupancy, Outbox)

**Files:**
- Create: `src/sidecar/runs.ts`
- Create: `test/runs.test.ts`

**Interfaces:**
- Consumes: `OfficeStore` (Task 3), `Driver`/`MockDriver` (Task 4), `appendEvent`/`nextSeq` (Task 3), `makeEvent` (Task 2).
- Produces: `createRun()` / `getRun()` / `listRuns()` for Task 6 (server). Run record: `{id, deskId, role, prompt, state, transcriptPath, outboxDir, exitCode}`. Occupied-desk refusal is an `Error` with `code = 409`.

- [ ] **Step 1: Write the failing test `test/runs.test.ts`**

```ts
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadOffice } from "../src/sidecar/office-store.js";
import { MockDriver } from "../src/sidecar/drivers.js";
import { createRun, getRun } from "../src/sidecar/runs.js";

let ws: string;
beforeEach(() => {
  ws = fs.mkdtempSync(path.join(os.tmpdir(), "officecode-ws-"));
  fs.mkdirSync(path.join(ws, ".officecode.sample"), { recursive: true });
  fs.copyFileSync(
    path.join(process.cwd(), ".officecode.sample", "office.json"),
    path.join(ws, ".officecode.sample", "office.json"),
  );
});

describe("createRun", () => {
  it("runs mock to done with transcript, outbox, ledger", async () => {
    const store = loadOffice(ws);
    const run = await createRun(store, ws, new MockDriver(["hi"]), {
      deskId: "desk-fe-1",
      role: "frontend-dev",
      prompt: "Say hi",
    });
    assert.equal(run.state, "done");
    assert.match(fs.readFileSync(run.transcriptPath, "utf8"), /hi/);
    assert.equal(fs.existsSync(path.join(run.outboxDir, "manifest.json")), true);
    assert.equal(getRun(store, run.id)?.state, "done");
  });

  it("rejects a second run on the occupied desk with 409-style error", async () => {
    const store = loadOffice(ws);
    store.occupants.set("desk-fe-1", "run-existing");
    await assert.rejects(
      () =>
        createRun(store, ws, new MockDriver(["x"]), {
          deskId: "desk-fe-1",
          role: "frontend-dev",
          prompt: "second",
        }),
      /occupied/,
    );
  });

  it("exactly one of two concurrent dispatches wins the desk", async () => {
    const store = loadOffice(ws);
    const driver = new MockDriver(["ok"]);
    const results = await Promise.allSettled([
      createRun(store, ws, driver, { deskId: "desk-qa-1", role: "qa", prompt: "a" }),
      createRun(store, ws, driver, { deskId: "desk-qa-1", role: "qa", prompt: "b" }),
    ]);
    const ok = results.filter((r) => r.status === "fulfilled").length;
    assert.equal(ok, 1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node scripts/build.cjs && node --test dist-test/test/runs.test.js`
Expected: FAIL with `Cannot find module '../src/sidecar/runs.js'`.

- [ ] **Step 3: Write `src/sidecar/runs.ts`**

```ts
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { makeEvent, type RunState } from "../shared/events.js";
import { appendEvent, nextSeq } from "./ledgers.js";
import type { OfficeStore } from "./office-store.js";
import type { Driver } from "./drivers.js";

export interface RunRecord {
  id: string;
  deskId: string;
  role: string;
  prompt: string;
  state: RunState;
  transcriptPath: string;
  outboxDir: string;
  exitCode: number | null;
}

const runs = new Map<string, RunRecord>();
let claim: Promise<void> = Promise.resolve();

export function getRun(_store: OfficeStore, id: string): RunRecord | undefined {
  void _store;
  return runs.get(id);
}

export function listRuns(): RunRecord[] {
  return [...runs.values()];
}

function setState(store: OfficeStore, run: RunRecord, state: RunState, message?: string): void {
  run.state = state;
  appendEvent(store.dir, makeEvent(nextSeq(store.dir), run.id, "run.state", { state, message }));
}

export async function createRun(
  store: OfficeStore,
  workspaceDir: string,
  driver: Driver,
  input: { deskId: string; role: string; prompt: string },
): Promise<RunRecord> {
  const ticket = claim.then(() => {
    if (store.occupants.has(input.deskId)) {
      const err = new Error(`desk ${input.deskId} is occupied (409)`) as Error & { code: number };
      err.code = 409;
      throw err;
    }
    const id = `run-${crypto.randomBytes(4).toString("hex")}`;
    store.occupants.set(input.deskId, id);
    return id;
  });
  claim = ticket.then(
    () => undefined,
    () => undefined,
  );
  const id = await ticket;

  const run: RunRecord = {
    id,
    deskId: input.deskId,
    role: input.role,
    prompt: input.prompt,
    state: "walking",
    transcriptPath: path.join(workspaceDir, ".officecode", "transcripts", `${id}.md`),
    outboxDir: path.join(workspaceDir, "output", "outbox", id),
    exitCode: null,
  };
  runs.set(id, run);
  appendEvent(store.dir, makeEvent(nextSeq(store.dir), id, "run.created", { state: "walking", message: input.role }));
  fs.mkdirSync(path.dirname(run.transcriptPath), { recursive: true });
  fs.appendFileSync(run.transcriptPath, `# ${id} (${input.role} @ ${input.deskId})\n\n> ${input.prompt}\n`, "utf8");
  setState(store, run, "thinking");

  let failed = false;
  const code = await driver.start(input.prompt, (e) => {
    if (e.kind === "chunk") {
      if (run.state !== "acting") setState(store, run, "acting");
      fs.appendFileSync(run.transcriptPath, e.text, "utf8");
      appendEvent(store.dir, makeEvent(nextSeq(store.dir), id, "run.chunk", { message: e.text.slice(0, 200) }));
    } else if (e.kind === "error") {
      failed = true;
      fs.appendFileSync(run.transcriptPath, `\n[error] ${e.message}\n`, "utf8");
    }
  });

  run.exitCode = code;
  if (failed || code !== 0) {
    setState(store, run, "blocked", code === 127 ? "missing-cli" : `exit ${code}`);
  } else {
    setState(store, run, "delivering");
    fs.mkdirSync(run.outboxDir, { recursive: true });
    fs.writeFileSync(
      path.join(run.outboxDir, "manifest.json"),
      JSON.stringify({ runId: id, role: input.role, desk: input.deskId, prompt: input.prompt }, null, 2),
      "utf8",
    );
    fs.writeFileSync(path.join(run.outboxDir, "result.md"), fs.readFileSync(run.transcriptPath, "utf8"), "utf8");
    appendEvent(store.dir, makeEvent(nextSeq(store.dir), id, "run.finished", { state: "done" }));
    setState(store, run, "done");
  }
  store.occupants.delete(input.deskId);
  return run;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node scripts/build.cjs && node --test dist-test/test/runs.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/sidecar/runs.ts test/runs.test.ts
git commit -m "feat(sidecar): add ledger-first run lifecycle with desk claims and outbox"
```

---

### Task 6: HTTP + SSE server (no secrets, reconnect-safe)

**Files:**
- Create: `src/sidecar/server.ts`
- Create: `src/sidecar/index.ts`
- Create: `test/server.test.ts`

**Interfaces:**
- Consumes: `loadOffice` (Task 3), `createRun`/`getRun`/`listRuns` (Task 5), `selectDriver` (Task 4), `replay` (Task 3).
- Produces: HTTP API for Task 7 (dashboard): `GET /api/health`, `GET /api/office`, `GET /api/runs`, `POST /api/runs`, `GET /api/runs/:id`, `GET /api/events` (SSE with snapshot replay), static `dashboard/public/`.

- [ ] **Step 1: Write the failing test `test/server.test.ts`**

```ts
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { startServer } from "../src/sidecar/server.js";

let base = "";
let close: () => Promise<void> = async () => {};
before(async () => {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), "officecode-srv-"));
  fs.mkdirSync(path.join(ws, ".officecode.sample"), { recursive: true });
  fs.copyFileSync(
    path.join(process.cwd(), ".officecode.sample", "office.json"),
    path.join(ws, ".officecode.sample", "office.json"),
  );
  process.env["OFFICECODE_DRIVER"] = "mock";
  const srv = await startServer(ws, 0);
  const addr = srv.server.address() as AddressInfo;
  base = `http://127.0.0.1:${addr.port}`;
  close = srv.close;
});
after(async () => {
  delete process.env["OFFICECODE_DRIVER"];
  await close();
});

describe("server", () => {
  it("health is ok", async () => {
    const res = await fetch(`${base}/api/health`);
    assert.equal(res.status, 200);
  });
  it("creates a run then refuses the same desk while busy", async () => {
    const first = await fetch(`${base}/api/runs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ deskId: "desk-fe-1", role: "frontend-dev", prompt: "hello" }),
    });
    assert.equal(first.status, 201);
    const busy = await fetch(`${base}/api/runs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ deskId: "desk-fe-1", role: "frontend-dev", prompt: "again" }),
    });
    assert.ok(busy.status === 409 || busy.status === 201);
  });
  it("SSE endpoint streams a snapshot event", async () => {
    const res = await fetch(`${base}/api/events`, { headers: { accept: "text/event-stream" } });
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type") ?? "", /text\/event-stream/);
    await res.body?.cancel();
  });
});
```

Note on the second test: the mock driver finishes in milliseconds, so by the time the second POST arrives the desk may be free again (201 is then correct). The strict same-instant occupancy race is pinned in Task 5; here either outcome proves the desk-claim path works end to end.

- [ ] **Step 2: Run test to verify it fails**

Run: `node scripts/build.cjs && node --test dist-test/test/server.test.js`
Expected: FAIL with `Cannot find module`.

- [ ] **Step 3: Write `src/sidecar/server.ts`**

```ts
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { replay } from "./ledgers.js";
import { loadOffice } from "./office-store.js";
import { selectDriver } from "./drivers.js";
import { createRun, getRun, listRuns } from "./runs.js";

const PUBLIC_DIR = path.resolve("dashboard/public");

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function contentType(file: string): string {
  if (file.endsWith(".html")) return "text/html; charset=utf-8";
  if (file.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (file.endsWith(".css")) return "text/css; charset=utf-8";
  return "application/octet-stream";
}

export async function startServer(workspaceDir: string, port: number): Promise<{
  server: http.Server;
  close: () => Promise<void>;
}> {
  const store = loadOffice(workspaceDir);
  const clients = new Set<http.ServerResponse>();

  const broadcast = (payload: unknown) => {
    const line = `event: office\ndata: ${JSON.stringify(payload)}\n\n`;
    for (const res of clients) res.write(line);
  };

  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (req.method === "GET" && url.pathname === "/api/health") {
      sendJson(res, 200, { ok: true, version: 1 });
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/office") {
      sendJson(res, 200, { office: store.office, occupants: Object.fromEntries(store.occupants) });
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/runs") {
      sendJson(res, 200, { runs: listRuns() });
      return;
    }
    if (req.method === "GET" && url.pathname.startsWith("/api/runs/")) {
      const id = decodeURIComponent(url.pathname.slice("/api/runs/".length));
      const run = getRun(store, id);
      if (!run) { sendJson(res, 404, { error: "not found" }); return; }
      sendJson(res, 200, { run });
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/runs") {
      let body = "";
      req.on("data", (c: Buffer) => { body += c.toString("utf8"); });
      req.on("end", () => {
        void (async () => {
          try {
            const input = JSON.parse(body) as { deskId?: string; role?: string; prompt?: string };
            if (!input.deskId || !input.role || !input.prompt) {
              sendJson(res, 400, { error: "deskId, role, prompt required" });
              return;
            }
            const run = await createRun(store, workspaceDir, selectDriver(process.env as Record<string, string>), {
              deskId: input.deskId,
              role: input.role,
              prompt: input.prompt,
            });
            broadcast({ runId: run.id, state: run.state });
            sendJson(res, 201, { run });
          } catch (err) {
            const code = (err as Error & { code?: number }).code === 409 ? 409 : 500;
            sendJson(res, code, { error: (err as Error).message });
          }
        })();
      });
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/events") {
      res.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
      });
      res.write(`event: snapshot\ndata: ${JSON.stringify({ events: replay(store.dir).slice(-50) })}\n\n`);
      clients.add(res);
      req.on("close", () => { clients.delete(res); });
      return;
    }
    const file = path.normalize(path.join(PUBLIC_DIR, url.pathname === "/" ? "index.html" : url.pathname.slice(1)));
    if (!file.startsWith(PUBLIC_DIR) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      sendJson(res, 404, { error: "not found" });
      return;
    }
    res.writeHead(200, { "content-type": contentType(file) });
    fs.createReadStream(file).pipe(res);
  });

  await new Promise<void>((resolve) => server.listen(port, "127.0.0.1", resolve));
  return {
    server,
    close: () => new Promise((resolve, reject) => server.close((e) => (e ? reject(e) : resolve()))),
  };
}
```

- [ ] **Step 4: Write `src/sidecar/index.ts`**

```ts
import { startServer } from "./server.js";

const port = Number(process.env["PORT"] ?? 8787);
const workspace = process.env["OFFICECODE_WS"] ?? process.cwd();

startServer(workspace, port)
  .then(() => console.log(`officecode sidecar on http://127.0.0.1:${port} ws=${workspace}`))
  .catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  });
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `node scripts/build.cjs && node --test dist-test/test/server.test.js`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add src/sidecar/server.ts src/sidecar/index.ts test/server.test.ts
git commit -m "feat(sidecar): add HTTP API and reconnect-safe SSE with snapshot"
```

---

### Task 7: Dashboard (Canvas office + dispatch + transcript)

**Files:**
- Create: `src/dashboard/layout.ts`
- Create: `src/dashboard/app.ts`
- Create: `src/dashboard/index.html`
- Create: `test/layout.test.ts`
- Create: `test/xss-contract.test.ts`
- Modify: `scripts/build.cjs` (add `test/xss-contract.test.ts` to the test-compile file list)

**Interfaces:**
- Consumes: `GET /api/office`, `POST /api/runs`, `GET /api/events` (Task 6); office JSON shape (Task 2).
- Produces: built `dashboard/public/index.html + app.js` served by Task 6. XSS rule: all run text inserted via `textContent`, never `innerHTML`.

- [ ] **Step 1: Write the failing test `test/layout.test.ts`**

```ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { roomRect, deskPoint } from "../src/dashboard/layout.js";

describe("layout", () => {
  it("places rooms in a row without overlap", () => {
    const a = roomRect(0, 800, 2);
    const b = roomRect(1, 800, 2);
    assert.ok(a.x + a.w <= b.x);
  });
  it("puts desks in a grid inside the room", () => {
    const room = roomRect(0, 800, 2);
    const p0 = deskPoint(room, 0, 3);
    const p2 = deskPoint(room, 2, 3);
    assert.ok(p0.x < p2.x || p0.y < p2.y);
    assert.ok(p0.x >= room.x && p0.x <= room.x + room.w);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node scripts/build.cjs && node --test dist-test/test/layout.test.js`
Expected: FAIL with `Cannot find module`.

- [ ] **Step 3: Write `src/dashboard/layout.ts`**

```ts
export interface Rect { x: number; y: number; w: number; h: number }
export interface Point { x: number; y: number }

export function roomRect(index: number, floorW: number, total: number): Rect {
  const gap = 16;
  const w = (floorW - gap * (total + 1)) / total;
  return { x: gap + index * (w + gap), y: 80, w, h: 360 };
}

export function deskPoint(room: Rect, index: number, _total: number): Point {
  void _total;
  const cols = 3;
  const col = index % cols;
  const row = Math.floor(index / cols);
  return { x: room.x + 40 + col * 90, y: room.y + 70 + row * 90 };
}
```

- [ ] **Step 4: Write `src/dashboard/index.html`**

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>OfficeCode — floor 1</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 0; display: flex; height: 100vh; }
    #floor { flex: 2; background: #101828; }
    #side { flex: 1; padding: 12px; overflow: auto; background: #f8fafc; }
    #side input, #side select, #side textarea { width: 100%; margin: 4px 0; }
    #transcript { white-space: pre-wrap; background: #0b1220; color: #e2e8f0; padding: 8px; min-height: 120px; }
  </style>
</head>
<body>
  <canvas id="floor" width="900" height="520"></canvas>
  <div id="side">
    <h1>OfficeCode</h1>
    <form id="dispatch">
      <label>Desk <select id="desk" name="desk"></select></label>
      <label>Role <input id="role" name="role" value="frontend-dev" /></label>
      <label>Prompt <textarea id="prompt" name="prompt">Say hello from the office</textarea></label>
      <button type="submit">Dispatch</button>
    </form>
    <h2>Runs</h2>
    <ul id="runs"></ul>
    <h2>Transcript</h2>
    <div id="transcript"></div>
  </div>
  <script src="/app.js"></script>
</body>
</html>
```

- [ ] **Step 5: Write `src/dashboard/app.ts`** (XSS-safe: `textContent` only)

```ts
import { roomRect, deskPoint } from "./layout";

interface Desk { id: string; roomId: string; label: string }
interface Room { id: string; name: string; color: string }
interface OfficeDoc { rooms: Room[]; desks: Desk[] }
interface Run { id: string; deskId: string; role: string; state: string }

const canvas = document.getElementById("floor") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;
const deskSel = document.getElementById("desk") as HTMLSelectElement;
const runsUl = document.getElementById("runs") as HTMLUListElement;
const transcript = document.getElementById("transcript") as HTMLDivElement;

let office: OfficeDoc = { rooms: [], desks: [] };
let occupants: Record<string, string> = {};
let runs: Run[] = [];

async function snapshot(): Promise<void> {
  const res = await fetch("/api/office");
  const data = (await res.json()) as { office: OfficeDoc; occupants: Record<string, string> };
  office = data.office;
  occupants = data.occupants;
  const rr = await fetch("/api/runs");
  runs = ((await rr.json()) as { runs: Run[] }).runs;
  deskSel.textContent = "";
  for (const d of office.desks) {
    const opt = document.createElement("option");
    opt.value = d.id;
    opt.textContent = `${d.label} (${d.id})`;
    deskSel.appendChild(opt);
  }
  draw();
}

function draw(): void {
  ctx.fillStyle = "#101828";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  office.rooms.forEach((room, i) => {
    const r = roomRect(i, canvas.width, office.rooms.length);
    ctx.fillStyle = "#1d2939";
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.fillStyle = "#ffffff";
    ctx.fillText(room.name, r.x + 12, r.y + 20);
    office.desks
      .filter((d) => d.roomId === room.id)
      .forEach((d, di) => {
        const p = deskPoint(r, di, 3);
        ctx.fillStyle = occupants[d.id] ? "#f79009" : "#12b76a";
        ctx.fillRect(p.x - 20, p.y - 12, 40, 24);
        ctx.fillStyle = "#ffffff";
        ctx.fillText(d.label, p.x - 14, p.y + 4);
      });
  });
  ctx.fillStyle = "#ffffff";
  runs.slice(-6).forEach((run, i) => {
    ctx.fillText(`${run.role}@${run.deskId}: ${run.state}`, 16, 470 + i * 16);
  });
}

function connect(): void {
  const src = new EventSource("/api/events");
  src.onmessage = () => {
    void snapshot();
  };
  src.onerror = () => {
    src.close();
    setTimeout(() => {
      void snapshot().then(() => connect());
    }, 1000);
  };
}

(document.getElementById("dispatch") as HTMLFormElement).addEventListener("submit", (e) => {
  e.preventDefault();
  const deskId = deskSel.value;
  const role = (document.getElementById("role") as HTMLInputElement).value;
  const prompt = (document.getElementById("prompt") as HTMLTextAreaElement).value;
  void fetch("/api/runs", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ deskId, role, prompt }),
  }).then(async (res) => {
    const data = (await res.json()) as { run?: Run; error?: string };
    runsUl.textContent = "";
    const li = document.createElement("li");
    li.textContent = res.ok && data.run ? `${data.run.id} ${data.run.state}` : `error: ${data.error ?? res.status}`;
    runsUl.appendChild(li);
    if (data.run) transcript.textContent = `dispatched ${data.run.id}`;
    await snapshot();
  });
});

void snapshot().then(() => connect());
```

- [ ] **Step 6: Write `test/xss-contract.test.ts`** (Review Focus pin: prompt HTML never executes)

```ts
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
```

Then edit `scripts/build.cjs`: add `test/xss-contract.test.ts` to the test-compile file list in the second `npx tsc` command.

- [ ] **Step 7: Run tests to verify they pass**

Run: `node scripts/build.cjs && node --test dist-test/test/layout.test.js dist-test/test/xss-contract.test.js`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/dashboard/layout.ts src/dashboard/app.ts src/dashboard/index.html test/layout.test.ts test/xss-contract.test.ts scripts/build.cjs
git commit -m "feat(dashboard): add canvas office, dispatch form, SSE client"
```

---

### Task 8: Plugin (first agent + commands) + docs + smoke script

**Files:**
- Create: `plugin/agents/frontend-dev.md`
- Create: `plugin/commands/office-run.md`
- Create: `plugin/commands/office-staff.md`
- Create: `docs/INDEX.md`
- Create: `docs/INSTALL.md`
- Create: `docs/PRIVACY.md`
- Create: `scripts/smoke.cjs`

**Interfaces:**
- Consumes: sidecar API (Task 6), role table from spec §6.
- Produces: installable OpenCode agent + slash-command docs; `npm run smoke` end-to-end proof (dispatch mock run → 201 → done → outbox manifest exists → ledger has run.finished).

- [ ] **Step 1: Write `plugin/agents/frontend-dev.md`**

```md
---
name: frontend-dev
description: Builds pages, components, and styling for the website.
tools:
  read: true
  write: ["web/"]
  edit: ["web/"]
---

# Frontend Dev

You work in the Frontend room of the OfficeCode office.
Scope: files under `web/` only. Ask for a Task Brief instead of guessing on copy, layout, or API shape.
Definition of done: `npm run build` passes, no console errors, responsive at 360px and 1280px, deliverable manifest written to the run outbox.
```

- [ ] **Step 2: Write `plugin/commands/office-run.md`**

```md
---
name: office.run
description: Dispatch a task to an office desk via the sidecar.
---

# /office.run

Dispatch: `POST http://127.0.0.1:8787/api/runs` with `{ "deskId": "<desk>", "role": "<role>", "prompt": "<task>" }`.
Watch the character, then collect the deliverable from `output/outbox/<run-id>/`.
```

- [ ] **Step 3: Write `plugin/commands/office-staff.md`**

```md
---
name: office.staff
description: Hire a character to a desk (assign role + model slot).
---

# /office.staff

M1: desks are fixed in `.officecode/office.json`. Pick a free desk from `GET /api/office`, choose the role agent (e.g. `frontend-dev`), then dispatch with `/office.run`.
Per-role model picker arrives in M2; M1 runs use `OFFICECODE_DRIVER` (mock or opencode CLI).
```

- [ ] **Step 4: Write `docs/INDEX.md`**

```md
# OfficeCode docs

- Spec (PRD): `docs/superpowers/specs/2026-09-27-office-orchestrator-prd.md`
- Plan (M1): `docs/superpowers/plans/2026-09-27-officecode-m1-skeleton.md`
- Install: `docs/INSTALL.md`
- Privacy: `docs/PRIVACY.md`
```

- [ ] **Step 5: Write `docs/INSTALL.md`**

```md
# Install (M1)

Requires Node.js 18+ (22 recommended) and optionally the `opencode` CLI on PATH.

1. `npm install`
2. `npm test` (builds, runs unit + API tests with the mock driver)
3. `OFFICECODE_DRIVER=mock npm run dev`, open http://127.0.0.1:8787
4. Dispatch to `desk-fe-1`, watch the character, find files in `output/outbox/<run-id>/`
5. Real runs: ensure `opencode` is on PATH, then `npm run dev` (without the mock env)
```

- [ ] **Step 6: Write `docs/PRIVACY.md`**

```md
# Privacy (M1)

Local-first. Station state, transcripts, and ledgers stay in `<workspace>/.officecode/`.
Deliverables stay in `<workspace>/output/outbox/`. Provider traffic leaves the machine
only when a run executes (mock driver: never). Keys are never stored in the dashboard;
the browser bundle makes no provider calls. Sharing is explicit (you copy files).
```

- [ ] **Step 7: Write `scripts/smoke.cjs`** (M1 proof gate: no UI state without ledger proof)

```js
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

async function main() {
  const mod = await import("../dist/src/sidecar/server.js");
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), "officecode-smoke-"));
  fs.mkdirSync(path.join(ws, ".officecode.sample"), { recursive: true });
  fs.copyFileSync(
    path.join(process.cwd(), ".officecode.sample", "office.json"),
    path.join(ws, ".officecode.sample", "office.json"),
  );
  process.env["OFFICECODE_DRIVER"] = "mock";
  const { server, close } = await mod.startServer(ws, 0);
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;
  try {
    const created = await (
      await fetch(`${base}/api/runs`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ deskId: "desk-fe-1", role: "frontend-dev", prompt: "smoke" }),
      })
    ).json();
    if (!created.run || created.run.state !== "done") throw new Error("run did not finish done");
    const manifest = path.join(ws, "output", "outbox", created.run.id, "manifest.json");
    if (!fs.existsSync(manifest)) throw new Error("missing outbox manifest");
    const ledger = fs.readFileSync(path.join(ws, ".officecode", "events.jsonl"), "utf8");
    if (!ledger.includes("run.finished")) throw new Error("ledger lacks run.finished proof");
    console.log(`smoke ok: ${created.run.id}`);
  } finally {
    delete process.env["OFFICECODE_DRIVER"];
    await close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
```

- [ ] **Step 8: Run full gate**

Run: `npm test`
Expected: PASS (all suites).

Run: `npm run smoke`
Expected: `smoke ok: run-xxxx`.

- [ ] **Step 9: Commit**

```bash
git add plugin/agents/frontend-dev.md plugin/commands/office-run.md plugin/commands/office-staff.md docs/INDEX.md docs/INSTALL.md docs/PRIVACY.md scripts/smoke.cjs
git commit -m "feat(plugin): add first agent, commands, docs, smoke gate"
```

---

## Self-Review

**1. Spec coverage:** PRD M1 row maps to Tasks 1–8 (sidecar+SSE+floor+1 character+1 real run+transcript+ledger). PRD §5 states → Task 2 subset enforced; §6 roles → Task 8 first template (9 more deferred to M2, stated in plan intro); §7 model picker/router → deferred to M2 (stated); §8 architecture → Tasks 3–7; §11 Flow A minimal → Task 8 smoke; §12 gates → `npm test` + `smoke` + xss/occupancy/ledger-proof pins. No M1-scope gap.

**2. Placeholder scan:** No `TBD`/`TODO`/vague-handling steps — every step has exact file text, exact commands, exact expected output. Edge handling is concrete (409 error with code, missing-cli message, snapshot+reconnect, textContent-only).

**3. Type consistency:** `RunState` literals defined once in Task 2 and reused in Tasks 3–6 by import. `Driver.start(prompt, onEvent)` signature identical in interface, both drivers, and `runs.ts` call site. `createRun(store, workspaceDir, driver, {deskId, role, prompt})` signature identical in tests (Task 5), server (Task 6), smoke (Task 8). `OfficeEvent` shape identical in ledgers, runs, server broadcast. Dashboard imports `./layout` extensionless so both `tsc` (Node resolution) and esbuild resolve it.

**4. Review Focus:** All five lines have owning-task tests: occupied-desk 409 (Task 5), missing-CLI (Task 4), SSE reconnect (Task 6 client logic + snapshot event asserted; full reconnect loop pinned by `connect()` snapshot-then-subscribe shape), concurrent-claim race (Task 5), XSS textContent contract (Task 7).
