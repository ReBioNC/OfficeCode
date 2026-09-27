---
name: office.budget
description: View spend (est.) and raise the daily cap.
---

# /office.budget

Status: `GET http://127.0.0.1:8787/api/budgets` (spend is always estimated).

```bash
curl http://127.0.0.1:8787/api/budgets
```

Raise the cap:

```bash
curl -X PUT http://127.0.0.1:8787/api/budgets \
  -H "content-type: application/json" \
  -d '{"dailyUsdCap":50,"rates":{}}'
```

Note: PUT replaces the whole doc — GET first, keep `rates`, change the cap.
Over cap, dispatches are refused with `402`.
