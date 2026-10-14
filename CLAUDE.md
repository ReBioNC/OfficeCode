# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

OfficeCode is a pixel-art office dashboard that visualizes OpenCode and Hermes Agent sessions as characters in rooms. It is a plugin for both hosts: the agent app runs every model, and the dashboard makes no model calls. `AGENTS.md` (local, gitignored, written in Indonesian) has a longer reference. Parts of it are stale: UI labels and `lang` are now English, not Indonesian.

## Commands

```bash
npm ci
npm run typecheck          # tsc --noEmit
npm run build              # scripts/build.cjs: tsc → dist/, tests → dist-test/, esbuild dashboard → dashboard/public/
npm test                   # build + node --test "dist-test/test/*.test.js"
npm run smoke              # build + scripts/smoke.cjs
npm run install:opencode   # build + install global OpenCode plugin and /dashboard command
npm run install:hermes     # build + install Hermes native plugin and MCP entry (needs `hermes` CLI and Python with PyYAML)
```

Run a single test (tests run from compiled JS, so build first):

```bash
npm run build && node --test dist-test/test/server.test.js
```

Python contract tests (`test/hermes_adapter_test.py`, `test/hermes_config_test.py`) run through `test/hermes-plugin.test.ts` and `test/hermes-install.test.ts` with `python -B`. Set `OFFICECODE_PYTHON` to choose the interpreter.

Dev server without API keys (keep it in the background and check `GET /api/health`). Do not run it in the foreground as an agent:

```powershell
$env:OFFICECODE_DRIVER="mock"; npm run dev    # http://127.0.0.1:8787
```

## Build gotcha: explicit test list

`scripts/build.cjs` compiles tests into `dist-test/` from a **hard-coded list of files**. **Add every new `test/*.test.ts` to that list**, plus any `src/` module it imports that the list doesn't already cover. Otherwise the test silently never runs. Never edit `dist/`, `dist-test/` or `dashboard/public/` by hand; they are build output and gitignored.

## Architecture

**Sidecar** (`src/sidecar/`) is a plain `node:http` server bound to `127.0.0.1` only. Entry `index.ts` reads `PORT` (default 8787) and `OFFICECODE_WS` (default cwd). `server.ts` holds all routes in one handler, SSE broadcast (`/api/events`), and static serving of `dashboard/public/` with a path-traversal guard. State is in-memory (`runs` map, `occupants: deskId→runId` in `office-store.ts`) plus append-only JSONL under `<workspace>/.officecode/` (`ledgers.ts`). `runs.ts:setOnRunUpdate/setOnSettled` hooks feed `broadcast()` and `queue.ts:pumpQueue()`.

There are two run sources:
- **Dispatched runs**: `POST /api/runs` → `queue.ts:enqueueOrRun` (global cap `OFFICECODE_MAX_CONCURRENT`, default 8; returns 201/202/409/402) → `runs.ts:createRun` with a driver from `drivers.ts:selectDriver` (`mock`, or the `opencode run` CLI). Lifecycle: `walking → thinking → acting → delivering → done | blocked`. Output goes to `output/outbox/<run-id>/`.
- **Mirrored sessions**: `POST /api/mirror/session|event|finish` project *external* host sessions onto the floor. This is how the OpenCode and Hermes integrations work. They carry `runtime`, `agent`, `parentSessionId` and `ownerLeaseId`.

**Leases and project registry.** With `OFFICECODE_MIRROR_ONLY` and leasing enabled, each host connection holds a lease (`POST/DELETE /api/lease`, 32-hex id). The server shuts down after its last lease expires, and a released owner's characters are removed. Hosts find a running studio through `%LOCALAPPDATA%/OfficeCode/projects/<sha256(workspace)[0:16]>/connection.json` (`~/.local/share/...` on non-Windows) and verify it with `/api/health` (`service`, `workspace`, `mirrorOnly`, `leaseManaged`). `GET /api/projects` lists other live studios for the dashboard's project switcher (`project-discovery.ts`).

