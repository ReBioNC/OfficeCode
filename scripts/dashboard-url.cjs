const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");

const workspace = path.resolve(process.cwd());
const key = crypto.createHash("sha256").update(process.platform === "win32" ? workspace.toLowerCase() : workspace).digest("hex").slice(0, 16);
const stateRoot = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), ".local", "share"), "OfficeCode");

async function main() {
  let connection;
  try { connection = JSON.parse(fs.readFileSync(path.join(stateRoot, "projects", key, "connection.json"), "utf8")); }
  catch { console.log("The dashboard is not active for this project. Open OpenCode in this project folder."); return; }
  if (connection.workspace !== workspace || !/^http:\/\/127\.0\.0\.1:\d+$/.test(connection.url)) {
    console.log("The dashboard connection is invalid for this project.");
    return;
  }
  try {
    const response = await fetch(`${connection.url}/api/health`, { signal: AbortSignal.timeout(2000) });
    const info = await response.json();
    if (info.service !== "officecode" || info.workspace !== workspace || info.mirrorOnly !== true) throw new Error("wrong workspace");
    const [officeRes, runsRes] = await Promise.all([fetch(`${connection.url}/api/office`), fetch(`${connection.url}/api/runs`)]);
    const office = await officeRes.json();
    const runs = await runsRes.json();
    console.log(`🏢 Office dashboard → ${connection.url}`);
    console.log(`Project: ${workspace}`);
    console.log(`Active: ${Object.keys(office.occupants || {}).length} · History: ${(runs.runs || []).length}`);
  } catch {
    console.log(`The dashboard is inactive for this project. Last URL: ${connection.url}`);
    console.log("Reopen OpenCode to start it automatically.");
  }
}

main().catch((err) => { console.error(err.message); process.exitCode = 1; });
