export interface ProjectDashboard { name: string; workspace: string; url: string; current: boolean }

export function localDashboardUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const match = /^http:\/\/127\.0\.0\.1:(\d{1,5})\/?$/.exec(value);
  const port = match ? Number(match[1]) : 0;
  return port >= 1 && port <= 65535 ? `http://127.0.0.1:${port}` : undefined;
}
