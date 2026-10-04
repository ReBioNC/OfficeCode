import { currentWorkActivity, type WorkflowRun } from "./studio-workflow";
import type { FrameName } from "./sprites";

// Exclude quoted data and escaped separators from command classification.
function unquotedCommand(command: string): string {
  let quote = "", escaped = false, result = "";
  for (const char of command) {
    if (escaped) { escaped = false; result += " "; continue; }
    if (quote !== "'" && (char === "\\" || char === "`")) { escaped = true; result += " "; continue; }
    if (quote) { if (char === quote) quote = ""; result += " "; continue; }
    if (char === "'" || char === '"') { quote = char; result += " "; continue; }
    result += char;
  }
  return result;
}

export type ActivityVisual = "editing" | "reading" | "search" | "web" | "testing" | "terminal" | "thinking" | "waiting" | "approval" | "idle";
export function activityVisual(run: WorkflowRun, waiting = false): ActivityVisual {
  const activity = currentWorkActivity(run);
  if (activity === "done" || activity === "blocked") return "idle";
  if (activity === "approval") return "approval";
  if (waiting) return "waiting";
  if (activity === "code-search") return "search";
  if (activity === "web-search") return "web";
  if (activity === "delegating" || activity === "thinking") return "thinking";
  if (activity === "terminal") {
    const tools = (run.activeTools ?? []).filter(tool => tool.activity !== "delegating");
    const detail = tools[tools.length - 1]?.detail ?? run.detail ?? "";
    // This is a running-command cue, never a test result or progress estimate.
    const testing = detail === "Running tests" || /(?:^|&&|;|\|\|)\s*(?:(?:npx|uv\s+run|poetry\s+run)\s+)?(?:(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?test\b|(?:pytest|vitest|jest)(?=\s|$)|node\s+--test\b|(?:cargo|go|dotnet|mvn|gradle)\s+test\b)/i.test(unquotedCommand(detail));
    return testing ? "testing" : "terminal";
  }
  if (activity === "reading") return "reading";
  if (["editing", "working", "acting"].includes(activity)) return "editing";
  return "idle";
}

export function activityPose(kind: ActivityVisual, seated: boolean, phase: number): FrameName {
  const index = Math.abs(Math.floor(phase)) % 4;
  if (kind === "reading" || kind === "search") return seated ? (index < 2 ? "readSeatA" : "readSeatB") : (index < 2 ? "readA" : "readB");
  if (kind === "thinking") return seated ? (index < 2 ? "talkA" : "talkB") : "work";
  if (kind === "waiting") return seated ? "talkA" : "idle";
  if (kind === "approval" || kind === "idle") return "idle";
  if (!seated) return "work";
  if (kind === "testing" || kind === "terminal") return index < 2 ? "watchA" : "watchB";
  if (kind === "web") return index < 3 ? "watchA" : "typeC";
  return (["typeA", "typeB", "typeC", "typeD"] as const)[index];
}

export function drawActivityScreen(ctx: CanvasRenderingContext2D, kind: ActivityVisual, desk: readonly [number, number], phase: number): void {
  if (["idle", "waiting", "approval", "thinking"].includes(kind)) return;
  const x = desk[0] + 15, y = desk[1] - 12, step = Math.abs(phase) % 4;
  const rect = (dx: number, dy: number, w: number, h: number, color: string) => { ctx.fillStyle = color; ctx.fillRect(x + dx, y + dy, w, h); };
  rect(0, 0, 24, 15, "#162e45");
  if (kind === "web") {
    rect(0, 0, 24, 3, "#c5bbeb"); rect(2, 1, 2, 1, "#ff827d"); rect(6, 1, 8, 1, "#5d628d");
    rect(2, 5, 20, 3, "#f7e7d5"); rect(4, 6, 10, 1, "#5d628d");
    for (let i = 0; i < 2; i++) { rect(2, 10 + i * 3, 4, 2, "#67dccb"); rect(8, 10 + i * 3, 11 - step, 1, "#b5c4e8"); }
  } else if (kind === "testing") {
    rect(2, 2, 10, 2, "#f8be6a");
    for (let i = 0; i < 4; i++) rect(2 + i * 5, 7, 3, 3, i === step ? "#f8be6a" : "#576280");
    rect(2, 12, 16, 1, "#9294bf");
  } else if (kind === "terminal") {
    rect(2, 2, 2, 2, "#67dccb"); rect(4, 4, 2, 2, "#67dccb"); rect(2, 6, 2, 2, "#67dccb");
    rect(8, 4, 12, 1, "#b5fff0"); rect(2, 10, 15, 1, "#76a7b5"); if (step < 2) rect(18, 10, 3, 2, "#b5fff0");
  } else if (kind === "reading" || kind === "search") {
    rect(2, 1, 20, 13, "#f7e7d5");
    for (let i = 0; i < 4; i++) rect(5, 3 + i * 3, 11 + i % 2 * 3, 1, "#777a9f");
    if (kind === "search") rect(4, 3 + step * 3, 15, 2, "#f8be6a");
  } else {
    rect(0, 0, 4, 15, "#53577d");
    for (let i = 0; i < 4; i++) rect(6 + i % 2 * 2, 2 + i * 3, 10 - i % 3 * 2, 1, ["#67dccb", "#c6a2f6", "#ff827d"][i % 3]);
    rect(6 + step * 3, 12, 2, 2, "#fff1df");
  }
}

export function drawActivityProp(ctx: CanvasRenderingContext2D, kind: ActivityVisual, x: number, y: number, phase: number): void {
  const rect = (dx: number, dy: number, w: number, h: number, color: string) => { ctx.fillStyle = color; ctx.fillRect(x + dx, y + dy, w, h); };
  if (kind === "reading" || kind === "search") {
    rect(6, 25, 25, 17, "#15172f"); rect(8, 27, 21, 13, "#fff1df"); rect(18, 27, 2, 13, "#c6a2f6");
    for (let i = 0; i < 3; i++) { rect(10, 29 + i * 3, 6, 1, "#777a9f"); rect(22, 29 + i * 3, 5, 1, "#777a9f"); }
    if (phase % 4 >= 2) rect(19, 27, 6, 13, "#ddd3ec");
    if (kind === "search") { rect(26, 26 + phase % 2 * 3, 9, 9, "#67dccb"); rect(28, 28 + phase % 2 * 3, 5, 5, "#162e45"); rect(33, 34 + phase % 2 * 3, 5, 3, "#f8be6a"); }
  } else if (kind === "thinking") {
    rect(8, 29, 18, 11, "#fff1df"); rect(11, 32, 9, 1, "#9294bf"); rect(22 + phase % 2 * 2, 27, 3, 10, "#f8be6a");
  }
}
