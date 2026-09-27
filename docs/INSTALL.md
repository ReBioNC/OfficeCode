# Install (M1)

Requires Node.js 18+ (22 recommended) and optionally the `opencode` CLI on PATH.

1. `npm install`
2. `npm test` (builds, runs unit + API tests with the mock driver)
3. `OFFICECODE_DRIVER=mock npm run dev`, open http://127.0.0.1:8787
4. Dispatch to `desk-fe-1`, watch the character, find files in `output/outbox/<run-id>/`
5. Real runs: ensure `opencode` is on PATH, then `npm run dev` (without the mock env)

## M1 limitations (scheduled for M2)

- `POST /api/runs` waits for the run to finish before responding — fine for
  mock/short runs; progressive streaming over SSE arrives in M2.
- Restarting the sidecar does not resume runs: ledgers and transcripts are
  preserved on disk, but interrupted runs must be re-dispatched.
- The dashboard has no Outbox panel yet: collect deliverables from
  `output/outbox/<run-id>/` on disk.
