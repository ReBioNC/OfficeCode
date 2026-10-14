export interface AgentProvenanceSource {
  runtime?: string;
  workspace?: string;
  agent?: string;
  role?: string;
  sessionId?: string;
  parentSessionId?: string;
}

export function runtimeLabel(run?: AgentProvenanceSource): string {
  if (run?.runtime === "opencode") return "OpenCode";
  if (run?.runtime === "hermes") return "Hermes";
  return "Unknown runtime";
}

export function agentProvenance(run: AgentProvenanceSource | undefined, runs: readonly AgentProvenanceSource[]): { runtime: string; agent: string; workspace: string; parent: string } {
  const parent = run?.parentSessionId ? [...runs].reverse().find(candidate => candidate.sessionId === run.parentSessionId) : undefined;
  return {
    runtime: runtimeLabel(run),
    agent: run?.agent || run?.role || "Not provided",
    workspace: run?.workspace || "Not provided",
    parent: !run?.parentSessionId ? "Not provided" : parent
      ? `${runtimeLabel(parent)} · ${parent.agent || parent.role || "Not provided"} · ${run.parentSessionId}`
      : `Unknown runtime · ${run.parentSessionId} (not observed)`,
  };
}
