# Installing OfficeCode

For global installation, cross-project use, updates, and uninstall instructions, see the [README](../README.md#install-as-a-global-opencode-plugin).

To let an OpenCode agent install the plugin, open OpenCode in its global configuration directory and paste the [installation prompt](../README.md#install-with-an-opencode-agent) into the Build agent. The prompt installs the global plugin and command from a permanent OfficeCode checkout while preserving existing settings and other plugins.

For terminal installation, run `npm ci` and `npm run install:opencode` once from the checkout, then reopen OpenCode. The dashboard starts when the plugin loads. `/dashboard` only displays the URL and status.

For an existing installation, paste the [update prompt](../README.md#update-with-an-opencode-agent) into the Build agent. It locates the installed checkout, checks its branch and local changes, pulls updates, rebuilds, and reinstalls the global plugin. Restart OpenCode and hard-refresh the dashboard afterward.

## Manual development mode

To develop the UI or API without running a model, use the mock driver from the repository root:

```powershell
# Windows PowerShell
$env:OFFICECODE_DRIVER = "mock"
npm run dev
```

```bash
# macOS / Linux
OFFICECODE_DRIVER=mock npm run dev
```

The manual dashboard is available at `http://127.0.0.1:8787` by default; stop it with `Ctrl+C`. Manual mode does not follow the OpenCode lifecycle. Run `npm test` to check the build and test suite.
