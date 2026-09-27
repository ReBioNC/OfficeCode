# PRD — OfficeCode: Visual Working Agent Orchestrator for OpenCode (Office Theme)

**Version:** 1.0 (Draft for review)
**Date:** 2026-09-27
**Status:** Draft → awaiting user review before implementation plan
**Reference inspiration:** [androoAGI/starnet](https://github.com/androoAGI/starnet) — a living pixel-art station where real AI agents do real work
**Target host:** OpenCode (TUI / CLI / Web / Desktop-compatible, plugin + dashboard pattern)
**Stack decision:** Web dashboard (TypeScript) + Node sidecar + OpenCode plugin/SDK
**Theme:** Modern office, 2D characters (agents are people, not just desks)

---

## 1. Overview & Vision

OfficeCode is a **visual, working agent orchestrator** purpose-built for **OpenCode**. Instead of watching logs scroll, the user watches a **living 2D office**: characters walk to desks, sit down, type, meet, hand off work through hallways, and deliver finished files to an Outbox.

Like StarNet, the office is **not decoration — it is a projection of live runtime state**:

- **A room is a capability-scoped team** (e.g., Frontend room, Backend room, QA room).
- **A hallway is an authorized handoff lane** (e.g., Frontend → QA only if the lane exists).
- **A placed object is a real capability grant** (e.g., placing a DB console grants database tools).
- **A character is a real, bounded agent run** (own workspace, transcript, memory, permissions, model, budget).

The product contract is literal: **the interface must never assert state the orchestrator cannot prove.** No fake typing, no simulated revenue, no fake spend. Every visual state maps to a verifiable runtime event from the sidecar / OpenCode sessions.

### Why office theme (not space station)

- Instantly legible to any developer/client: desks, meeting rooms, outbox, manager office.
- Maps 1:1 to a **complete website-delivery crew**: Frontend, UI/UX, Backend, API, Database, DevOps, QA, PM.
- Fun without alienating enterprise users. Professional but playful 2D pixel / flat illustration style.

### Why OpenCode-native (not a fork of StarNet)

- Reuse OpenCode's strengths: `opencode.json` config, providers/models directory, agents, commands, MCP servers, permissions/policies, skills, SDK + server, share, sessions.
- No model lock-in: user brings their own keys (OpenCode Zen, OpenRouter, Anthropic, OpenAI, Google, Ollama local).
- Runs wherever OpenCode runs, with a local-first dashboard on `localhost`.

---

## 2. Goals & Non-Goals

### Goals (v1)

1. **See work happening:** every active OpenCode agent run has a visible 2D character with live status (idle, thinking, acting, waiting-approval, blocked, done).
2. **Orchestrate many models at once:** per-role custom model assignment (user-chosen), with concurrency limits, queueing, fallback, and cost control — optimized so 6–10 agents can run in parallel without bill shock or rate-limit collapse.
3. **Layout IS workflow:** drawing rooms/hallways/objects actually defines teams, handoffs, and tool grants enforced at runtime.
4. **Real execution only:** all agent work goes through real OpenCode sessions (SDK/CLI/server), real tools, real files, real ledgers.
5. **Complete web-dev crew out of the box:** role templates covering a full website build, each with system prompt, tools, model slot, and acceptance checklist.
6. **Attractive & fun:** smooth 2D office, character sprites, day/night + Night Shift mode, sound-optional, shareable snapshots.

### Non-Goals (v1)

- NOT a general autonomous company simulator, NOT a game with fake agents.
- NOT a desktop installer (Tauri/Electron) in v1 — web dashboard only.
- NOT a new model provider or billing platform — BYOK, costs read from provider/OpenCode data.
- NOT replacing OpenCode TUI/IDE — it complements them; TUI remains fully usable alongside.
- NOT multi-user SaaS / cloud hosting in v1 — single-user local-first.

---

## 3. Users & Personas

| Persona | Needs |
|---|---|
| **Solo builder (primary)** | Runs 3–8 agents in parallel (FE + BE + DB + QA), wants to see who is stuck, control spend, grab deliverables from Outbox. |
| **Power user with many models** | Has 5+ model keys (e.g., Opus for planning, Sonnet for coding, Haiku for review, local Ollama for drafts). Wants per-role routing + fallback so nothing stalls. |
| **Client / stakeholder** | Watches office view or shared snapshot to understand progress without reading logs. |
| **Future: small team** | (Post-v1) shared office view, role ownership. V1 is single-user but must not block this. |

### Success criteria (user-visible)

- User can go from empty office → staffed office running 5+ concurrent website roles in < 10 minutes.
- User can tell at a glance (≤ 5 seconds) which agent is working, blocked, or done.
- Zero simulated states: every status provable from session/event log.
- Multi-model run of 30 minutes stays within user-set budget and never deadlocks on rate limits.

---

## 4. Product Principles (borrowed from StarNet, adapted)

1. **Real work, real cost.** Model calls stream through local sidecar → OpenCode sessions. Spend, transcripts, tasks persist on disk and are shown as-is.
2. **Layout is policy.** No invisible wiring. If there is no hallway, there is no handoff. If there is no object, there is no tool.
3. **Secrets stay local.** Keys live in OS keychain / env / OpenCode auth, never in frontend localStorage. Frontend talks to sidecar over localhost; sidecar owns secrets.
4. **Ask before guessing.** Ambiguity produces a Task Brief (one concrete question + options) in dashboard and optionally via connected channels — never a silent wrong guess.
5. **Finished work has a front door.** Deliverables land in `OUTBOX/` as real files, not chat scrollback.
6. **Optimized concurrency.** Parallelism is bounded, queued, and budgeted. More agents ≠ more chaos.

---

## 5. The Office Metaphor (visual language)

### 5.1 Spatial hierarchy

```
Building (workspace root, e.g. ./my-website)
└── Floor (project / git worktree, e.g. floor-1 = webapp, floor-2 = docs)
    └── Room (capability-scoped team, e.g. Frontend Room, Backend Room)
        ├── Desk (agent seat: 1 desk = 1 concurrent agent slot)
        ├── Placed object (capability grant: DB console, API gateway, deploy button)
        └── Characters (agents currently clocked in)
Hallway (authorized handoff lane between rooms, directional, permission-checked)
Lobby (inbox: new user requests arrive here)
Outbox (finished deliverables counter near lobby)
Manager office (orchestrator / PM agent + budget board + briefs inbox)
```

### 5.2 Core visual entities

| Entity | Visual | Runtime meaning |
|---|---|---|
| **Character** | 2D sprite (top-down or 3/4 side view), per-role outfit color + face variant, name tag + model badge + status bubble | One bounded OpenCode session/run. Walks to desk on spawn, typing anim only while tokens stream, stands in meeting room during handoff, sleeps when idle. |
| **Desk** | Desk + chair + monitor (monitor glow = activity) | Concurrency slot. Empty desk = available capacity. No desk = cannot spawn that role in that room. |
| **Room** | Walled area with label + team color | Capability scope: allowed tools, allowed paths, allowed models, budget slice. Agents outside their room cannot touch its paths/tools. |
| **Hallway** | Floor path with arrows between rooms | Handoff lane. Work can only move Frontend → QA if that hallway exists and is open. Closed hallway = handoffs queued. |
| **Object** | Printer, DB console, deploy lever, keycard box, MCP plug | Capability grant. Placing/connecting it grants the room a tool set (e.g., DB console → `database_*` MCP tools). Removing it revokes. |
| **Brief board** | Whiteboard in Manager office | Pending Task Briefs (ambiguity questions) awaiting user answer. |
| **Budget board** | Wall chart in Manager office | Live spend vs. budget per room/agent/model. |
| **Outbox counter** | Counter with parcels | Completed deliverable files (real files under `output/outbox/`). Click → preview/open. |

### 5.3 Character states (must map 1:1 to runtime)

| State | Sprite cue | Trigger (provable) |
|---|---|---|
| `off-duty` | Not on floor | No session |
| `walking` | Walk cycle to desk | Session created, workspace assigned, not yet streaming |
| `thinking` | Thought bubble `...`, head tilt | Token stream = reasoning / planning, no tool call in last N sec |
| `acting` | Typing, monitor glow, tool icon bubble (🔧/🗄️/🌐) | Tool call in-flight (file edit, bash, MCP) |
| `waiting-approval` | Raised hand, yellow bubble | OpenCode permission request pending (`permission.asked`) |
| `blocked` | Red bubble, sits back | Error / rate-limit / missing brief answer / closed hallway |
| `in-handoff` | Two characters meet in hallway/meeting room | Handoff task created and accepted |
| `delivering` | Walks to Outbox with parcel | Deliverable file written + registered |
| `done` | Waves, walks to elevator / off floor | Session completed, transcript sealed |
| `sleeping` (Night Shift) | `Zzz`, dimmed floor | Leashed background mode, polling on cron |

No other states allowed. If runtime cannot prove it, the character does not show it.

### 5.4 Art direction

- 2D, crisp, readable at 720p–4K. Flat-with-soft-shadow or light pixel-art (decision deferred to the 1-day art spike in §16; default: flat vector sprites rendered on Canvas).
- Day / evening / Night Shift lighting. Subtle ambient motion (plants, coffee steam) that never implies work.
- Optional sound (keyboard clicks on tool events, chime on deliverable) — off by default.
- Accessibility: color-blind-safe team colors, status also encoded by icon + text, reduced-motion toggle, full keyboard nav, screen-reader list mirror of floor state ("Backend Ada is acting: editing auth.ts").

---

## 6. Crew: Complete Website-Delivery Roles (default templates)

V1 ships with **10 role templates** — enough to build a full website. Each template = OpenCode agent definition + office room/desk defaults + default tools + model slot (user-editable) + definition of done.

| # | Role | Room | Default responsibilities | Default tools (scoped) | Model slot default* |
|---|---|---|---|---|---|
| 1 | **PM / Orchestrator** | Manager office | Decompose request, staff rooms, open briefs, enforce budgets, accept Outbox | Plan, task graph, briefs, budgets (no direct code edit) | Strong reasoner (e.g., Opus-class) |
| 2 | **UI/UX Designer** | Design room | Wireframes, design tokens, mockups (HTML/CSS preview) | Read, write (design paths only), browser preview | Vision-strong model |
| 3 | **Frontend Dev** | Frontend room | Pages, components, styling, client logic | Read/write/edit (frontend paths), LSP, formatter | Fast coder (e.g., Sonnet-class) |
| 4 | **Backend Dev** | Backend room | Server, auth, business logic | Read/write/edit (backend paths), bash (scoped), LSP | Fast coder |
| 5 | **API Integrator** | Backend room (API corner) | Endpoints, contracts, OpenAPI, third-party wiring | Same as backend + network-scoped fetch | Fast coder |
| 6 | **Database Engineer** | Data room | Schema, migrations, queries, seeds | DB MCP tools only via DB-console object | Precise / cheap model |
| 7 | **DevOps / Platform** | Infra room | Env, scripts, CI, preview deploys | Bash (infra paths), deploy object only | Reliable / cheap |
| 8 | **QA Engineer** | QA room | Tests, repro, acceptance checklist | Read, test runner, browser (read-only prod) | Cheap reviewer |
| 9 | **Reviewer / Tech Lead** | Review corner | Code review, security pass, merge gate | Read + comment (no direct edit, or edit only on approval) | Strong reviewer |
| 10 | **Docs / Content** | Docs nook | README, copy, changelog, Outbox notes | Write (docs/output only) | Cheapest |

\* All model slots are **user-customizable**. Defaults are suggestions only; user pastes own provider keys and picks any OpenCode-supported model per role. The PRD mandates per-role model pickers, never hardcoded models.

Each role ships as an **OpenCode agent file** (e.g., `.opencode/agents/frontend-dev.md`) + sidecar metadata (sprite, room, tools, paths, budget weight, DoD checklist). User can duplicate (e.g., Frontend-2 desk) or create custom roles.

---

## 7. Multi-Model Orchestration (optimized for heavy users)

This is a first-class subsystem, not a settings afterthought — because the user explicitly runs many models under one orchestrator.

### 7.1 Per-role custom model assignment (core requirement)

- Every desk/role has a **model slot**: `provider + model ID + fallback chain + budget weight`.
- Model picker reads **live OpenCode providers/models** (Zen, OpenRouter, Anthropic, OpenAI, Google, Ollama) — only lists models the user's keys actually enable.
- User can set e.g.: PM=opus, Frontend=sonnet, QA=haiku, Docs=ollama/llama3.1, DB=gpt-4o-mini — any combo.
- Changing a model mid-run applies to **next task**, never silently swaps an in-flight run (avoids incoherent transcripts).

### 7.2 Model router + queue (optimization)

- **Concurrency caps:** global (e.g., 8) + per-room (e.g., Frontend ≤ 3) + per-provider rate guard. Desks beyond cap stay `walking→blocked(queued)` visibly waiting in lobby.
- **Priority queue:** PM tasks > briefs answers > handoffs > new builds > Night Shift. Starvation-proof (aging boost).
- **Smart routing:** task metadata (vision? long-context? cheap?) filters eligible models before assignment.
- **Fallback chains:** per-role ordered list (primary → fallback → local Ollama draft). On 429 / 5xx / timeout, sidecar auto-retries with jitter + failover and surfaces `blocked(retrying→fallback)` bubble — never silent.
- **Local-first drafting:** optional Ollama pass for scaffolds/summaries before cloud polish, to cut cost (toggle per role).

### 7.3 Budgets & ledgers (real, on disk)

- **Budget board:** per-run caps (tokens, USD, wall-clock, tool calls) + per-room + global daily cap. Enforced by sidecar; breach pauses character (`blocked(budget)`) and opens a brief ("raise cap / switch to cheaper model / stop?").
- **Ledgers:** append-only JSONL (`spend.jsonl`, `runs.jsonl`, `handoffs.jsonl`, `briefs.jsonl`) under workspace `.officecode/`. Dashboard renders them as-is; export CSV.
- **Cost preview:** before staffing 8 agents, UI shows estimated range based on role weights + selected models.

### 7.4 Isolation per run

- Each character = separate OpenCode session, separate git worktree (optional per floor) or path-scoped workspace, separate transcript (`transcripts/<run-id>.md`), separate memory file. No cross-talk except via hallway handoffs.

---

## 8. Architecture

### 8.1 Chosen approach: Web dashboard + TS Node sidecar + OpenCode plugin

```
┌─────────────────────────────────────────────────────────┐
│ Browser dashboard (TypeScript, Canvas 2D office)        │
│  floor renderer │ character sprites │ panels (tasks,   │
│  briefs, budget, outbox, transcripts) │ model pickers   │
│  SSE/WS client (no secrets here)                        │
└───────────────┬─────────────────────────────────────────┘
                │ localhost HTTP + SSE (events, no keys)
┌───────────────▼─────────────────────────────────────────┐
│ Node sidecar (TypeScript, Node core + tiny deps)        │
│  orchestrator │ model router │ budget guard │Todos│     │
│  hallway/handoff engine │ brief engine │ ledger writer  │
│  OpenCode driver (SDK → server → CLI fallback)          │
└───────────────┬─────────────────────────────────────────┘
                │ OpenCode SDK / server API / CLI + files
┌───────────────▼─────────────────────────────────────────┐
│ OpenCode (user's install)                               │
│  opencode.json │ agents/ │ commands/ │ MCP │ permissions│
│  sessions, skills, share, Zen/providers                 │
└─────────────────────────────────────────────────────────┘
  Disk: .officecode/{office.json, rooms/, runs/, transcripts/,
         ledgers/*.jsonl, outbox/} + output/outbox/ files
```

**Why this (vs. TUI-only / Tauri):** matches StarNet's proven sidecar pattern, keeps secrets in Node/OS keychain, lets the office be rich 2D Canvas while staying 100% OpenCode-compatible with zero fork. Tauri deferred to v2.

### 8.2 OpenCode integration points (concrete)

| Area | How OfficeCode uses it |
|---|---|
| `opencode.json` | Reads providers, models, permissions, MCP; writes namespaced `officecode.*` keys only (never clobbers user config; backup before write). |
| `agents/` (`.opencode/agents/*.md`) | Each role template installed as a real OpenCode agent. Character run = session with that agent. |
| `commands/` | `/office.staff`, `/office.run`, `/office.handoff`, `/office.brief`, `/office.outbox`, `/office.budget` slash commands usable from TUI too. |
| MCP servers | Objects on floor map to MCP grants (e.g., DB console → `database` MCP). Attach/detach = edit room scope. |
| Permissions / policies | Room scopes compile to OpenCode permission rules; `waiting-approval` bubbles reflect real permission prompts. |
| SDK / server | Primary driver: `sdk.session.create`, streaming events → character animation; CLI fallback (`opencode run`) if server unavailable. |
| Skills / references | Role DoD checklists and brief templates as skills/references. |
| Share | Snapshot link for office PNG + run summary via OpenCode share (explicit user action only). |
| Zen / providers | Model picker sources supported models; BYOK via `/connect` or env; Ollama via `127.0.0.1:11434`. |

### 8.3 Event & schema contracts

- `shared/` (additive, versioned): `events.ts` (run.created, token.stream, tool.called, permission.asked, handoff.*, brief.*, budget.*, deliverable.ready), `office.schema.json` (rooms, desks, hallways, objects, roster).
- Frontend consumes **only** sidecar SSE — never calls providers directly.
- All state transitions append to ledger first, then emit event (crash-safe; reload reconstructs office exactly).

### 8.4 File layout (repo v1)

```
officecode/
├── dashboard/          # TS + Canvas web UI (no secrets)
│   ├── src/views/office/  # floor, room, character, hallway renderers
│   ├── src/panels/        # tasks, briefs, budget, outbox, transcripts
│   └── src/sprites/       # 2D character + furniture assets
├── sidecar/            # Node orchestrator runtime (owns secrets)
│   ├── src/orchestrator.ts
│   ├── src/model-router.ts
│   ├── src/handoffs.ts
│   ├── src/briefs.ts
│   ├── src/budgets.ts
│   ├── src/opencode-driver.ts
│   └── src/ledgers.ts
├── shared/             # event + schema contracts (versioned)
├── plugin/             # opencode plugin: commands, agents, hooks
│   ├── agents/*.md     # 10 role templates
│   ├── commands/*.md
│   └── hooks/
├── docs/               # this PRD + later specs
└── test/               # unit + contract + e2e (see §12)
```

---

## 9. Functional Requirements

### FR-1 Office editing (layout IS workflow)

- FR-1.1 Create/rename building + floors (floors optionally backed by git worktrees).
- FR-1.2 Draw rooms, assign team color, set allowed paths + max desks.
- FR-1.3 Place desks (adds concurrency slot), move/delete (only when empty).
- FR-1.4 Draw hallways (directed, open/closed toggle). No hallway = handoff button disabled with explanation.
- FR-1.5 Place objects (DB console, API gateway, deploy lever, MCP plug, printer). Each shows granted tools; removing revokes immediately (in-flight tool calls finish, new ones denied).
- FR-1.6 Every edit writes `office.json` + ledger entry; invalid edits rejected with reason (e.g., "cannot delete occupied desk").

### FR-2 Staffing & models

- FR-2.1 Hire: pick role template → assign character name/sprite → pick model + fallbacks → place at desk. Validates: desk free, model available, budget allows.
- FR-2.2 Per-role model picker (custom, user-owned): provider dropdown → model dropdown (live from OpenCode) → fallback chain editor → budget weight slider.
- FR-2.3 Duplicate/clone role (e.g., Frontend-2), custom role creator (from scratch or from existing OpenCode agent).
- FR-2.4 Fire / off-duty: seals transcript, frees desk, preserves ledger.

### FR-3 Running work

- FR-3.1 Dispatch task to room or character (prompt + attachments + DoD checklist + budget slice).
- FR-3.2 Live view: character animates per §5.3; monitor glow while streaming; tool bubble per tool; transcript panel streams.
- FR-3.3 Permission prompts surface as `waiting-approval` bubble + panel approve/deny (respects OpenCode policies).
- FR-3.4 Pause / resume / cancel per run; cancel seals transcript with reason.
- FR-3.5 Night Shift: leashed background mode (cron + explicit tool allowlist + spend cap); every away-action logged and reviewable on return.

### FR-4 Handoffs (hallways)

- FR-4.1 Handoff = structured artifact (summary + files changed + tests + open items + next DoD), created by source agent, accepted by target agent.
- FR-4.2 Allowed only via open hallway; hallway closed → queued visibly.
- FR-4.3 Meeting visual: both characters walk to hallway/meeting room during transfer.
- FR-4.4 Handoff ledger entry; broken handoff (target rejects) returns to source as `blocked(needs-fix)`.

### FR-5 Briefs (ask before guessing)

- FR-5.1 Agent ambiguity → Task Brief: one question + 2–4 options + free-text + timeout default.
- FR-5.2 Surfaces on brief board + optional TUI/connected channel; blocks only dependent task, not whole floor.
- FR-5.3 Answer resumes run; timeout applies safe default and logs it.

### FR-6 Outbox & deliverables

- FR-6.1 Done = files in `output/outbox/<run-id>/` + manifest (what, how to run, tests, screenshots) + ledger entry.
- FR-6.2 Outbox counter UI: preview (markdown/HTML/image), open in editor, copy path, mark accepted/rework (rework spawns handoff back).
- FR-6.3 Acceptance checklists per role (e.g., Frontend: builds, responsive, no console errors).

### FR-7 Budgets, ledgers, transcripts

- FR-7.1 Budget board: global/room/run caps (USD, tokens, minutes, tool calls); breach behavior per §7.3.
- FR-7.2 Ledgers on disk (JSONL), rendered as-is, exportable; run history filterable by room/agent/model/outcome.
- FR-7.3 Transcripts per run (full prompt + stream + tool I/O redacted for secrets), memory file per character.

### FR-8 Recipes, schedules, connectors (StarNet parity, scoped)

- FR-8.1 Recipes: one-click multi-step flows (e.g., "New landing page": PM→Design→Frontend→QA→Outbox).
- FR-8.2 Schedules: cron for Night Shift checks (e.g., "nightly QA sweep"), visible in dashboard.
- FR-8.3 Connectors: attach MCP servers via paste-key/OAuth UI (keys → keychain, never frontend); per-room grant via objects.
- FR-8.4 Voice (post-v1, optional): push-to-talk dispatch, one office voice for summaries.

---

## 10. Non-Functional Requirements

| Category | Requirement (v1) |
|---|---|
| **Performance** | Dashboard 60fps with 10 characters on Canvas; SSE p95 < 300ms on localhost; sidecar memory < 300MB with 8 active runs; cold start (empty → staffed) < 10 min user time. |
| **Multi-model optimality** | 8 concurrent runs without manual juggling: queue p95 wait visible, auto-fallback on 429/5xx, no run starved > 5 min when capacity exists; cost within 10% of preview estimate when models unchanged. |
| **Reliability** | Crash-safe: kill -9 sidecar mid-run → restart reconstructs office from disk, marks interrupted runs `blocked(interrupted)`, offers resume/requeue. No lost ledger entries. |
| **Local-first & privacy** | Station state, transcripts, memory, ledgers stay in workspace unless user uses network tool/connector/share. Provider calls leave machine only to run agents. Full data map in PRIVACY.md. |
| **Security** | Secrets in sidecar/OS keychain/env only; permission prompts enforced; room path sandboxing; OWASP-lite (no XSS via prompt content — render transcripts as text, sanitize previews); secret scanner in CI. |
| **Compatibility** | Windows 10/11 (primary, WSL-friendly), macOS (Apple Silicon + Intel), Linux. Node 18+ (22 matches CI). Works with existing OpenCode installs; never overwrites user config without backup. |
| **Accessibility** | Keyboard-complete, screen-reader mirror, reduced-motion, color-blind-safe palette, resizable text. |
| **Observability** | Structured logs, run receipts (model, tokens, cost, duration, tools, outcome), QA journeys ledger. |

---

## 11. UX Flows (happy paths)

### Flow A — First office (empty → staffed → shipped)

1. `npx officecode init` (or plugin install) → dashboard opens on `localhost:8787`, empty floor + Lobby.
2. Connect provider (BYOK via OpenCode `/connect`, or Ollama auto-detect).
3. Pick recipe "Full website" → rooms/desks/hallways/objects auto-laid (editable).
4. Hire: assign model per role (picker shows only enabled models) → characters walk in.
5. Describe site in Lobby ("SaaS landing + auth + blog") → PM decomposes → tasks fan out.
6. Watch: FE types, BE calls DB console, QA runs tests, brief pops ("which auth: Clerk vs. self-host?") → answer → resume.
7. Deliverables parcel to Outbox → preview → accept. Budget board shows spend per role.

### Flow B — Blocked & rescued by multi-model fallback

1. Frontend (Sonnet) hits 429 → bubble `blocked(retrying)` → auto-failover to Haiku per chain → continues; ledger notes fallback + cost delta.
2. If all cloud fail → Ollama draft mode (if enabled) or queued visibly; user can swap model or pause room.

### Flow C — Night Shift

1. Toggle Night Shift: set cap ($5, tools: read/test only, no deploy) → lights dim, characters yawn.
2. Morning: review away-log (what ran, what paused, spend) → accept/rework Outbox items.

---

## 12. Testing & Release Gates (StarNet-inspired, OpenCode-scoped)

- `test:fast` (required merge gate): unit (router, budgets, hallway policy, ledgers) + contract (event/schema version match dashboard↔sidecar↔plugin).
- `test:e2e`: live sidecar + mocked OpenCode server (stream, tool, permission, handoff, brief, budget breach, crash-recovery).
- `test:live` (manual, BYOK): real 3-agent website slice on cheap models, asserts Outbox files + ledger spend > 0 and matches provider usage directionally.
- `security:secrets`: full-history secret scan (gitleaks), frontend secret audit (no keys in bundle).
- Release aggregate `qa:ready`: candidate-bound (any new commit invalidates prior READY until affected gates rerun). QA receipts + findings ledger in `qa/`.
- Product law gate: **no UI state without ledger proof** — automated check that every character state in a recorded session maps to a ledger event.

---

## 13. Metrics (v1)

- Time-to-first-staffed-office < 10 min (p50).
- Glanceability: user identifies blocked agent in ≤ 5s (qualitative test, 5 users).
- Concurrency: 8 parallel runs, zero starvation, fallback success ≥ 95% on injected 429s.
- Budget adherence: actual vs. preview within ±10% (same models/tasks).
- Delight: ≥ 4/5 "fun to watch" rating; ≥ 80% can explain hallway/object rules without docs.

---

## 14. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| OpenCode API drift (SDK/server changes) | Version-pinned driver + CLI fallback + contract tests; additive `shared/` schemas. |
| Rate limits with many models | Per-provider guards, queue, fallback chains, Ollama draft, visible queued state. |
| Cost overrun | Hard caps + previews + Night Shift leash + per-run kill switch. |
| Visual ≠ runtime (fake states) | Product-law gate; animation driven solely by events; code review checklist. |
| Windows quirks (primary target) | WSL-friendly paths, no POSIX-only deps, CI on Windows + macOS. |
| Sprite/art cost | Start flat-vector (code-drawn), commission pixel pack post-v1; keep art swappable. |

---

## 15. Roadmap

- **M1 — Skeleton office ( Weeks 1–2 ):** sidecar + SSE + empty floor renderer + 1 character + 1 real OpenCode run + transcript + ledger.
- **M2 — Crew & models ( Weeks 3–4 ):** 10 role templates, desks/rooms, per-role model picker + fallback, concurrency queue, budget board v1.
- **M3 — Hallways & handoffs + briefs + Outbox ( Weeks 5–6 ):** directed lanes, handoff artifacts, brief board, Outbox manifests, recipes (1–2).
- **M4 — Polish & gates ( Week 7 ):** Night Shift, schedules, connectors (MCP), sound/reduced-motion, `qa:ready`, docs (INSTALL, PRIVACY, INDEX).
- **v2 (deferred):** Tauri desktop shell, voice, Telegram/Discord/Slack control, multi-user, marketplace of role packs.

---

## 16. Open Questions (to resolve before implementation plan)

1. Canvas engine: hand-rolled Canvas 2D vs. Phaser vs. Pixi — need a 1-day spike for sprite + 10-char perf on Windows.
2. OpenCode driver: SDK-first vs. server-first — confirm streaming event shape on installed OpenCode version.
3. Floor backing: git worktree per floor vs. path-scoping only — worktree is cleaner but heavier on Windows.
4. Exact default model IDs (must stay generic in PRD; resolve at install time from live provider list).
5. Snapshot/share format (PNG + markdown receipt vs. link).

---

## Appendix A — Glossary (office terms)

Lobby, Floor, Room, Desk, Hallway, Object/grant, Character/agent run, Brief, Handoff, Outbox, Night Shift, Budget board, Recipe, Ledger, Transcript.

## Appendix B — What we take from StarNet vs. what we change

| StarNet | OfficeCode |
|---|---|
| Pixel space station, Tauri + Node sidecar + vanilla JS | 2D office, web dashboard + TS Node sidecar + OpenCode plugin (Tauri deferred) |
| Rooms = teams, hallways = lanes, objects = grants | Same law, office-skinned + 2D walking characters (not just stations) |
| BYOK OpenRouter/OAuth/Ollama, ledgers, Outbox, Night Shift, recipes, briefs, MCP | Same, but routed through OpenCode providers/agents/commands/permissions/MCP + per-role multi-model optimization as first-class |
| Simulation forbidden | Same product law, plus automated gate |

---

**Next step:** user reviews this PRD. On approval, invoke `writing-plans` to create the implementation plan (M1–M4 breakdown, file-by-file tasks, test gates). No product code until plan is approved.
