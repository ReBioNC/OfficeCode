# Studio Interactions Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement the approved three features inline, with a commit per task on M3.

**Goal:** Make actual OpenCode activity recognizable through poses/screens, completed delegation transfers and room/computer inspection.

**Architecture:** Derive visuals from existing activities, active tools and parent session links. Keep motion and hit testing in focused browser modules; reuse the map and seat geometry. No server, plugin or model requests are added.

**Tech Stack:** TypeScript, Canvas 2D, node:test, existing browser verification.

**Spec:** User approved recommendations 1, 2 and 3: differentiated activity animation; a symbolic result packet from a finished subagent to its active parent; clickable rooms and computers to inspect occupants/activity.

## Global Constraints

- English product copy and code comments; user/session text remains unchanged.
- Preserve twelve avatar styles, routing, completion removal, four clock themes and panel/camera preferences.
- Hidden tabs pause motion; reduced motion uses static poses and skips animated transfers.
- Dashboard remains read-only; no extra model calls or guessed percentage/test results.
- Commit each task on M3; never commit generated build or runtime data.

## Review Focus

- Concurrent tools and permissions must take priority over decorative activity labels.
- Initial loads, repeated snapshots and a new turn in the same session must not replay old completion transfers.
- Completed/failed parents, child errors and missing relationships must not create fake transfers.
- Room membership follows actual rendered positions; computer inspection uses the assigned active session and includes overflow desks.
- Pan/zoom/touch must not accidentally inspect objects; all room/agent actions must have keyboard alternatives and escaped text.

### Task 1: Activity poses and screens

**Files:** new src/dashboard/activity-visuals.ts, sprites.ts, app.ts, .opencode/plugins/office-dashboard.js, test/activity-visuals.test.ts, test/opencode-plugin.test.ts, scripts/build.cjs, docs/GUIDE.md.

**Interfaces:** activityVisual(run: WorkflowRun, waiting?: boolean): ActivityVisual; activityPose(kind, seated, phase): FrameName; drawActivityScreen(ctx, kind, desk, phase) and drawActivityProp(ctx, kind, x, y, phase).

- [x] Write and run failing tests for distinct activity kinds, actual terminal test commands, permissions/local tools, seated reading and stable sprite maps.
- [x] Add four typing poses, reading/checking poses, differentiated browser/editor/terminal/test screens and document/search props. Draw them only at an arrived activity station.
- [x] Run build, full npm test and browser screenshots proving activity changes without layout/model changes.
- [x] Document and commit `feat: visualize distinct agent activities and computer screens`.

### Task 2: Delegation result transfers

**Files:** new src/dashboard/result-transfers.ts, app.ts, test/result-transfers.test.ts, scripts/build.cjs, docs/GUIDE.md.

**Interfaces:** completionTransfers(previous, current, positions): TransferSeed[]; transferPoint(from,to,progress): Point; local live transfer state holds elapsed time and parent run identity.

- [x] Write and run failing tests for observed active-child completion, real active parent, duplicate/initial snapshots, errors, new turns and interpolation endpoints.
- [x] Draw a transient pixel packet above the map from the last child location toward the live parent. Remove the child immediately, bound transfer count/lifetime, retain needed canvas height, and pause hidden motion. Reduced motion skips transfers.
- [x] Verify actual API completion in browser, disappearance, expiry, parent completion cancellation, snapshot/reload suppression and hidden-tab behavior; run full suite.
- [x] Document symbolic packets and commit `feat: animate completed delegation results`.

### Task 3: Room and computer inspection

**Files:** new src/dashboard/studio-interactions.ts, app.ts, index.html, panel-layout.ts, test/studio-interactions.test.ts, scripts/build.cjs, README.md, docs/GUIDE.md.

**Interfaces:** roomAt(point,height), roomResidents(roomId,positions), hitComputer(point,seats,extraDesks) reuse shared geometry. attachPanelLayout returns showActivity() for explicit inspection actions.

- [ ] Write and run failing tests for all rooms, corridors, overflow, monitor hit boxes and unique current occupants.
- [ ] Add map/keyboard room selection, room highlight and live occupant inspector. Agent hits precede computers; computers precede rooms. Empty computers show a clear local notice; selecting opens the hidden activity panel. Preserve click suppression after pan/pinch.
- [ ] Verify scaled clicks, occupied/empty desks, room selection, hidden panel restore, keyboard focus, moving/completed occupants and mobile controls; run full suite.
- [ ] Update README/guide and commit `feat: inspect studio rooms and computers`.

## Execution notes

User explicitly requested implementation of the three proposed features. Continue inline without additional design approvals. Pre-flight: Task 1 shares only app.ts rendering with Tasks 2/3; Task 2 consumes existing positions before snapshots remove completed agents; Task 3 uses the same points/seat map. No conflicting interfaces.

Task 1 ruling: existing plugin terminal metadata was only "Running commands", so a minimal hook change classifies recognizable test commands and forwards only "Running tests". No raw shell arguments, new activity enum or API changes are needed. Generic/ambiguous commands keep the normal terminal cue.

Task 1 verification: four activity/pose tests failed before implementation; plugin safe-cue tests then reproduced missing testing metadata. Build and full npm test passed (135 tests). Browser checks confirmed four distinct computer screens, document poses, test/permission labels and immediate completion removal; screenshots inspected. Twelve avatar styles retain their dimensions and palettes.

Task 2 verification: completion creation/interpolation tests failed before implementation; full npm test passed (139 tests). Controlled-clock browser verified actual child completion, moving packet, immediate character removal, hidden pause/resume, packet expiry, reload suppression, stopped-child guard and reduced motion. Ruling: packets float above the map rather than using character walk routes; they are symbolic result transfers, follow the live parent, last 1.8 seconds and are capped at 12 concurrent packets. A new parent turn cannot inherit an old transfer.
