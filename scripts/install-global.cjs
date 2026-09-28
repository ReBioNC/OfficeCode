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
  throw new Error("Build belum ada. Jalankan npm run build lebih dahulu.");
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
install(commandFile, `---\ndescription: Tampilkan URL dan status dashboard OfficeCode untuk proyek ini\n---\n\nJalankan perintah berikut dari folder proyek OpenCode saat ini, lalu tampilkan hasilnya singkat tanpa mengubah state:\n\n\`node "${helper}"\`\n\nDashboard hanya menampilkan aktivitas sesi OpenCode. Semua model tetap dipilih dan dijalankan oleh OpenCode.\n`);
console.log(`Plugin OpenCode global: ${pluginFile}`);
console.log(`Perintah /dashboard: ${commandFile}`);
console.log("Buka ulang OpenCode di proyek mana pun untuk mengaktifkan dashboard.");
