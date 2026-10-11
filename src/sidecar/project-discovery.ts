import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { localDashboardUrl, type ProjectDashboard } from "../shared/project-dashboard.js";

export function defaultProjectsRoot(): string {
  return path.join(process.env["LOCALAPPDATA"] || path.join(os.homedir(), ".local", "share"), "OfficeCode", "projects");
}
const workspaceKey = (workspace: string) => process.platform === "win32" ? path.resolve(workspace).toLowerCase() : path.resolve(workspace);

async function healthMatches(url: string, workspace: string, timeoutMs: number): Promise<boolean> {
  try {
    const response = await fetch(`${url}/api/health`, { redirect: "error", signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok || !response.body) return false;
    const reader = response.body.getReader();
    let length = 0; const chunks: Uint8Array[] = [];
    for (;;) {
      const chunk = await reader.read(); if (chunk.done) break;
      length += chunk.value.length;
      if (length > 16_384) { await reader.cancel(); return false; }
      chunks.push(chunk.value);
    }
    const info = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    return info?.ok === true && info.service === "officecode" && typeof info.workspace === "string"
      && workspaceKey(info.workspace) === workspaceKey(workspace) && info.mirrorOnly === true && info.leaseManaged === true
      && Number.isInteger(info.activeLeases) && info.activeLeases > 0;
  } catch { return false; }
}
export async function verifyProject(project: ProjectDashboard, timeoutMs = 600): Promise<boolean> {
  const url = localDashboardUrl(project.url);
  return !!url && await healthMatches(url, project.workspace, timeoutMs);
}

/** Reads only plugin registrations and health; discovery never starts or leases a server. */
export async function discoverProjects(root: string, current: ProjectDashboard, timeoutMs = 600): Promise<ProjectDashboard[]> {
  let entries: import("node:fs").Dirent[];
  try { entries = await fs.readdir(root, { withFileTypes: true }); } catch { return [current]; }
  const candidates = entries.filter(entry => entry.isDirectory() && !entry.isSymbolicLink() && /^[a-f0-9]{16}$/.test(entry.name));
  const found = new Map<string, ProjectDashboard>();
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(8, candidates.length) }, async () => {
    while (cursor < candidates.length) {
      const entry = candidates[cursor++];
      try {
        const file = path.join(root, entry.name, "connection.json");
        const stat = await fs.lstat(file);
        if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 16_384) continue;
        const data = JSON.parse(await fs.readFile(file, "utf8"));
        const url = localDashboardUrl(data?.url);
        if (!url || typeof data.workspace !== "string" || data.workspace.length > 4096 || !path.isAbsolute(data.workspace)) continue;
        const workspace = path.resolve(data.workspace), key = workspaceKey(workspace);
        const hash = crypto.createHash("sha256").update(key).digest("hex").slice(0, 16);
        if (hash !== entry.name || key === workspaceKey(current.workspace) || url === current.url) continue;
        if (await healthMatches(url, workspace, timeoutMs)) found.set(key, { name: path.basename(workspace) || workspace, workspace, url, current: false });
      } catch { /* Stale or corrupt registrations are not active projects. */ }
    }
  }));
  return [current, ...[...found.values()].sort((a, b) => a.name.localeCompare(b.name) || a.workspace.localeCompare(b.workspace))];
}
