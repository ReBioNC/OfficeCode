# OfficeCode

A plugin for [OpenCode](https://opencode.ai/) and [Hermes Agent Desktop](https://hermes-agent.nousresearch.com/) that visualizes agents and tool activity in a spacious pixel-art office. Six connected rooms follow their work, with a lobby, library, and lounge for delegation waits. Themes follow your local clock. Your agent app runs every model; the dashboard makes no additional model calls.

Click an agent or computer to inspect its work, concurrent tools, delegation links, and workflow timeline. Select a room to highlight its current occupants. Activity poses/screens show reading, editing, browsing and running tests; completed subagents send a brief result animation to their active parent. Drag the activity divider or use **Hide activity** for a wider desktop studio that fits the screen height; your layout is saved in the browser. Use **Fit studio**, **Focus agent**, drag, or pinch to navigate. Avatar models remain stable per session. **Project dashboard** switches between active OpenCode projects. **Follow agent** tracks movement; **Focus feature** spotlights its delegated team. **Photo mode** exports a clean studio PNG with a temporary theme. Use **Visual settings** for automatic/manual themes, animation level, agent label size, and bubbles. **Attention** opens permission/error/connection details; **Completed tasks** keeps observed workflow summaries after characters leave.

![OfficeCode expanded studio with six agents across activity rooms](docs/assets/studio-preview.png)

Preview uses sample session events in an isolated workspace.

## Install

Requires Node.js 18+, npm, Git, and your agent app. OpenCode integration tested on Windows with OpenCode 1.18.33 and 2.0.28.

### OpenCode

```bash
git clone https://github.com/ReBioNC/OfficeCode.git
cd OfficeCode
npm ci
npm run install:opencode
```

The installer builds the dashboard and installs the global plugin and `/dashboard` command. **Keep the OfficeCode folder in place.**

### Install with an OpenCode agent

Open a terminal in `~/.config/opencode/` (Windows: `%USERPROFILE%\.config\opencode\`), run `opencode`, select **Build**, and paste this prompt. If `XDG_CONFIG_HOME` is set, use its `opencode/` folder instead.

```text
Install https://github.com/ReBioNC/OfficeCode.git as a global OpenCode plugin.
Check git, node, npm, and opencode. Clone into a permanent OfficeCode folder
in my home directory, or reuse a verified existing checkout. Read its README
and installer, then run npm ci and npm run install:opencode from the checkout.
Preserve my OpenCode settings, models, other plugins, and local changes.
Verify the installed plugin, checkout root, /dashboard command, and build
files. Report failures clearly, then explain how to restart and open it.
```

### Hermes Agent Desktop

From the same permanent OfficeCode checkout, with the `hermes` CLI in PATH:

```bash
npm ci
npm run install:hermes
```

The installer enables the native plugin and adds an OfficeCode MCP startup entry to your `HERMES_HOME` profile (Windows Desktop default: `%LOCALAPPDATA%\hermes`; macOS/Linux: `~/.hermes`). It preserves model settings and other plugins/MCP servers. **Quit and reopen Hermes CLI/Desktop**, then run **`/office-dashboard`** and open its URL. The dashboard starts when Hermes connects its MCP servers, before your first task. Keep the checkout in place.

**Or paste this into Hermes:**

```text
Install https://github.com/ReBioNC/OfficeCode.git for my active Hermes profile.
Check Git, Node.js, npm, Hermes and Hermes's Python environment with PyYAML.
Clone into a permanent OfficeCode folder or reuse a verified checkout.
Read its README and installer; run npm ci and npm run install:hermes.
Preserve my models, credentials, other plugins and MCP servers. Verify the
native plugin, enabled status, OfficeCode MCP entry with explicit HERMES_HOME,
checkout registration and build files. Stop on errors. Explain how to quit
and reopen Hermes CLI/Desktop, then use /office-dashboard to see its URL.
```

### Separate or shared studios

Both apps work independently. By default, OpenCode groups sessions by project and Hermes groups them by profile. To share a studio, install Hermes with an **existing absolute project path**, then open OpenCode in that same project:

```bash
npm run install:hermes -- --studio-workspace "C:/path/to/project"
```

Restart both apps. Each connection owns its characters; closing one keeps the other's studio running. The server stops after its last connection closes. Minimizing Desktop or closing the browser is not quitting the agent app.

Hermes also gains **`officecode_delegate_opencode`** when OpenCode is installed. Example request: *“Use officecode_delegate_opencode to implement the login form in C:/path/to/project using the build agent with the frontend-dev display role, then summarize its result.”* This runs a real OpenCode session with OpenCode's own model and permissions, returns its result to Hermes, and links the characters. Up to four delegated jobs run concurrently. Click a character for its runtime, original agent, task, activity, workspace and parent. Visualization makes no model calls; delegated work consumes OpenCode tokens and tool definitions add some Hermes context.

## Update

From your existing OfficeCode folder, with a clean working tree:

```bash
git pull --ff-only
npm ci
npm run install:opencode
```

For Hermes, use `npm run install:hermes` instead of `npm run install:opencode`, then quit/reopen Desktop. Keep the checkout in place; hard-refresh the dashboard with `Ctrl+F5`.

**Or paste this into Hermes:**

```text
Update my existing OfficeCode plugin. Find its checkout from
<active HERMES_HOME>/plugins/officecode/office-dashboard.json. Verify the
remote, branch, upstream and working tree; ask before resolving local changes
or divergence. Keep the checkout and shared studio choice. Run git pull
--ff-only, read the updated README, then npm ci and npm run install:hermes.
Preserve my models, other plugins, MCP servers and dashboard data. Stop on
errors. Verify the native plugin, OfficeCode MCP profile/env entry and build;
report the commit and explain how to restart Hermes and refresh the browser.
```

Stop if any command fails; resolve local changes or branch divergence before continuing.

### Update with an OpenCode agent

Start OpenCode from the same global configuration folder, select **Build**, and paste:

```text
Update my existing global OfficeCode plugin. Find its checkout from
plugins/office-dashboard.json in OpenCode's global config, checking any
OFFICECODE_ROOT override. Verify the repository, branch, upstream, and
working tree. Ask before resolving local changes or branch divergence.
Keep the checkout path and branch, run git pull --ff-only, read the updated
README and installer, then run npm ci and npm run install:opencode.
Preserve OpenCode settings, models, other plugins, and dashboard data.
Stop on errors. Verify the installed plugin, root, command, and build files;
report the resulting commit and explain how to restart and refresh.
```

For OpenCode, after installing or updating, **close all OpenCode instances**, reopen OpenCode in any project, run `/dashboard`, and open its URL. Hard-refresh an existing browser tab with `Ctrl+F5`.

The server starts automatically with OpenCode and stops after its last owner closes. `/dashboard` only shows the URL and status; `npm run dev` is unnecessary.

For troubleshooting, uninstall, API, and development details, see the [full guide](docs/GUIDE.md).

### API additions

| Endpoint | Dashboard metadata |
| --- | --- |
| `GET /api/projects` | Current dashboard plus verified active agent dashboards from local plugin registrations; optional `?verify=<local URL>` rechecks a listed destination before navigation. It never starts a server. |
| `GET /api/health` | `activeLeases` counts connected agent runtimes; `lastEventAt` is the last run update time. |
| `POST /api/mirror/session` | Optional `parentSessionId` links a subagent to its parent. Optional `runtime` (`opencode` or `hermes`), `workspace` (up to 4,096 characters), and original `agent` (up to 48 characters) record explicit provenance. Role labels are limited to 48 characters. Registration updates preserve unspecified metadata. Workspace is host-reported metadata, not a filesystem check. |
| `POST /api/lease`, `DELETE /api/lease` | Connectors renew/release their own lease. POST returns `created` to distinguish a fresh/recreated lease from a renewal. Optional `ownerLeaseId` on mirror registration binds its character to an active lease (32 lowercase hexadecimal characters); release/expiry marks that owner's active runs blocked and frees their seats, while other owners stay connected. |
| `GET /api/runs` | Mirrored runs carry optional `runtime`, `workspace`, and `agent`, plus `startedAt`, `finishedAt`, and the latest 100 timestamped `timeline` steps. Missing provenance remains unknown. History remains available until the server stops. |
| `POST /api/mirror/event` | Optional `activeTools` lists concurrent calls; `toolResult` records a completed/failed call with duration. |
