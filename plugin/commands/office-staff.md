---
name: office.staff
description: Hire a character to a desk (assign role + model slot).
---

# /office.staff

M1: desks are fixed in `.officecode/office.json`. Pick a free desk from `GET /api/office`, choose the role agent (e.g. `frontend-dev`), then dispatch with `/office.run`.
Per-role model picker arrives in M2; M1 runs use `OFFICECODE_DRIVER` (mock or opencode CLI).
