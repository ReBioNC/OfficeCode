---
name: office.staff
description: Hire a character to a desk (assign role + model slot).
---

# /office.staff

Desks are fixed in `.officecode/office.json`. To staff:

1. Pick a free desk: `GET http://127.0.0.1:8787/api/office` (desks not in
   `occupants` are free).
2. Pick the role agent from `plugin/agents/` (e.g. `frontend-dev`).
3. Make sure the role has a model: see `/office.models`.
4. Dispatch with `/office.run`.
