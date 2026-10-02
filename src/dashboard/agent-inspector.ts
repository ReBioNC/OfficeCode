export function resolveFocus<T extends { id: string }>(runs: readonly T[], live: readonly T[], selected?: string): T | undefined {
  return runs.find((run) => run.id === selected) ?? live[0] ?? runs[runs.length - 1];
}

export function hitAgent(positions: readonly { id: string; x: number; y: number }[], x: number, y: number): string | undefined {
  return [...positions].sort((a, b) => b.y - a.y).find((agent) =>
    Math.abs(agent.x - x) <= 23 && y >= agent.y - 46 && y <= agent.y + 4)?.id;
}
