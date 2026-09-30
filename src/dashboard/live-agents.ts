interface SessionRun { sessionId?: string; state: string }

export function selectVisibleAgents<T extends SessionRun>(runs: readonly T[]): T[] {
  const latest = new Map<string, T>();
  for (const run of runs) {
    if (!run.sessionId) continue;
    latest.delete(run.sessionId);
    latest.set(run.sessionId, run);
  }
  return [...latest.values()].filter((run) => run.state !== "done" && run.state !== "blocked");
}
