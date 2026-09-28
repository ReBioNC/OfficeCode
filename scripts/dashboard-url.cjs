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
  catch { console.log("Dashboard belum aktif untuk proyek ini. Buka OpenCode di folder proyek ini."); return; }
  if (connection.workspace !== workspace || !/^http:\/\/127\.0\.0\.1:\d+$/.test(connection.url)) {
    console.log("Koneksi dashboard tidak valid untuk proyek ini.");
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
    console.log(`Proyek: ${workspace}`);
    console.log(`Aktif: ${Object.keys(office.occupants || {}).length} · Riwayat: ${(runs.runs || []).length}`);
  } catch {
    console.log(`Dashboard proyek ini sedang tidak aktif. URL terakhir: ${connection.url}`);
    console.log("Buka kembali OpenCode untuk menyalakannya otomatis.");
  }
}

main().catch((err) => { console.error(err.message); process.exitCode = 1; });
