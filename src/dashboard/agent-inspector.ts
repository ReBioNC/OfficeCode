export function resolveFocus<T extends { id: string }>(runs: readonly T[], live: readonly T[], selected?: string): T | undefined {
  return runs.find((run) => run.id === selected) ?? live[0] ?? runs[runs.length - 1];
}

export function hitAgent(positions: readonly { id: string; x: number; y: number }[], x: number, y: number): string | undefined {
  return [...positions].sort((a, b) => b.y - a.y).find((agent) =>
    Math.abs(agent.x - x) <= 23 && y >= agent.y - 46 && y <= agent.y + 4)?.id;
}

export function delegationRows<T extends { sessionId?: string; parentSessionId?: string }>(runs: readonly T[]): { run: T; depth: number }[] {
  const known = new Set(runs.map((run) => run.sessionId));
  const seen = new Set<T>();
  const rows: {run:T;depth:number}[] = [];
  const visit = (run:T,depth:number) => {
    if (seen.has(run)) return;
    seen.add(run); rows.push({run,depth});
    for (const child of runs) if (run.sessionId && child.parentSessionId === run.sessionId) visit(child,depth+1);
  };
  for (const run of runs) if (!run.parentSessionId || !known.has(run.parentSessionId)) visit(run,run.parentSessionId?1:0);
  // Malformed relationships must not hide sessions or recurse indefinitely.
  for (const run of runs) if (!seen.has(run)) visit(run,0);
  return rows;
}
