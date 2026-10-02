# Privacy and local storage

OfficeCode listens only on `127.0.0.1`. The global plugin mirrors OpenCode session metadata, including titles, agent roles, parent session IDs, tool names and call IDs, activity targets, completion status, and permission waits, to the local dashboard. Project data and activity logs are stored under `%LOCALAPPDATA%\OfficeCode\projects\` on Windows or `~/.local/share/OfficeCode/projects/` on macOS/Linux. Session titles and tool metadata may contain sensitive information; review them before sharing.

Detailed workflow timelines and concurrent tool lists are held in server memory. Each run's timeline keeps its latest 100 entries; it is not restored after the server stops. Existing event ledgers and transcripts remain on disk. The dashboard does not copy model reasoning or tool output into its new timeline.

The browser does not store API keys or call model providers. In global plugin mode, OpenCode selects and runs every model; standalone dispatch is disabled. Avatar rendering, navigation, role labels, connection checks, and themes make no model calls. Other local processes can access the HTTP server while it is running; do not expose its port to a public network.

Manual development mode (`npm run dev`) is separate. It stores state in `<workspace>/.officecode/` and run results in `<workspace>/output/outbox/`. The mock driver makes no model calls. Without the mock driver, the development run API can invoke the OpenCode CLI with the user's OpenCode provider configuration.
