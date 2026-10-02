# Expanded Office Implementation Plan

> **For agentic workers:** Execute in this session using superpowers:executing-plans. The user approved the interactive prototype and requested immediate implementation and a commit per task.

**Goal:** Apply the approved spacious office and make its rooms follow actual OpenCode work, including a waiting lounge for delegated dependencies.

**Architecture:** Keep the mirror API unchanged. Share room, door, furniture and seat geometry between rendering and navigation; derive destinations from existing tool and session events. Keep artwork cached and motion local to the browser.

**Tech Stack:** TypeScript, Canvas 2D, node:test, existing OpenCode plugin.

**Spec:** Approved expanded-office prototype in the conversation, with lobby/reception, code workspace, library, planning room, focus/review and lounge/coffee connected by generous corridors.

## Global Constraints

- Product UI and comments use English.
- Actual OpenCode sessions only; no synthetic agents or extra model calls.
- Preserve completion removal, twelve avatars, clock themes, optional relations, selection and camera.
- Preserve read-only mirror mode and OpenCode lifecycle.
- Commit every task on M3; generated assets and runtime data remain ignored.

## Review Focus

- Routes between every room and overflow desks must avoid walls and furnishings.
- Crowds must retain distinct stable places after completion and activity changes.
- A pending delegation alone must not mask permission waits or simultaneous local tools.
- A parent whose child finished must return to current work without a fake idle character.
- Hidden tabs and reduced motion must not accumulate walking time or busy loops.

### Task 1: Expanded floor and interior

**Files:** studio-map.ts, studio-seating.ts, agent-motion.ts, new studio-art.ts, app.ts, geometry tests.

**Interfaces:** Shared STUDIO_WIDTH/BASE_HEIGHT/ENTRY, rooms, doors (horizontal/vertical), furniture obstacles. allocateStudioSeats retains unique places; studioGeometry grows a southern annex.

- [x] Write failing reachability and activity-area seating tests; run build and targeted tests to observe failures.
- [x] Implement the six-room floor, spacious interior, vertical doors and enlarged bounds; use the same geometry for rendering and collisions.
- [x] Run build, full npm test and inspect a browser screenshot before committing.
- [x] Commit `feat: expand office with lobby and furnished activity rooms`.

### Task 2: Activity routing and dependency waiting

**Files:** new studio-workflow.ts, new studio-waiting.ts, app.ts, workflow/motion tests.

**Interfaces:** stationForRun(run, visibleRuns): OfficeStation; waitingDependency derives actual live children and active delegation tools. Waiting targets are deterministic and room-local; arrival starts at STUDIO_ENTRY.

- [ ] Write failing tests for room selection, concurrent tools, permissions, completed children and bounded waiting routes.
- [ ] Implement lobby entry, workflow destinations and lounge wandering with pauses, stable seats and immediate retargeting when work resumes.
- [ ] Run build, full npm test and isolated browser lifecycle checks with multiple sessions.
- [ ] Commit `feat: route agents by activity and animate dependency waits`.

### Task 3: Guide and final verification

**Files:** docs/GUIDE.md, docs/assets/studio-preview.png, plan completion checkboxes.

- [ ] Document room meanings and actual waiting signals; refresh public sample preview.
- [ ] Verify desktop/mobile, clock themes, optional relations, reduced motion, 32-agent overflow and completion removal.
- [ ] Commit `docs: explain expanded office and refresh studio preview`.

## Execution notes

Prototype approval and "ok gas eksekusi" authorize execution without another design approval. No plugin payload or server API changes are required; the installed global plugin uses this checkout's rebuilt dashboard.

Task 1 verification: npm run build and npm test passed (121 tests). Isolated browser checks passed for selection, timeline, read endpoints, desktop/mobile fit, touch pinch and connection recovery. Every seat, including a 48-agent overflow crowd, is reachable through collision-safe routes.
