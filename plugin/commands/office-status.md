---
name: office.status
description: One-glance office status: rooms, occupants, queue, spend.
---

# /office.status

```bash
curl http://127.0.0.1:8787/api/office
curl http://127.0.0.1:8787/api/runs
curl http://127.0.0.1:8787/api/queue
curl http://127.0.0.1:8787/api/budgets
```

`occupants` maps desk → run id. A desk in `occupants` is busy (dispatch
elsewhere or wait). `runs` carry live `state`; `queue` is the waiting line;
`budgets` shows estimated spend vs cap.
