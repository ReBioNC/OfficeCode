const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const configDir = path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config"), "opencode");
const pluginDir = path.join(configDir, "plugins");
const commandDir = path.join(configDir, "commands");
const pluginFile = path.join(pluginDir, "office-dashboard.js");
const commandFile = path.join(commandDir, "dashboard.md");
const source = path.join(root, ".opencode", "plugins", "office-dashboard.js");
const entry = path.join(root, "dist", "src", "sidecar", "index.js");

if (!fs.existsSync(entry) || !fs.existsSync(path.join(root, "dashboard", "public", "app.js"))) {
  throw new Error("Build files are missing. Run npm run build first.");
}

function install(file, contents) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (fs.existsSync(file)) {
    const previous = fs.readFileSync(file, "utf8");
    if (previous === contents) return;
    fs.copyFileSync(file, `${file}.bak`);
  }
  fs.writeFileSync(file, contents, "utf8");
}

install(pluginFile, fs.readFileSync(source, "utf8"));
install(path.join(pluginDir, "office-dashboard.json"), JSON.stringify({ root }, null, 2) + "\n");
const helper = path.join(root, "scripts", "dashboard-url.cjs").replaceAll("\\", "/");
install(commandFile, `---\ndescription: Show the OfficeCode dashboard URL and status for this project\n---\n\nRun the following command from the current OpenCode project folder, then report the result briefly in English without changing state:\n\n\`node "${helper}"\`\n\nThe dashboard only displays OpenCode session activity. OpenCode still selects and runs every model.\n`);
console.log(`Global OpenCode plugin: ${pluginFile}`);
console.log(`/dashboard command: ${commandFile}`);
console.log("Reopen OpenCode in any project to activate the dashboard.");
