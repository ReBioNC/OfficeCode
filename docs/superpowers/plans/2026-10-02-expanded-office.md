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

- [x] Write failing tests for room selection, concurrent tools, permissions, completed children and bounded waiting routes.
- [x] Implement lobby entry, workflow destinations and lounge wandering with pauses, stable seats and immediate retargeting when work resumes.
- [x] Run build, full npm test and isolated browser lifecycle checks with multiple sessions.
- [x] Commit `feat: route agents by activity and animate dependency waits`.

### Task 3: Guide and final verification

**Files:** README.md, docs/GUIDE.md, docs/assets/studio-preview.png, plan completion checkboxes.

- [x] Document room meanings and actual waiting signals; refresh public sample preview.
- [x] Verify desktop/mobile, clock themes, optional relations, reduced motion, 48-agent overflow and completion removal.
- [x] Commit `docs: explain expanded office and refresh studio preview`.

## Execution notes

Prototype approval and "ok gas eksekusi" authorize execution without another design approval. No plugin payload or server API changes are required; the installed global plugin uses this checkout's rebuilt dashboard.

Task 1 verification: npm run build and npm test passed (121 tests). Isolated browser checks passed for selection, timeline, read endpoints, desktop/mobile fit, touch pinch and connection recovery. Every seat, including a 48-agent overflow crowd, is reachable through collision-safe routes.

Task 2 verification: npm run build and npm test passed (126 tests). Browser RED observed Coordinating instead of Waiting for Backend; GREEN verified API-to-browser waiting, permissions including concurrent local reads, child completion and character removal. A controlled-clock browser verified actual lobby entry, lounge wandering with pauses, collision-safe feet and interruption when editing resumes.
Ruling: no server or plugin changes; existing activeTools and parentSessionId provide the real dependency signal. Single generic agents keep Fullstack as their display role while audit task hints can select the focus room.

Review fixes: independent review found overlapping waiting pause destinations and hidden-tab SSE redraws. Distinct per-seat circuits and a hidden draw guard address both; resume preserves remaining waiting pauses. Regression tests observed failures before the fixes and passed afterward. Artwork adjustments keep planning boards and desk labels clear of seated agents. Focused re-review approved the fixes.

Final verification: build and full npm test passed (127 tests). Isolated browser checks passed for real dependency signals, permission priority, child completion, lobby entry, collision-safe wandering and editing interruption. Desktop and mobile previews passed, including touch pinch, four distinct clock palettes, default-hidden relations after reload, 48-agent overflow fit and complete character removal. The README preview uses six sample mirror sessions without model calls. Installed global plugin source matches this checkout and its configured root; runtime and dashboard builds exist.