**Host integrations.** All of them must fail silently with short timeouts. A dead dashboard must never break the host.
- OpenCode: `.opencode/plugins/office-dashboard.js` (pure ESM). It spawns or attaches to the sidecar, holds a lease, and maps session, tool and permission events to mirror calls. OpenCode 1.x uses the named export `OfficeDashboardPlugin` (hooks). OpenCode 2.x **requires** `export default { id, setup }`, otherwise it fails with "Plugin failed". `setup(ctx)` translates `ctx.event.subscribe` `{type, data}` events (`session.execution.*`, `session.tool.*`, `permission.*`) into the same V1 handlers. Keep both paths.
- Hermes: `integrations/hermes/__init__.py` is the native observer plugin. `scripts/hermes-bridge.cjs` is a pipe from Python that sends sanitized snapshots to the leased server. `scripts/hermes-mcp.cjs` is a stdio MCP connector that starts the studio when Hermes launches (only protocol output on stdout; diagnostics go to stderr). `integrations/hermes/delegation.py` plus `scripts/delegate-opencode.cjs` provide the `officecode_delegate_opencode` tool, which runs a real `opencode` CLI job (up to 4 concurrent) and links parent and child characters. Installers are `scripts/install-hermes.cjs` and `scripts/configure-hermes-mcp.py`.
- `plugin/agents/` (10 roles) and `plugin/commands/office-*.md` are OpenCode agents and slash commands.

**Dashboard** (`src/dashboard/`) is bundled by esbuild into a single IIFE. `index.html` contains all the CSS. `app.ts` handles fetch and SSE (coalesced `snapshot()` over `/api/office|runs|queue|budgets`), panels and canvas drawing. Pure logic lives in small modules that are unit-tested on their own: `studio-map.ts` (geometry, doors, obstacles), `agent-motion.ts` (route planning through doors, 120px/s), `live-agents.ts` (keeps finished or blocked runs off the floor), `studio-seating.ts`, `studio-camera.ts`, `agent-provenance.ts`, `sprites.ts` (pixel art as string grids, `.` = transparent). The canvas uses `imageSmoothingEnabled=false`, `requestAnimationFrame` only while agents move and the tab is visible, and honors `prefers-reduced-motion`.

`src/shared/` holds the event contract (`events.ts`) and office schema validation (`office-schema.ts`). The seed office is at `.officecode.sample/office.json`.

## Rules

- Product text (UI, bubbles, roles, notifications, command replies) is in English. Keep host-provided text (prompts, session titles, custom agent names) as it is.
- Prompts and session text are untrusted. Always escape them in the UI (`test/xss-contract.test.ts`). Don't render raw HTML.
- The dashboard is read-only except for `PUT /api/models` and `PUT /api/budgets`. Both are whole replacements, so GET first. `/dashboard` and `/office-dashboard` commands must not change state.
- Dollar amounts are estimates (`budgets.ts`: tokens = chars/4). Always label them `est.` in the UI, the API and replies.
- Don't rename DOM ids used by `app.ts` (`floor, floorMeta, lastSync, connection, statActive, statQueue, statSpent, runs, activityCount, queue, queueCount, queueEmpty, crew, crewCount`), `STATUS_LABEL` or `BUBBLE_TEXT` without updating `app.ts` and the contract tests.
- An API change requires updating the README API table and the `test/server*.test.ts` files. Every `plugin/commands/office-*.md` file needs `description:` frontmatter (`commands.test.ts`).
- Server tests isolate the workspace with `fs.mkdtempSync(os.tmpdir())`, `startServer(ws, 0)` and `OFFICECODE_DRIVER=mock`. Plugin tests drive the ESM plugin in a child `node --input-type=module` process, with `OFFICECODE_NO_SPAWN=1` where spawning must be avoided.
- After dashboard changes, run `npm run build` and `npm test`. After sidecar changes, also check `GET /api/health|office|runs|queue|budgets`.
- Design specs and implementation plans are in `docs/superpowers/specs/` and `docs/superpowers/plans/`. The current milestone is `2026-10-13-mixed-runtime-studio*`.
