export interface ActivityStep {
  at: string;
  state: string;
  activity: string;
  detail: string;
}

export function stepDuration(step: ActivityStep, nextAt: string | undefined, now = Date.now()): string {
  const ms = Math.max(0, (nextAt ? Date.parse(nextAt) : now) - Date.parse(step.at));
  if (!Number.isFinite(ms)) return "—";
  const seconds = Math.floor(ms / 1000);
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}
