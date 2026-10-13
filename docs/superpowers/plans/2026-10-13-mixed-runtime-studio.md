# Shared runtime studio implementation plan

> **For agentic workers:** Use superpowers:subagent-driven-development for the independent metadata/worker units; the coordinating agent integrates lifecycle and installation. Track acceptance with the tests below.

**Goal:** Independent automatic dashboards, verified Hermes-to-OpenCode delegation, and an inspector identifying both runtimes.

**Architecture:** Keep the mirror HTTP service read-only to users. Add additive provenance, a stdio MCP startup/status connector, and a native Hermes delegation handler that receives trusted session_id from Hermes dispatch kwargs. OpenCode jobs consume JSON events, use independent sessions, and return assistant results to Hermes.

**Tech stack:** Node.js 18+, TypeScript, Python standard library, node:test, Hermes native plugin APIs and stdio MCP.

**Spec:** docs/superpowers/specs/2026-10-13-mixed-runtime-studio-design.md

## Constraints and review focus

- Work in the current checkout on M3, as requested. Commit each deliverable; do not push/merge.
- No provider calls for visualization; tests use deterministic CLI fixtures and isolated temporary homes.
- English product text. Preserve model/config/plugin/permission policies and existing dashboard IDs.
- Parent identity comes from Hermes handler kwargs and observer aliases, never model input or last-active guesses.
- Explicit optional shared studio identity is distinct from actual task workspace.
- Verify failed completion retries, lease ownership, canceled process trees, stdout protocol purity, malformed JSON/large output, absent CLI, workspace configuration preservation, and mixed-runtime inspection.

## Task 1: Provenance and inspector

Files: src/sidecar/runs.ts, src/sidecar/server.ts, src/dashboard/app.ts, src/dashboard/index.html, metadata helper and tests; README API rows.

Interface: optional runtime ('opencode'|'hermes') and workspace on mirror registration and RunRecord. Inspector shows runtime/agent/workspace/parent, with Unknown runtime and Not provided fallbacks. Crew/delegation carry badges. Preserve click/keyboard/live history behavior.

- [ ] Write RED API tests for round-trip/update/invalid metadata and UI helper fallbacks.
- [ ] Implement additive validation/storage and safe UI rendering.
- [ ] Run build, targeted tests, full npm test and browser inspector checks.
- [ ] Commit feat: identify runtime and workspace in agent inspector.

## Task 2: Host startup, shared studio and installation

Files: scripts/hermes-mcp.cjs, scripts/hermes-bridge.cjs, integrations/hermes/__init__.py, scripts/install-hermes.cjs, scripts/install-global.cjs, .opencode/plugins/office-dashboard.js, README/GUIDE and startup/installer tests.

Interface: bridge accepts {kind:'start'} before any session. OFFICECODE_STUDIO_WORKSPACE explicitly selects shared studio; Hermes registration retains studioWorkspace. MCP exposes only officecode_status (read-only), speaks newline JSON-RPC, owns a bridge pipe/lease, and starts on initialize. Hermes observer and dashboard command use the same resolved studio. Both installers accept --studio-workspace <absolute-existing-directory>; default/update preserves existing choice. Global OpenCode plugin reports runtime/workspace and honors child-only OFFICECODE_MIRROR_DISABLED.

- [ ] RED startup protocol test: idle health, zero runs, status, EOF shutdown; two owners survive one close.
- [ ] RED installer preservation test for MCP configuration, other plugins, model settings and shared studio.
- [ ] Implement startup connector, bridge boot record, observer config and installer updates.
- [ ] Add pasteable Hermes install/update prompts and shared/standalone usage.
- [ ] Run full suite and isolated installed-Hermes MCP-client startup check, commit startup deliverable.

## Task 3: Real delegation worker and native tool

Files: scripts/delegate-opencode.cjs, integrations/hermes/delegation.py, integrations/hermes/__init__.py, plugin.yaml, worker/adapter tests and docs.

Worker interface: runJob(input,onEvent,options?) => Promise<{outcome,result,sessionId?,exitCode?,truncated?}>. Input prompt/workspace/agent/role/parentSessionId; options supply AbortSignal, trusted executable and timeout for tests. CLI wrapper reads one JSON input and emits {kind:'event',event} snapshots plus one {kind:'result',result}. Events carry runtime:'opencode', actual workspace and parentSessionId; execution/result buffers follow the spec. No shell/auto/pure flags. Only OfficeCode child telemetry is suppressed to avoid duplicates.

Native interface: officecode_delegate_opencode(args,**kwargs) receives session_id from Hermes. Resolve active canonical parent under observer lock, require explicit directory, cap four jobs, spawn worker, forward sanitized snapshots through Channel, return final assistant text/outcome. Host shutdown cancels owned workers. Registry schema/check_fn use public Hermes APIs and gracefully handle absent OpenCode; no MCP duplication.

- [ ] Worker RED fixtures: argv/stdin, successful results/tools, missing CLI, nonzero/errors, malformed/large JSON, timeout/cancellation, permission preservation and process cleanup.
- [ ] Native RED fixtures: trusted parent/canonical compression identity, role/workspace, result forwarding, capacity and no raw output in telemetry.
- [ ] Implement worker and native handler; include new plugin file in installer.
- [ ] Verify >4 children safely, concurrent hosts, browser mixed-origin inspector/completion and protocol startup.
- [ ] Final fresh code review, full npm test, native installed loader + MCP checks, install tested updates preserving settings, commit delegation task.

## Execution ledger

- User approved the written design and explicitly requested implementation. Proceed through all tasks without another design gate.
- Ruling: Use trusted session_id supplied to native handlers by installed Hermes model_tools/registry dispatch. This is more reliable than reading mutable process environment or inferring MCP parents.
