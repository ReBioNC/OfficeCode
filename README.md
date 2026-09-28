# OfficeCode

OfficeCode shows [OpenCode](https://opencode.ai/) session activity as a pixel-art office in your browser. Its global plugin mirrors sessions, tool activity, and permission requests to a local dashboard. **OpenCode still selects and runs every model**; the dashboard does not run models on its own.

## Requirements

- The OpenCode CLI must be installed and the `opencode` command must be available in your terminal. This integration has been tested with OpenCode 1.18.33.
- Node.js 18 or newer and npm. Node.js 22 or newer is recommended.
- Git to clone and update this repository.

The installation steps below have been tested on Windows. The scripts use cross-platform Node.js paths, but macOS and Linux have not been tested directly.

## Install as a global OpenCode plugin

Run these commands in PowerShell or another terminal:

```bash
git clone https://github.com/ReBioNC/OfficeCode.git
cd OfficeCode
npm ci
npm run install:opencode
```

`install:opencode` builds the dashboard and installs the plugin and `/dashboard` command in OpenCode's global configuration directory (`~/.config/opencode/`). If a destination file already exists, the installer saves a `.bak` copy. **Keep the OfficeCode checkout in place after installation**: the global plugin uses build files from that directory.

Close and reopen OpenCode after installing. You do not need to run `npm run dev` or set `OFFICECODE_DRIVER` when using the global plugin.

## Use it in any project

Open a terminal in the project you want to monitor, then start OpenCode:

```bash
cd /path/to/your/project
opencode
```

When OpenCode loads the project, the plugin starts the dashboard server automatically. An OpenCode toast shows its local URL. Run `/dashboard` in OpenCode to see the URL and status again, then open the URL in your browser. The port can differ between projects; use the URL from the toast or `/dashboard` rather than assuming port `8787`.

`/dashboard` only displays information. The global dashboard is a visual view: `POST /api/runs` is disabled in plugin mode, so tasks and models run through OpenCode.

### What the dashboard shows

All active OpenCode sessions share one pixel-art studio. Its original night palette, sunset skyline, colorful work rugs, idea corner, planning atelier, digital library, workstations, and coffee area are drawn in code. Desks have distinct monitors and keyboards. Each visible agent moves to the relevant station as OpenCode reports work: planning, reading files, editing code, searching the web or codebase, running terminal commands, coordinating tools, and waiting for permission. Agents have stable, varied skin and hair colors while their shirt color follows their displayed work role. The sidebar shows each agent's work role, task title, and latest action. When no session is active, the most recently completed session remains visible.

These states come from OpenCode session, message, tool, and permission events. The dashboard labels a single visible agent **Fullstack**. With multiple agents, it uses explicit OpenCode agent roles where available and otherwise infers a work role from the task text (for example Frontend, Backend, Auditor, or QA). The original OpenCode agent name remains in the agent card. These labels describe the visualization and do not assign a new OpenCode agent. The plugin does not make extra model requests for animation or role labels.

The dashboard stops when OpenCode closes. If OpenCode exits unexpectedly, its lease expires and the dashboard normally stops about 7–8 seconds after the last heartbeat. If another OpenCode window is still using the same project, the dashboard stays online until the last window closes.

## File locations

| System | Global plugin and command | Per-project dashboard data |
|---|---|---|
| Windows | `%USERPROFILE%\.config\opencode\plugins\office-dashboard.js` and `commands\dashboard.md` | `%LOCALAPPDATA%\OfficeCode\projects\` |
| macOS / Linux | `~/.config/opencode/plugins/office-dashboard.js` and `commands/dashboard.md` | `~/.local/share/OfficeCode/projects/` |

If `XDG_CONFIG_HOME` is set, the installer uses `$XDG_CONFIG_HOME/opencode/`. Dashboard data may include session titles, tool names, and OpenCode activity history. The server listens only on `127.0.0.1`; the dashboard does not store API keys or contact model providers. See [docs/PRIVACY.md](docs/PRIVACY.md) for details.

## Update

To get the latest OfficeCode changes and reinstall the global plugin:

```bash
cd /path/to/OfficeCode
git pull
npm ci
npm run install:opencode
```

Updating the OpenCode application does not normally require reinstalling OfficeCode. A future OpenCode release may change its plugin API and require an OfficeCode update. After updating OpenCode, reopen it and check `/dashboard`.

## Disable or uninstall

Close OpenCode first. To temporarily disable the global plugin, rename `office-dashboard.js` in the global plugin directory to `office-dashboard.js.disabled`, then reopen OpenCode. To uninstall it completely, remove that plugin file, `office-dashboard.json` in the same directory, and `commands/dashboard.md`. If the installer created `.bak` files from a previous installation, restore them if you still need them.

This repository also contains a project-level plugin at `.opencode/plugins/office-dashboard.js`. When opening the OfficeCode repository itself, disable that file too if you want to use OpenCode without the dashboard.

## Local development

This mode is separate from the global plugin. To run the server manually without calling a model:

```powershell
# Windows PowerShell
$env:OFFICECODE_DRIVER = "mock"
npm run dev
```

```bash
# macOS / Linux
OFFICECODE_DRIVER=mock npm run dev
```

Open `http://127.0.0.1:8787` and press `Ctrl+C` to stop the manual server. A server started with `npm run dev` **does not** follow the OpenCode lifecycle. Run `npm test` to build the project and execute its test suite.

## Troubleshooting

| Symptom | What to do |
|---|---|
| `/dashboard` is not recognized | Run `npm run install:opencode`, then reopen OpenCode. |
| The toast does not show a URL | Check that Node.js is on `PATH`, the OfficeCode checkout has not moved, and `npm run build` succeeds. |
| An old URL no longer opens | Start OpenCode from the same project directory; the dashboard starts when the plugin loads. |
| The port is not `8787` | This is normal. The plugin selects another port when needed; use the URL from the toast or `/dashboard`. |
| The server stays online after OpenCode closes | Check `GET /api/health`. An older sidecar created before lease support (without `leaseManaged`) must be stopped manually once. |

## Project layout

| Directory | Purpose |
|---|---|
| `src/sidecar/` | Local HTTP server, office state, and mirror API |
| `src/dashboard/` | Pixel-art Canvas UI |
| `.opencode/plugins/` | OpenCode plugin source |
| `.opencode/commands/` | Project-level `/dashboard` command |
| `scripts/` | Build scripts, global installer, and URL helper |
| `test/` | Node.js tests |
