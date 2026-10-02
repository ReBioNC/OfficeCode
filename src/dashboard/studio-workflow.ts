import type { ActiveTool } from "../shared/run-history";
import type { OfficeStation } from "./studio-seating";
import { displayWorkRole } from "./work-role";

export interface WorkflowRun {
  id: string; sessionId?: string; parentSessionId?: string;
  role: string; prompt: string; state: string; activity?: string; detail?: string; activeTools?: ActiveTool[];
}

export function waitingFor(run: WorkflowRun, visible: readonly WorkflowRun[]): WorkflowRun[] {
  const tools=run.activeTools ?? [];
  if (!run.sessionId || run.state === "done" || run.state === "blocked" || run.state === "waiting-approval" || run.activity === "approval"
    || !tools.length || tools.some(tool=>tool.activity!=="delegating")) return [];
  return visible.filter(child=>child.id!==run.id && child.parentSessionId===run.sessionId && child.state!=="done" && child.state!=="blocked");
}

export function currentWorkActivity(run: WorkflowRun): string {
  if (run.state==="waiting-approval" || run.activity==="approval") return "approval";
  if (run.state==="done" || run.state==="blocked") return run.state;
  // A task tool can be the most recent call while a local read/edit is running.
  const local=(run.activeTools ?? []).filter(tool=>tool.activity!=="delegating");
  return local[local.length-1]?.activity ?? run.activity ?? run.state;
}

export function stationForRun(run: WorkflowRun, visible: readonly WorkflowRun[]): OfficeStation {
  if (run.state === "done") return "lounge";
  if (run.state === "blocked" || run.state === "waiting-approval" || run.activity === "approval") return "approval";
  if (waitingFor(run,visible).length) return "waiting";
  const activity=currentWorkActivity(run);
  if (activity === "arriving" || activity === "walking") return "arrival";
  if (activity === "web-search") return "web-search";
  if (activity === "delegating") return "delegating";
  if (activity === "thinking") return "thinking";
  const role=displayWorkRole(run,false);
  if (role === "QA" || role === "Auditor") return "review";
  if (activity === "reading" || activity === "code-search") return "reading";
  if (activity === "terminal") return "terminal";
  if (activity === "editing" || activity === "working" || run.state === "acting") return "editing";
  return "thinking";
}

export const STATION_LABEL: Record<OfficeStation,string> = {
  arrival:"Lobby / reception",approval:"Lobby / reception",reading:"Library","web-search":"Library",
  thinking:"Planning room",delegating:"Planning room",editing:"Code workspace",terminal:"Code workspace",
  review:"Focus & review",waiting:"Waiting lounge",lounge:"Waiting lounge",
};
