---
name: office.models
description: View and assign per-role models (provider, model, fallbacks, weight).
---

# /office.models

View slots: `GET http://127.0.0.1:8787/api/models`

```bash
curl http://127.0.0.1:8787/api/models
```

Assign a model to a role (blank model = unassigned):

```bash
curl -X PUT http://127.0.0.1:8787/api/models \
  -H "content-type: application/json" \
  -d '{"slots":{"qa-engineer":{"provider":"anthropic","model":"haiku","fallbacks":["sonnet"],"weight":0.5}}}'
```

Note: PUT replaces the whole `slots` object — first GET the current doc,
patch one role, then PUT it back. See what your `opencode.json` declares:
`GET http://127.0.0.1:8787/api/models/opencode`.
