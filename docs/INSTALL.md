# Install (M1)

Requires Node.js 18+ (22 recommended) and optionally the `opencode` CLI on PATH.

1. `npm install`
2. `npm test` (builds, runs unit + API tests with the mock driver)
3. `OFFICECODE_DRIVER=mock npm run dev`, open http://127.0.0.1:8787
4. Dispatch to `desk-fe-1`, watch the character, find files in `output/outbox/<run-id>/`
5. Real runs: ensure `opencode` is on PATH, then `npm run dev` (without the mock env)
