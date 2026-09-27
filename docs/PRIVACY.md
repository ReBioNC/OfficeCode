# Privacy (M1)

Local-first. Station state, transcripts, and ledgers stay in `<workspace>/.officecode/`.
Deliverables stay in `<workspace>/output/outbox/`. Provider traffic leaves the machine
only when a run executes (mock driver: never). Keys are never stored in the dashboard;
the browser bundle makes no provider calls. Sharing is explicit (you copy files).
