// Hermes starts this stdio connector while discovering MCP servers, before a task.
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const readline = require("node:readline");
const root = path.resolve(__dirname, "..");
const home = path.resolve(process.env.HERMES_HOME || path.join(os.homedir(), ".hermes"));
let config = {};
try { config = JSON.parse(fs.readFileSync(path.join(home, "plugins/officecode/office-dashboard.json"), "utf8")); } catch { /* uninstalled preview */ }
const workspace = path.resolve(process.env.OFFICECODE_STUDIO_WORKSPACE || config.studioWorkspace || home);
const key = crypto.createHash("sha256").update(process.platform === "win32" ? workspace.toLowerCase() : workspace).digest("hex").slice(0, 16);
const registration = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), ".local/share"), "OfficeCode/projects", key, "connection.json");
let bridge, stopping = false, booting;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function status() {
  try {
    const record = JSON.parse(fs.readFileSync(registration, "utf8"));
    if (!/^http:\/\/127\.0\.0\.1:[1-9]\d{0,4}$/.test(record.url) || Number(record.url.split(":").pop()) > 65535) throw new Error("invalid URL");
    const response = await fetch(record.url + "/api/health", { redirect: "error", signal: AbortSignal.timeout(800) });
    const info = await response.json();
    if (response.ok && info.ok && info.service === "officecode" && info.workspace === workspace && info.mirrorOnly && info.leaseManaged && info.activeLeases > 0) {
      return { status: "online", url: record.url, studioWorkspace: workspace, activeConnections: info.activeLeases };
    }
  } catch { /* optional dashboard */ }
  return { status: "offline", studioWorkspace: workspace, message: "Dashboard unavailable. Check the OfficeCode build and reopen your agent app." };
}

function start() {
  if (booting) return booting;
  booting = (async () => {
    if (!bridge || bridge.exitCode !== null) {
      bridge = spawn(process.execPath, [path.join(root, "scripts/hermes-bridge.cjs")], {
        env: { ...process.env, OFFICECODE_HERMES_HOME: home, OFFICECODE_STUDIO_WORKSPACE: workspace,
          OFFICECODE_HERMES_PARENT_PID: String(process.pid) },
        stdio: ["pipe", "ignore", "ignore"], windowsHide: true,
      });
      bridge.on("error", () => {});
      bridge.stdin.on("error", () => {});
      bridge.stdin.write(JSON.stringify({ kind: "start" }) + "\n");
    }
    const deadline = Date.now() + 8000;
    while (!stopping && Date.now() < deadline) {
      const info = await status();
      if (info.status === "online") return info;
      await pause(100);
    }
    return status();
  })().finally(() => { booting = null; });
  return booting;
}

const tool = { name: "officecode_status", description: "Read the local OfficeCode studio URL and connection status. Does not run an agent or model.",
  inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true, destructiveHint: false } };
const send = (id, result, error) => {
  if (!stopping && id !== undefined) process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, ...(error ? { error } : { result }) }) + "\n");
};
async function handle(message) {
  if (message.method === "initialize") {
    await start();
    send(message.id, { protocolVersion: ["2024-11-05", "2025-03-26", "2025-06-18"].includes(message.params?.protocolVersion) ? message.params.protocolVersion : "2024-11-05",
      capabilities: { tools: {} }, serverInfo: { name: "officecode", version: "0.2.0" } });
  } else if (message.method === "tools/list") send(message.id, { tools: [tool] });
  else if (message.method === "ping") send(message.id, {});
  else if (message.method === "tools/call") {
    if (message.params?.name !== tool.name) { send(message.id, undefined, { code: -32602, message: "Unknown OfficeCode tool" }); return; }
    send(message.id, { content: [{ type: "text", text: JSON.stringify(await status()) }] });
  } else if (!String(message.method || "").startsWith("notifications/")) send(message.id, undefined, { code: -32601, message: "Method not found" });
}
const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
input.on("line", (line) => {
  if (line.length > 1_048_576) { void stop(); return; }
  try { const message = JSON.parse(line); void handle(message).catch(() => send(message.id, undefined, { code: -32603, message: "OfficeCode connector unavailable" })); }
  catch { send(null, undefined, { code: -32700, message: "Invalid JSON" }); }
});
async function stop() {
  if (stopping) return;
  stopping = true; input.close(); process.stdin.destroy();
  if (bridge?.stdin && !bridge.stdin.destroyed) bridge.stdin.end();
}
input.on("close", () => void stop());
process.on("SIGINT", () => void stop());
process.on("SIGTERM", () => void stop());
