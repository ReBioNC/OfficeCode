# Install (M2)

Requires Node.js 18+ (22 recommended) and optionally the `opencode` CLI on PATH.

1. `npm install`
2. `npm test` (builds, runs unit + API tests with the mock driver)
3. `OFFICECODE_DRIVER=mock npm run dev`, open http://127.0.0.1:8787
4. Dispatch to `desk-fe-1`, watch the character, find files in `output/outbox/<run-id>/`
5. Real runs: ensure `opencode` is on PATH, then `npm run dev` (without the mock env)

## M2: crew, models, queue, budgets

- **Crew:** 10 roles in `plugin/agents/` (pm, uiux-designer, frontend-dev,
  backend-dev, api-dev, database-dev, devops, qa-engineer, reviewer,
  docs-writer). New checkouts get the expanded sample office (Frontend, QA,
  Design, Backend, Data rooms). Existing `.officecode/office.json` files are
  never overwritten — delete yours to reseed.
- **Models panel:** per-role provider/model/fallbacks/weight, stored in
  `.officecode/models.json` via `PUT /api/models`. Blank model = unassigned.
  `GET /api/models/opencode` shows what your `opencode.json` declares (if any).
- **Queue:** global concurrency cap (`OFFICECODE_MAX_CONCURRENT`, default 8).
  Over cap → `202` with a queue position; the waiting line shows in the
  dashboard and drains automatically as runs settle.
- **Budget panel:** daily USD cap + per-model rates (user-editable) in
  `.officecode/budgets.json`. Spend is **estimated** (transcript chars/4 as
  tokens, 70/30 in/out split) and always labeled `est.` — real provider
  usage arrives in M3. Over cap → `402` with a friendly message.

## M2 limitations (scheduled for M3)

- `POST /api/runs` waits for the run to finish before responding — fine for
  mock/short runs; progressive streaming over SSE arrives in M3.
- Model fallback chains are stored but not yet auto-switched on rate limits.
- Restarting the sidecar does not resume runs: ledgers and transcripts are
  preserved on disk, but interrupted runs must be re-dispatched.
- The dashboard has no Outbox panel yet: collect deliverables from
  `output/outbox/<run-id>/` on disk.
