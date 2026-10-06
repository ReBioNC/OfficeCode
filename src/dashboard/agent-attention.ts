import type { WorkflowRun } from "./studio-workflow";
import type { ActivityStep } from "../shared/run-history";
type AttentionRun = WorkflowRun & { timeline?: ActivityStep[] };
export interface AgentAttention { kind: "permission" | "stopped" | "tool-error"; label: string; detail: string; icon: string }
export function attentionFor(run: AttentionRun): AgentAttention | undefined {
  if (run.state === "done") return undefined;
  if (run.state === "waiting-approval" || run.activity === "approval") return { kind: "permission", label: "Permission needed", detail: run.detail || "Respond to the permission request in OpenCode.", icon: "!" };
  if (run.state === "blocked") return { kind: "stopped", label: "Agent stopped", detail: run.detail || "Inspect the session in OpenCode for the cause.", icon: "!" };
  const result = [...(run.timeline ?? [])].reverse().find(step => step.outcome);
  if (result?.outcome === "error") return { kind: "tool-error", label: "Tool failed", detail: result.detail || "A tool reported an error. Check its output in OpenCode.", icon: "!" };
  return undefined;
}
export function attentionRuns<T extends AttentionRun>(runs: readonly T[]): T[] {
  const latest = new Map<string, T>();
  for (const run of runs) latest.set(run.sessionId ?? run.id, run);
  return [...latest.values()].filter(run => attentionFor(run));
}
