import { localDashboardUrl, type ProjectDashboard } from "../shared/project-dashboard";

export function projectLabel(row: ProjectDashboard, rows: readonly ProjectDashboard[]): string {
  const others = rows.filter(other => other.name === row.name && other.workspace !== row.workspace);
  if (!others.length) return row.name;
  const parents = (workspace: string) => workspace.split(/[\\/]/).filter(Boolean).slice(0, -1);
  const parts = parents(row.workspace);
  for (let depth = 1; depth <= parts.length; depth++) {
    const suffix = parts.slice(-depth).join("/");
    if (others.every(other => parents(other.workspace).slice(-depth).join("/") !== suffix)) return `${row.name} — ${suffix}`;
  }
  return `${row.name} — ${row.workspace}`;
}

export function projectRows(value: unknown, currentOrigin: string): ProjectDashboard[] {
  const ownUrl = localDashboardUrl(currentOrigin.replace(/^http:\/\/localhost:/, "http://127.0.0.1:"));
  if (!ownUrl) return [];
  const data = value && typeof value === "object" ? value as { projects?: unknown } : {};
  const rows = new Map<string, ProjectDashboard>();
  for (const entry of Array.isArray(data.projects) ? data.projects : []) {
    if (!entry || typeof entry !== "object") continue;
    const url = localDashboardUrl(entry.url);
    if (!url || rows.has(url) || typeof entry.name !== "string" || !entry.name || entry.name.length > 512
      || typeof entry.workspace !== "string" || !entry.workspace || entry.workspace.length > 4096) continue;
    rows.set(url, { name: entry.name, workspace: entry.workspace, url, current: url === ownUrl });
  }
  const current = rows.get(ownUrl) ?? { name: "Current dashboard", workspace: "", url: ownUrl, current: true };
  return [current, ...[...rows.values()].filter(row => !row.current)];
}

/** A separate optional read-only feed; failure never affects office rendering. */
export function attachProjectSwitcher(): void {
  const select = document.getElementById("projectSelect") as HTMLSelectElement | null;
  const refresh = document.getElementById("refreshProjects") as HTMLButtonElement | null;
  const status = document.getElementById("projectStatus");
  if (!select || !refresh || !status) return;
  let rows = projectRows(null, window.location.origin);
  type Result = { projects: ProjectDashboard[]; verified: boolean; message?: string };
  let pending: Promise<Result> | undefined;
  let deferred: Result | undefined;
  let selecting = false;
  let signature = "";

  function render() {
    const next = JSON.stringify(rows);
    if (next !== signature) {
      signature = next;
      select!.replaceChildren(...rows.map(row => {
        const option = document.createElement("option"); option.value = row.url;
        option.textContent = `${projectLabel(row, rows)}${row.current ? " (current)" : ""}`;
        option.title = row.workspace;
        return option;
      }));
    }
    const current = rows.find(row => row.current);
    select!.value = current?.url ?? ""; select!.title = current?.workspace || "Current dashboard";
    select!.disabled = selecting || rows.length < 2;
  }
  function apply(result: Result) {
    deferred = undefined; rows = result.projects; render();
    const count = rows.filter(row => !row.current).length;
    status!.textContent = result.message || (count ? `${count} other active ${count === 1 ? "project" : "projects"}` : "No other active projects");
  }
  function load(background = false, verifyUrl?: string): Promise<Result> {
    if (pending && !verifyUrl) return pending;
    refresh!.disabled = true;
    const task: Promise<Result> = (async () => {
      const route = verifyUrl ? `/api/projects?verify=${encodeURIComponent(verifyUrl)}` : "/api/projects";
      const response = await fetch(route, { cache: "no-store", signal: AbortSignal.timeout(5000) });
      if (!response.ok) throw new Error(response.status === 404 ? "Project switcher needs a server restart. Reopen your agent app." : "Project list unavailable. Retry.");
      const data = await response.json();
      if (!Array.isArray(data?.projects)) throw new Error("Project list unavailable. Retry.");
      const result = { projects: projectRows(data, window.location.origin), verified: data.verified === true };
      if (background && (document.activeElement === select || selecting)) deferred = result;
      else apply(result);
      return result;
    })().catch(error => {
      const result = { projects: rows.filter(row => row.current), verified: false, message: error instanceof Error && error.message.startsWith("Project switcher needs") ? error.message : "Project list unavailable. Retry." };
      if (background && document.activeElement === select) { deferred = result; status!.textContent = result.message; }
      else apply(result);
      throw error;
    }).finally(() => { if (pending === task) pending = undefined; refresh!.disabled = selecting || !!pending; });
    if (!verifyUrl) pending = task;
    return task;
  }
  refresh.addEventListener("click", () => { void load().catch(() => {}); });
  select.addEventListener("change", () => {
    const chosen = rows.find(row => row.url === select.value && !row.current);
    if (!chosen || selecting) return;
    selecting = true;
    select.disabled = true;
    void (async () => {
      if (pending) await pending.catch(() => {});
      const fresh = await load(false, chosen.url);
      const active = fresh.projects.find(row => row.url === chosen.url && row.workspace === chosen.workspace && !row.current);
      if (fresh.verified && active) window.location.assign(active.url);
      else status!.textContent = "That dashboard is no longer active. Refresh projects.";
    })().catch(() => {}).finally(() => { selecting = false; deferred = undefined; render(); refresh!.disabled = !!pending; });
  });
  select.addEventListener("blur", () => { if (deferred && !selecting) apply(deferred); });
  render(); void load().catch(() => {});
  window.setInterval(() => {
    if (document.visibilityState === "visible" && document.activeElement !== select && !selecting) void load(true).catch(() => {});
  }, 5000);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && !selecting) void load(true).catch(() => {}); });
}
