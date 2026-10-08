interface FeatureRun { id: string; sessionId?: string; parentSessionId?: string; startedAt?: string; finishedAt?: string }

function linked(parent: FeatureRun, child: FeatureRun): boolean {
  if (!parent.sessionId || parent.id === child.id || child.parentSessionId !== parent.sessionId) return false;
  const at = Date.parse(child.startedAt ?? ""), start = Date.parse(parent.startedAt ?? ""), end = Date.parse(parent.finishedAt ?? "");
  return (!Number.isFinite(at) || !Number.isFinite(start) || at >= start) && (!Number.isFinite(at) || !Number.isFinite(end) || at <= end);
}
export function featureRoot(runs: readonly FeatureRun[], selectedId: string): string | undefined {
  let run = runs.find(run => run.id === selectedId);
  if (!run) return undefined;
  const seen = new Set([run.id]);
  for (;;) {
    const parent = [...runs].reverse().find(parent => linked(parent, run!));
    if (!parent || seen.has(parent.id)) return run.id;
    seen.add(parent.id); run = parent;
  }
}
export function featureMembers(runs: readonly FeatureRun[], rootId: string): Set<string> {
  const root = runs.find(run => run.id === rootId);
  const seen = new Set<string>();
  if (!root) return seen;
  const pending = [root];
  for (let index = 0; index < pending.length; index++) {
    const run = pending[index];
    if (seen.has(run.id)) continue;
    seen.add(run.id);
    for (const child of runs) if (!seen.has(child.id) && linked(run, child)) pending.push(child);
  }
  return seen;
}
