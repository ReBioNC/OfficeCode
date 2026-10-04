import type { Point } from "./agent-motion";
import type { WorkflowRun } from "./studio-workflow";
import { selectVisibleAgents } from "./live-agents";
export interface TransferSeed { childId: string; parentId: string; from: Point; to: Point }
export function completionTransfers(previous: readonly WorkflowRun[], current: readonly WorkflowRun[], positions: ReadonlyMap<string, Point>): TransferSeed[] {
  const before = new Map(selectVisibleAgents(previous).map(run => [run.id, run]));
  const parents = new Map(selectVisibleAgents(current).map(run => [run.sessionId, run]));
  const previousParents = new Map(selectVisibleAgents(previous).map(run => [run.sessionId, run.id]));
  const result: TransferSeed[] = [];
  for (const child of current) {
    if (child.state !== "done" || !before.has(child.id) || !child.sessionId || !child.parentSessionId) continue;
    const parent = parents.get(child.parentSessionId);
    if (!parent || parent.id !== previousParents.get(child.parentSessionId) || parent.id === child.id) continue;
    const from = positions.get(child.sessionId), to = positions.get(child.parentSessionId);
    if (!from || !to) continue;
    result.push({ childId: child.id, parentId: parent.id, from: { ...from }, to: { ...to } });
  }
  return result;
}

export function transferPoint(from: Point, to: Point, progress: number): Point {
  const t = Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0;
  if (t === 0) return { ...from };
  if (t === 1) return { ...to };
  const eased = t * t * (3 - 2 * t);
  const lift = Math.sin(Math.PI * t) * Math.min(90, Math.hypot(to.x - from.x, to.y - from.y) / 4);
  return { x: from.x + (to.x - from.x) * eased, y: from.y + (to.y - from.y) * eased - lift };
}
