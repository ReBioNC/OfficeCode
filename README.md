# OfficeCode

A global [OpenCode](https://opencode.ai/) plugin that visualizes agents and tool activity in a live pixel-art office. Themes follow your local clock. OpenCode runs every model; the dashboard makes no additional model calls.

Click an agent to inspect its work, concurrent tools, delegation links, and workflow timeline. Use **Fit studio**, **Focus agent**, drag, or pinch to navigate. Avatar models remain stable per session.

![OfficeCode studio with Frontend, Backend, and QA agents](docs/assets/studio-preview.png)

## Install

Requires OpenCode CLI, Node.js 18+, npm, and Git. Tested on Windows with OpenCode 1.18.33.

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

## Update

From your existing OfficeCode folder, with a clean working tree:

```bash
git pull --ff-only
npm ci
npm run install:opencode
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

After installing or updating, **close all OpenCode instances**, reopen OpenCode in any project, run `/dashboard`, and open its URL. Hard-refresh an existing browser tab with `Ctrl+F5`.

The server starts automatically with OpenCode and stops after the last OpenCode instance using that project closes. `/dashboard` only shows the URL and status; `npm run dev` is unnecessary.

For troubleshooting, uninstall, API, and development details, see the [full guide](docs/GUIDE.md).

### API additions

| Endpoint | Dashboard metadata |
| --- | --- |
| `GET /api/health` | `activeLeases` counts connected OpenCode instances; `lastEventAt` is the last run update time. |
| `POST /api/mirror/session` | Optional `parentSessionId` links an OpenCode subagent to its parent. |
| `GET /api/runs` | Mirrored runs include `startedAt`, `finishedAt`, and the latest 100 timestamped `timeline` steps. History remains available until the server stops. |
| `POST /api/mirror/event` | Optional `activeTools` lists concurrent calls; `toolResult` records a completed/failed call with duration. |
