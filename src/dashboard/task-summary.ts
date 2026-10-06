import type { WorkflowRun } from "./studio-workflow";
import type { ActivityStep } from "../shared/run-history";
export type SummaryRun = WorkflowRun & { startedAt?: string; finishedAt?: string; timeline?: ActivityStep[]; historyTruncated?: number };

export function taskSummary(run: SummaryRun, all: readonly SummaryRun[]) {
  const start = Date.parse(run.startedAt ?? ""), end = Date.parse(run.finishedAt ?? "");
  const validTime = Number.isFinite(start) && Number.isFinite(end) && end >= start;
  const seconds = validTime ? Math.floor((end - start) / 1000) : undefined;
  const duration = seconds === undefined ? "—" : seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  const results = (run.timeline ?? []).filter(step => step.outcome);
  const activities: Record<string, number> = {};
  for (const result of results) activities[result.activity] = (activities[result.activity] ?? 0) + 1;
  // Traverse every eligible turn; count a reused child session only once.
  const seenRuns = new Set<string>([run.id]);
  const descendants = new Set<string>();
  const parents = [run];
  if (validTime && run.sessionId) {
    for (let index = 0; index < parents.length; index++) {
      const parent = parents[index];
      const from = Date.parse(parent.startedAt ?? ""), to = Math.min(end, Date.parse(parent.finishedAt ?? run.finishedAt!));
      for (const child of all) {
        const id = child.sessionId ?? child.id, at = Date.parse(child.startedAt ?? "");
        if (!parent.sessionId || child.parentSessionId !== parent.sessionId || id === run.sessionId || seenRuns.has(child.id) || !Number.isFinite(at) || at < from || at > to) continue;
        seenRuns.add(child.id); descendants.add(id); parents.push(child);
      }
    }
  }
  return { duration, subagents: descendants.size, tools: results.length, errors: results.filter(step => step.outcome === "error").length,
    activities, partial: (run.historyTruncated ?? 0) > 0 };
}
