import { currentWorkActivity, type WorkflowRun } from "./studio-workflow";

const LABELS: Record<string, string> = {
  thinking: "Thinking…", reading: "Reading files", editing: "Editing code",
  "code-search": "Searching code", "web-search": "Searching the web", terminal: "Running commands",
  delegating: "Coordinating agents", arriving: "Setting up workspace", walking: "Walking to desk", working: "Working",
};

export function activityBubble(run: WorkflowRun, waitingLabel?: string): string {
  const activity = currentWorkActivity(run);
  let text: string;
  if (activity === "approval") text = "Needs permission";
  else if (activity === "blocked") text = "Needs attention";
  else if (activity === "done") text = "Done";
  else if (waitingLabel) text = waitingLabel;
  else if (["thinking", "arriving", "walking"].includes(activity)) text = LABELS[activity];
  else {
    const local = (run.activeTools ?? []).filter(tool => tool.activity !== "delegating");
    text = local[local.length - 1]?.detail || run.detail || LABELS[activity] || "Working";
  }
  const clean = text.replace(/[\s\u0000-\u001f\u007f]+/g, " ").trim();
  const chars = [...clean];
  return chars.length > 36 ? chars.slice(0, 35).join("") + "…" : clean;
}
