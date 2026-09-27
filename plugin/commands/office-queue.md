---
name: office.queue
description: See the waiting line and concurrency cap.
---

# /office.queue

Waiting line: `GET http://127.0.0.1:8787/api/queue`

```bash
curl http://127.0.0.1:8787/api/queue
```

Runs beyond the global cap (`OFFICECODE_MAX_CONCURRENT`, default 8) wait
with a `202` position and start automatically as desks free up. Raise the
cap by restarting the sidecar: `OFFICECODE_MAX_CONCURRENT=12 npm run dev`.
