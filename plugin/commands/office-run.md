---
name: office.run
description: Dispatch a task to an office desk via the sidecar.
---

# /office.run

Dispatch: `POST http://127.0.0.1:8787/api/runs` with `{ "deskId": "<desk>", "role": "<role>", "prompt": "<task>" }`.
Watch the character, then collect the deliverable from `output/outbox/<run-id>/`.
