const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const legacyHome = path.join(os.homedir(), ".hermes");
const desktopHome = process.platform === "win32" && process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, "hermes") : legacyHome;
const defaultHome = fs.existsSync(desktopHome) || !fs.existsSync(legacyHome) ? desktopHome : legacyHome;
const home = path.resolve(process.env.HERMES_HOME || defaultHome);
const destination = path.join(home, "plugins", "officecode");
const enable = !process.argv.includes("--no-enable");
const hermes = process.env.OFFICECODE_HERMES_CLI || "hermes";
const metadataFile = path.join(destination, "office-dashboard.json");
let previous = {};
try { previous = JSON.parse(fs.readFileSync(metadataFile, "utf8")); } catch { /* first install */ }
const studioFlag = process.argv.indexOf("--studio-workspace");
const studioWorkspace = studioFlag >= 0 ? process.argv[studioFlag + 1] : previous.studioWorkspace;
if (studioFlag >= 0 && (!studioWorkspace || !path.isAbsolute(studioWorkspace) || !fs.existsSync(studioWorkspace) || !fs.statSync(studioWorkspace).isDirectory())) {
  throw new Error("--studio-workspace requires an existing absolute directory.");
}

for (const file of ["dist/src/sidecar/index.js", "dashboard/public/app.js", "scripts/hermes-bridge.cjs"]) {
  if (!fs.existsSync(path.join(root, file))) throw new Error("Build files are missing. Run npm run build first.");
}
if (enable) {
  const check = spawnSync(hermes, ["--version"], { windowsHide: true, encoding: "utf8", timeout: 30_000 });
  if (check.error || check.status !== 0) throw new Error("Hermes CLI is unavailable. Install Hermes Desktop, add hermes to PATH, or set OFFICECODE_HERMES_CLI to its executable.");
}

function install(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (fs.existsSync(file)) {
    if (fs.readFileSync(file, "utf8") === content) return;
    fs.copyFileSync(file, `${file}.bak`);
  }
  fs.writeFileSync(file, content, "utf8");
}
for (const file of ["__init__.py", "delegation.py", "plugin.yaml"]) {
  install(path.join(destination, file), fs.readFileSync(path.join(root, "integrations/hermes", file), "utf8"));
}
install(metadataFile, JSON.stringify({ root, node: process.execPath, ...(studioWorkspace ? { studioWorkspace: path.resolve(studioWorkspace) } : {}) }, null, 2) + "\n");
if (enable) {
  const bundledPython = path.join(defaultHome, "hermes-agent", "venv", process.platform === "win32" ? "Scripts/python.exe" : "bin/python");
  const python = process.env.OFFICECODE_HERMES_PYTHON || (fs.existsSync(bundledPython) ? bundledPython : process.platform === "win32" ? "python" : "python3");
  const configured = spawnSync(python, ["-B", path.join(root, "scripts/configure-hermes-mcp.py"), home,
    JSON.stringify({ command: process.execPath, args: [path.join(root, "scripts/hermes-mcp.cjs")], env: { HERMES_HOME: home }, timeout: 15, officecodeManaged: true })],
    { env: { ...process.env, HERMES_HOME: home }, windowsHide: true, stdio: "inherit", timeout: 30_000 });
  if (configured.error || configured.status !== 0) throw new Error("MCP configuration failed. Use Hermes's Python environment (with PyYAML), check OFFICECODE_HERMES_PYTHON, and preserve any conflicting MCP entry.");
  // Let Hermes preserve its own profile/config format and enabled-plugin list.
  const result = spawnSync(hermes, ["plugins", "enable", "officecode"], {
    env: { ...process.env, HERMES_HOME: home }, stdio: "inherit", windowsHide: true, timeout: 60_000,
  });
  if (result.error || result.status !== 0) throw new Error("Plugin files installed, but enabling failed. Run hermes plugins enable officecode and inspect the error.");
}
console.log(`Hermes plugin: ${destination}`);
console.log(enable ? "Plugin enabled in this Hermes profile." : "Files installed. Enable with: hermes plugins enable officecode");
console.log("Keep this OfficeCode folder. Quit and reopen Hermes CLI/Desktop; the studio starts automatically. Run /office-dashboard to see its URL.");
