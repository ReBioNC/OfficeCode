---
name: office.run
description: Dispatch a task to an office desk via the sidecar.
---

# /office.run

Dispatch: `POST http://127.0.0.1:8787/api/runs` with `{ "deskId": "<desk>", "role": "<role>", "prompt": "<task>" }`.

```bash
curl -X POST http://127.0.0.1:8787/api/runs \
  -H "content-type: application/json" \
  -d '{"deskId":"desk-fe-1","role":"frontend-dev","prompt":"Build the landing hero"}'
```

Responses: `201` running, `202` queued with position, `404` unknown desk,
`409` desk busy (pick another desk or wait), `402` over budget.
Watch the character on the dashboard, then collect the deliverable from
`output/outbox/<run-id>/`.
