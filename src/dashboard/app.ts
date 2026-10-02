import { deskPoint, roomRect, type Rect } from "./layout";
import { displayWorkRole, resolveWorkRole } from "./work-role";
import { resolveFocus, hitAgent, delegationRows } from "./agent-inspector";
import { stepDuration, type ActivityStep, type ActiveTool } from "../shared/run-history";
import { attachStudioCamera } from "./studio-camera";
import { connectionStatus } from "./connection-status";
import { selectVisibleAgents } from "./live-agents";
import { allocateStudioSeats, studioGeometry, studioHeight, type OfficeStation, type StudioSeat } from "./studio-seating";
import { getStudioPeriod, STUDIO_THEMES } from "./studio-theme";
import { advanceTimedRoute, planRoute, type Direction, type Point } from "./agent-motion";
import { drawExpandedOffice } from "./studio-art";
import { stationForRun, waitingFor, currentWorkActivity, STATION_LABEL } from "./studio-workflow";
import { waitingDestination, type WaitingSchedule } from "./studio-waiting";
import { STUDIO_DOORS, STUDIO_WIDTH, STUDIO_BASE_HEIGHT, STUDIO_ENTRY, STUDIO_OBSTACLES } from "./studio-map";
import {
  BOARD_MAP, BOARD_PALETTE, CHAIR_MAP, CHAIR_PALETTE, CHAR_FRAMES,
  COMPUTER_MAP, COMPUTER_PALETTE, DESK_MAP, DESK_PALETTE, INK, PLANT_MAP, PLANT_PALETTE,
  PRINTER_MAP, PRINTER_PALETTE, RACK_MAP, RACK_PALETTE,
  SOFA_MAP, SOFA_PALETTE, TABLE_MAP, TABLE_PALETTE, WALK_FRAMES,
  agentPalette, avatarFrame, drawSprite, frameForState, shirtPalette, snap,
} from "./sprites";

interface Desk { id: string; roomId: string; label: string }
interface Room { id: string; name: string; color: string }
interface Hallway { fromRoomId: string; toRoomId: string; open: boolean }
interface PlacedObject { id: string; roomId: string; kind: string }
interface OfficeDoc { building: string; rooms: Room[]; desks: Desk[]; hallways: Hallway[]; objects: PlacedObject[] }
interface Run { id: string; deskId: string; role: string; state: string; prompt: string; sessionId?: string; parentSessionId?: string; activity?: string; detail?: string; startedAt?: string; finishedAt?: string; timeline?: ActivityStep[]; historyTruncated?: number; activeTools?: ActiveTool[] }
interface QueueItem { position: number; deskId: string; role: string; prompt: string }

const COLORS = {
  night: "#101326", paper: "#f7e7d5", light: "#fff1df", wall: "#504268",
  floor: "#383a68", floorLine: "#2d315b", muted: "#b9acc4", gold: "#f8be6a",
};
const ROOM_COLORS: Record<string, string> = {
  blue: "#8ea8f1", green: "#67dccb", red: "#ff827d", purple: "#c6a2f6",
};
const ROLE_PILL: Record<string, string> = {
  build: "#ff827d", plan: "#c6a2f6", explore: "#67dccb", general: "#f8be6a",
  researcher: "#67dccb", architect: "#c6a2f6", tester: "#8ed9a2",
  writer: "#eaa1c4", debugger: "#ff827d", security: "#f8be6a",
  pm: "#ff827d", "uiux-designer": "#eaa1c4", "frontend-dev": "#ff827d",
  "backend-dev": "#b49cf0", "api-dev": "#67dccb", "database-dev": "#8ed9a2",
  devops: "#f29c75", "qa-engineer": "#8ed9a2", reviewer: "#f8be6a",
  "docs-writer": "#a7add5",
};
const ACTIVITY: Record<string, { label: string; persona: string; station: string; color: string }> = {
  arriving: { label: "Setting up workspace", persona: "Agent", station: "door", color: "#f8be6a" },
  thinking: { label: "Thinking", persona: "Planner", station: "idea desk", color: "#c6a2f6" },
  reading: { label: "Reading files", persona: "Code reader", station: "reference shelf", color: "#8ea8f1" },
  editing: { label: "Editing code", persona: "Code editor", station: "code desk", color: "#ff827d" },
  "web-search": { label: "Searching the web", persona: "Web researcher", station: "web station", color: "#67dccb" },
  "code-search": { label: "Searching code", persona: "Code researcher", station: "reference shelf", color: "#8ea8f1" },
  terminal: { label: "Running commands", persona: "Terminal operator", station: "terminal", color: "#f8be6a" },
  delegating: { label: "Coordinating", persona: "Coordinator", station: "task board", color: "#c6a2f6" },
  working: { label: "Working", persona: "Developer", station: "code desk", color: "#ff827d" },
  approval: { label: "Waiting for permission", persona: "Awaiting a decision", station: "door", color: "#f8be6a" },
  done: { label: "Done", persona: "Done", station: "lounge", color: "#8ed9a2" },
  blocked: { label: "Stopped", persona: "Needs help", station: "door", color: "#ff827d" },
};
const STATUS_LABEL: Record<string, string> = {
  walking: "Walking to desk", thinking: "Thinking", acting: "Working",
  "waiting-approval": "Needs permission", blocked: "Blocked",
  "in-handoff": "Handoff", delivering: "Delivering", done: "Done",
};
const BUBBLE_TEXT: Record<string, (run: Run) => string | null> = {
  thinking: () => "Thinking…",
  acting: (run) => `Work: ${short(run.prompt, 18)}`,
  "waiting-approval": () => "Needs permission !",
  blocked: () => "Needs help !",
  "in-handoff": () => "Handoff",
  delivering: () => "Delivering results",
  done: () => "Done ✓",
};

const canvas = document.getElementById("floor") as HTMLCanvasElement;
const context = canvas.getContext("2d");
if (!context) throw new Error("Canvas 2D is unavailable");
const ctx: CanvasRenderingContext2D = context;
ctx.imageSmoothingEnabled = false;
const statActive = document.getElementById("statActive") as HTMLSpanElement;
const statQueue = document.getElementById("statQueue") as HTMLSpanElement;
const statSpent = document.getElementById("statSpent") as HTMLSpanElement;
const runsUl = document.getElementById("runs") as HTMLUListElement;
const queueUl = document.getElementById("queue") as HTMLUListElement;
const crewUl = document.getElementById("crew") as HTMLUListElement;
const connection = document.getElementById("connection") as HTMLSpanElement;
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

let office: OfficeDoc = { building: "HQ", rooms: [], desks: [], hallways: [], objects: [] };
let mirrorOnly = false;
let occupants: Record<string, string> = {};
let runs: Run[] = [];
let queue: QueueItem[] = [];
let spentEstimated = 0;
let streamReady = false;
let latestFetchOkay = false;
let serverAvailable = false;
let healthAttempted = false;
let lastSnapshotAt = 0;
let healthInfo: { leaseManaged?: boolean; activeLeases?: number; lastEventAt?: string | null } = {};
let refreshPending = false;
let refreshing = false;
let retryTimer: number | undefined;
const agentPositions = new Map<string, { point: Point; target: Point; route: Point[]; time: number; direction: Direction; station?: OfficeStation }>();
const waitingSchedules = new Map<string, WaitingSchedule>();
const studioBackground = document.createElement("canvas");
const backgroundCtx = studioBackground.getContext("2d");
let studioDirty = true;
let animationFrame: number | undefined;
let lastPaint = 0;
let lastDoorTime = 0;
let hiddenAt: number | undefined;
const doorOpenness = new Map<string, number>();
let studioSeats = new Map<string, StudioSeat>();
let geometry = studioGeometry(studioSeats);
let studioPeriod = getStudioPeriod(new Date());
let theme = STUDIO_THEMES[studioPeriod];
let selectedRunId: string | undefined;
let showRelations = false;
const relationsToggle = document.getElementById("toggleRelations") as HTMLButtonElement;
relationsToggle.onclick = () => {
  showRelations = !showRelations;
  relationsToggle.setAttribute("aria-pressed", String(showRelations));
  relationsToggle.textContent = showRelations ? "Hide relations" : "Show relations";
  draw();
};
const camera = attachStudioCamera(canvas, () => {
  const focus = resolveFocus(runs, visibleAgents(), selectedRunId);
  return focus ? agentPositions.get(focus.sessionId ?? focus.id)?.point : undefined;
});

function selectAgent(runId: string): void {
  selectedRunId = runId;
  renderPanels();
  draw();
}

canvas.addEventListener("click", (event) => {
  if (camera.suppressClick()) return;
  const bounds = canvas.getBoundingClientRect();
  const sessionId = hitAgent([...agentPositions].map(([id, agent]) => ({ id, ...agent.point })),
    (event.clientX - bounds.left) * canvas.width / bounds.width, (event.clientY - bounds.top) * canvas.height / bounds.height);
  const run = visibleAgents().find((entry) => (entry.sessionId ?? entry.id) === sessionId);
  if (run) selectAgent(run.id);
});

function updateStudioClock(): boolean {
  const date = new Date();
  const period = getStudioPeriod(date);
  const changed = period !== studioPeriod;
  studioPeriod = period;
  theme = STUDIO_THEMES[period];
  const root = document.documentElement;
  root.dataset.period = period;
  root.style.colorScheme = period === "morning" || period === "day" ? "light" : "dark";
  for (const [name, value] of Object.entries(theme.ui)) root.style.setProperty(`--${name}`, value);
  (document.getElementById("studioPeriod") as HTMLElement).textContent = `${theme.label} studio / live feed`;
  const clock = document.getElementById("studioClock") as HTMLTimeElement;
  clock.textContent = `${date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })} · local time`;
  clock.dateTime = date.toISOString();
  document.title = `OfficeCode — ${theme.label} Studio`;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme.ui.night);
  if (changed) studioDirty = true;
  return changed;
}

function short(value: string, max: number): string {
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

function label(state: string): string {
  return STATUS_LABEL[state] ?? state;
}

function visibleAgents(): Run[] {
  return selectVisibleAgents(runs);
}

function activityOf(run: Run): { label: string; persona: string; station: string; color: string } {
  const dependencies=waitingFor(run,visibleAgents());
  if (dependencies.length) {
    const roles=[...new Set(dependencies.map(child=>displayWorkRole(child,false)))];
    return {label:`Waiting for ${roles.length>2?`${dependencies.length} agents`:roles.join(" & ")}`,persona:"Awaiting delegated work",station:"Waiting lounge",color:"#f8be6a"};
  }
  const activity=ACTIVITY[currentWorkActivity(run)] ?? ACTIVITY[run.state] ?? ACTIVITY.working;
  return {...activity,station:STATION_LABEL[stationFor(run)]};
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, content?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (content !== undefined) node.textContent = content;
  return node;
}

function renderConnection(): void {
  const status = connectionStatus({ server: serverAvailable, stream: streamReady, fresh: latestFetchOkay && Date.now() - lastSnapshotAt < 30_000,
    managed: healthInfo.leaseManaged === true, leases: healthInfo.activeLeases ?? 0, active: visibleAgents().length, attempted: healthAttempted });
  connection.dataset.state = status.state;
  connection.textContent = status.text;
  canvas.dataset.sync = status.state;
  const lastEvent = document.getElementById("lastEvent") as HTMLElement;
  lastEvent.textContent = healthInfo.lastEventAt ? `Last event ${new Date(healthInfo.lastEventAt).toLocaleTimeString("en-GB")}` : "No activity received yet";
}

function renderPanels(): void {
  const focusedKey = (document.activeElement as HTMLElement | null)?.dataset.focusKey;
  const runById = new Map(runs.map((run) => [run.id, run]));
  const sessions = mirrorOnly ? visibleAgents() : [];
  studioSeats = allocateStudioSeats(sessions.map((run) => ({ id: run.sessionId ?? run.id, station: stationFor(run) })), studioSeats);
  const nextGeometry = studioGeometry(studioSeats, occupiedStudioHeight());
  if (geometry.height !== nextGeometry.height) studioDirty = true;
  geometry = nextGeometry;
  const focus = resolveFocus(runs, sessions, selectedRunId);
  relationsToggle.hidden = !mirrorOnly;
  (document.getElementById("zoomFocus") as HTMLButtonElement).disabled = !focus || !sessions.some((run) => run.id === focus.id);
  (document.getElementById("timelineSection") as HTMLElement).hidden = !mirrorOnly;
  const steps = focus?.timeline ?? [];
  const timeline = document.getElementById("timelineList") as HTMLElement;
  timeline.replaceChildren(...steps.slice(-30).map((step, index, shown) => {
    const item = element("li", "timeline-step");
    const time = element("time", "timeline-time", new Date(step.at).toLocaleTimeString("en-GB"));
    time.dateTime = step.at;
    const duration = stepDuration(step, shown[index + 1]?.at ?? focus?.finishedAt);
    item.dataset.outcome = step.outcome ?? "";
    item.append(time, element("strong", "", `${ACTIVITY[step.activity]?.label ?? label(step.state)}${step.outcome ? ` · ${step.outcome}` : ""} · ${duration}`), element("span", "timeline-detail", step.detail));
    return item;
  }));
  if (!steps.length) timeline.append(element("li", "empty", "Select an agent to inspect its workflow."));
  (document.getElementById("timelineSummary") as HTMLElement).textContent = focus
    ? `${label(focus.state)} · ${steps.length + (focus.historyTruncated ?? 0)} steps${steps.length > 30 || focus.historyTruncated ? " · latest 30" : ""}` : "No run selected";
  const roleFor = (run: Run): string => displayWorkRole(run, sessions.length === 1 && sessions[0]?.id === run.id);
  (document.getElementById("teamSection") as HTMLElement).hidden = !mirrorOnly;
  const teamList = document.getElementById("teamList") as HTMLElement;
  const latestSessions = new Map(runs.filter((run) => run.sessionId).map((run) => [run.sessionId, run]));
  teamList.replaceChildren(...delegationRows(sessions).map(({run,depth}) => {
    const parent = latestSessions.get(run.parentSessionId);
    const item = element("li", "team-item");
    item.style.marginLeft = `${Math.min(depth, 6) * 12}px`;
    const choose = element("button", "team-select", `${run.parentSessionId ? "↳ " : "● "}${roleFor(run)} · ${short(run.prompt, 40)}`);
    choose.type = "button";
    choose.dataset.focusKey = `team:${run.id}`;
    choose.onclick = () => selectAgent(run.id);
    item.append(choose, element("span", "team-parent", run.parentSessionId
      ? `Delegated by ${parent ? `${displayWorkRole(parent, false)} · ${short(parent.prompt, 32)}` : "parent session (not on this floor)"}`
      : "Main session"));
    return item;
  }));
  if (!sessions.length) teamList.append(element("li", "empty", "No active agents."));
  (document.getElementById("focusSection") as HTMLElement).hidden = !mirrorOnly;
  (document.getElementById("activityTracker") as HTMLElement).hidden = !mirrorOnly;
  if (mirrorOnly) {
    (document.getElementById("focusStation") as HTMLElement).textContent = focus ? activityOf(focus).station : "Standby";
    (document.getElementById("focusRole") as HTMLElement).textContent = focus ? `Agent ${roleFor(focus)} · ${activityOf(focus).persona}` : "OpenCode agent";
    if (focus) {
      const source = resolveWorkRole(focus, sessions.length === 1 && sessions[0]?.id === focus.id).source;
      (document.getElementById("focusRole") as HTMLElement).textContent += source === "inferred" ? " · inferred role" : source === "single-agent" ? " · single-agent role" : "";
    }
    (document.getElementById("focusTask") as HTMLElement).textContent = focus?.prompt || "Waiting for a session";
    (document.getElementById("focusActivity") as HTMLElement).textContent = focus ? activityOf(focus).label : "No activity yet";
    (document.getElementById("focusDetail") as HTMLElement).textContent = focus?.detail || "Start working on a feature in OpenCode.";
    const tools = document.getElementById("activeTools") as HTMLElement;
    tools.replaceChildren(...(focus?.activeTools ?? []).map((tool) => element("li", "tool-item", `${tool.name} · ${tool.detail}`)));
    tools.hidden = !focus?.activeTools?.length;
    const activeModes = new Set(sessions.map((run) => {
      const station=stationFor(run),activity=currentWorkActivity(run);
      if (station==="waiting" || station==="arrival" || station==="approval") return station;
      if (activity === "code-search") return "reading";
      if (activity === "working") return "editing";
      if (activity === "delegating") return "thinking";
      return activity;
    }));
    for (const run of sessions) {
      if (stationFor(run)==="review") activeModes.add("review");
      if (stationFor(run)==="waiting" || stationFor(run)==="approval") continue;
      for (const tool of run.activeTools ?? []) activeModes.add(tool.activity === "code-search" ? "reading" : tool.activity === "delegating" ? "thinking" : tool.activity);
    }
    document.querySelectorAll<HTMLElement>(".activity-chip").forEach((chip) => {
      chip.dataset.active = activeModes.has(chip.dataset.activity ?? "") ? "true" : "false";
    });
  }
  statActive.textContent = String(mirrorOnly ? sessions.filter((run) => run.state !== "done" && run.state !== "blocked").length : Object.keys(occupants).length);
  statQueue.textContent = String(queue.length);
  statSpent.textContent = `$${spentEstimated < 1 ? spentEstimated.toFixed(4) : spentEstimated.toFixed(2)}`;
  (document.getElementById("floorMeta") as HTMLElement).textContent = mirrorOnly ? `6 rooms · ${sessions.length} ${sessions.length === 1 ? "agent" : "agents"}` : `${office.rooms.length} rooms · ${office.desks.length} desks`;
  (document.getElementById("crewCount") as HTMLElement).textContent = mirrorOnly ? `${sessions.length} ${sessions.length === 1 ? "agent" : "agents"} visible` : `${office.desks.length} slots available`;
  (document.getElementById("activityCount") as HTMLElement).textContent = `${runs.length} ${runs.length === 1 ? "run" : "runs"}`;
  (document.getElementById("queueCount") as HTMLElement).textContent = `${queue.length} ${queue.length === 1 ? "task" : "tasks"}`;
  (document.getElementById("queueEmpty") as HTMLElement).hidden = queue.length > 0;
  (document.getElementById("lastSync") as HTMLElement).textContent = `Synced ${new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
  const roomSlots = office.rooms.length <= 5 ? office.rooms.length + 1 : office.rooms.length;
  const floorHeight = mirrorOnly ? geometry.height : Math.max(560, 124 + Math.ceil(roomSlots / 3) * 218);
  const floorWidth = mirrorOnly ? STUDIO_WIDTH : 960;
  if (canvas.width !== floorWidth) { canvas.width = floorWidth; studioDirty = true; }
  if (canvas.height !== floorHeight) { canvas.height = floorHeight; studioDirty = true; }
  camera.updateSize();

  const activityNodes = [...runs].reverse().slice(0, 5).map((run) => {
    const item = element("li", "activity-item");
    item.dataset.state = run.state;
    const top = element("div", "activity-top");
    top.append(element("span", "activity-role", mirrorOnly ? roleFor(run) : run.role), element("span", "run-state", mirrorOnly ? activityOf(run).label : label(run.state)));
    item.append(top, element("p", "activity-prompt", short(run.prompt, 120) || run.id));
    if (mirrorOnly) {
      const inspect = element("button", "inspect-button", "Inspect agent");
      inspect.type = "button";
      inspect.dataset.focusKey = `history:${run.id}`;
      inspect.setAttribute("aria-pressed", String(focus?.id === run.id));
      inspect.onclick = () => selectAgent(run.id);
      item.append(inspect);
    }
    if (mirrorOnly && run.detail) item.append(element("p", "activity-detail", short(run.detail, 100)));
    return item;
  });
  if (activityNodes.length === 0) activityNodes.push(element("li", "empty", "No activity yet. Start a task in OpenCode."));
  runsUl.replaceChildren(...activityNodes);

  queueUl.replaceChildren(...queue.map((entry) => {
    const item = element("li", "queue-item");
    item.append(element("span", "queue-number", `#${entry.position}`), element("span", "", `${entry.role} → ${entry.deskId}`));
    return item;
  }));

  if (mirrorOnly) {
    crewUl.replaceChildren(...sessions.map((run) => {
      const workRole = roleFor(run);
      const card = element("li", "crew-card");
      card.dataset.state = run.state;
      card.dataset.selected = String(focus?.id === run.id);
      card.style.setProperty("--room-color", activityOf(run).color);
      const avatar = element("span", "crew-avatar");
      const portrait = document.createElement("canvas");
      portrait.width = 30; portrait.height = 35;
      const portraitCtx = portrait.getContext("2d");
      if (portraitCtx) drawSprite(portraitCtx, avatarFrame(run.sessionId ?? run.id, CHAR_FRAMES.idle), agentPalette(workRole, run.sessionId ?? run.id), 3, 3, 2);
      avatar.append(portrait);
      const copy = element("div", "crew-copy");
      copy.append(element("span", "crew-name", workRole), element("span", "crew-meta", short(`${run.role} · ${run.prompt}`, 36)),
        element("span", "crew-status", activityOf(run).label));
      const choose = element("button", "crew-select");
      choose.type = "button";
      choose.dataset.focusKey = `crew:${run.id}`;
      choose.setAttribute("aria-label", `Inspect ${workRole}: ${run.prompt}`);
      choose.setAttribute("aria-pressed", String(focus?.id === run.id));
      choose.onclick = () => selectAgent(run.id);
      choose.append(avatar, copy);
      card.append(choose);
      return card;
    }));
  } else crewUl.replaceChildren(...office.desks.map((desk) => {
    const runId = occupants[desk.id];
    const run = runId ? runById.get(runId) : undefined;
    const room = office.rooms.find((entry) => entry.id === desk.roomId);
    const card = element("li", "crew-card");
    card.dataset.state = run?.state ?? (runId ? "loading" : "free");
    card.style.setProperty("--room-color", ROOM_COLORS[room?.color ?? ""] ?? "#9faca0");
    const avatar = element("span", `crew-avatar${run ? "" : " empty-avatar"}`);
    if (run) {
      const portrait = document.createElement("canvas");
      portrait.width = 30;
      portrait.height = 35;
      const portraitCtx = portrait.getContext("2d");
      if (portraitCtx) drawSprite(portraitCtx, CHAR_FRAMES.idle, shirtPalette(run.role), 3, 3, 2);
      avatar.append(portrait);
    } else avatar.textContent = "▣";
    const copy = element("div", "crew-copy");
    copy.append(
      element("span", "crew-name", run?.role ?? desk.label),
      element("span", "crew-meta", `${room?.name ?? "Room"} · ${desk.label}`),
      element("span", "crew-status", run ? label(run.state) : runId ? "Loading run…" : "Empty desk"),
    );
    card.append(avatar, copy);
    return card;
  }));
  if (focusedKey) {
    const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-focus-key]"));
    const nextFocus = buttons.find((node) => node.dataset.focusKey === focusedKey)
      ?? buttons.find((node) => node.dataset.focusKey === focusedKey.replace(/^crew:/, "history:"));
    nextFocus?.focus({preventScroll:true});
  }
}

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(path, { cache: "no-store", signal: AbortSignal.timeout(3000) });
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return response.json() as Promise<T>;
}

async function snapshot(): Promise<void> {
  refreshPending = true;
  if (refreshing) return;
  refreshing = true;
  try {
    while (refreshPending) {
      refreshPending = false;
      try {
        const [officeData, runsData, queueData, budgetData, serverHealth] = await Promise.all([
          fetchJson<{ office: OfficeDoc; occupants: Record<string, string>; mirrorOnly?: boolean }>("/api/office"),
          fetchJson<{ runs: Run[] }>("/api/runs"),
          fetchJson<{ queue: QueueItem[] }>("/api/queue"),
          fetchJson<{ spentEstimated: number }>("/api/budgets"),
          fetchJson<typeof healthInfo>("/api/health"),
        ]);
        office = officeData.office;
        occupants = officeData.occupants;
        mirrorOnly = officeData.mirrorOnly === true;
        runs = runsData.runs;
        queue = queueData.queue;
        spentEstimated = Number.isFinite(budgetData.spentEstimated) ? budgetData.spentEstimated : 0;
        latestFetchOkay = true;
        healthAttempted = true; serverAvailable = true; healthInfo = serverHealth; lastSnapshotAt = Date.now();
        if (retryTimer !== undefined) { window.clearTimeout(retryTimer); retryTimer = undefined; }
        renderPanels();
        draw();
      } catch {
        latestFetchOkay = false;
        healthAttempted = true;
        try { healthInfo = await fetchJson<typeof healthInfo>("/api/health"); serverAvailable = true; }
        catch { serverAvailable = false; }
        (document.getElementById("lastSync") as HTMLElement).textContent = "Data has not refreshed";
        if (retryTimer === undefined) {
          retryTimer = window.setTimeout(() => { retryTimer = undefined; void snapshot(); }, 3000);
        }
      }
      renderConnection();
    }
  } finally {
    refreshing = false;
  }
}

function textOnCanvas(value: string, x: number, y: number, color = COLORS.night, size = 12): void {
  ctx.font = `bold ${size}px "Courier New", monospace`;
  ctx.fillStyle = color;
  ctx.fillText(value, snap(x), snap(y));
}

function plate(value: string, x: number, y: number, fill = COLORS.light, color = COLORS.night): void {
  ctx.font = 'bold 12px "Courier New", monospace';
  const width = Math.ceil(ctx.measureText(value).width) + 18;
  ctx.fillStyle = COLORS.night;
  ctx.fillRect(snap(x + 2), snap(y + 3), width, 22);
  ctx.fillStyle = fill;
  ctx.fillRect(snap(x), snap(y), width, 22);
  textOnCanvas(value, x + 9, y + 4, color);
}

function drawShell(): void {

  const floorBottom = canvas.height - 36;
  ctx.fillStyle = COLORS.night;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = COLORS.paper;
  ctx.fillRect(16, 16, 928, canvas.height - 32);
  ctx.fillStyle = INK;
  ctx.fillRect(23, 23, 914, canvas.height - 46);
  ctx.fillStyle = COLORS.wall;
  ctx.fillRect(30, 30, 900, 58);
  ctx.fillStyle = "#f7f5ed";
  ctx.fillRect(34, 34, 892, 48);
  // Three windows give the office a horizon without using borrowed artwork.
  for (const wx of [260, 450, 640]) {
    ctx.fillStyle = INK;
    ctx.fillRect(wx, 43, 67, 32);
    ctx.fillStyle = "#aac6ce";
    ctx.fillRect(wx + 4, 47, 59, 24);
    ctx.fillStyle = "#dce8e4";
    ctx.fillRect(wx + 34, 47, 3, 24);
    ctx.fillRect(wx + 4, 58, 59, 3);
  }
  plate(mirrorOnly ? "OFFICECODE / OPEN OFFICE" : "OFFICECODE / HQ", 42, 47, "#e9dfcd");
  textOnCanvas(mirrorOnly ? "ONE OFFICE" : "LIVE FLOOR", 806, 51, "#726963", 11);
  ctx.fillStyle = COLORS.floor;
  ctx.fillRect(34, 88, 892, floorBottom - 88);
  ctx.fillStyle = COLORS.floorLine;
  for (let x = 42; x < 928; x += 36) ctx.fillRect(x, 88, 2, floorBottom - 88);
  for (let y = 94; y < floorBottom; y += 36) ctx.fillRect(34, y, 892, 2);
  for (let y = 111; y < floorBottom; y += 36) {
    for (let x = 60; x < 920; x += 36) ctx.fillRect(x, y, 5, 5);
  }
  ctx.fillStyle = INK;
  ctx.fillRect(30, floorBottom, 900, 7);
}

function drawHallways(rects: Map<string, Rect>): void {
  for (const hallway of office.hallways) {
    const from = rects.get(hallway.fromRoomId);
    const to = rects.get(hallway.toRoomId);
    if (!from || !to) continue;
    const horizontal = Math.abs(from.y - to.y) < 8;
    const fromFirst = horizontal ? from.x < to.x : from.y < to.y;
    const x1 = horizontal ? (fromFirst ? from.x + from.w : from.x) : from.x + from.w / 2;
    const y1 = horizontal ? from.y + from.h / 2 : (fromFirst ? from.y + from.h : from.y);
    const x2 = horizontal ? (fromFirst ? to.x : to.x + to.w) : to.x + to.w / 2;
    const y2 = horizontal ? to.y + to.h / 2 : (fromFirst ? to.y : to.y + to.h);
    ctx.strokeStyle = hallway.open ? "#e9d297" : "#b96762";
    ctx.lineWidth = 5;
    ctx.setLineDash(hallway.open ? [10, 7] : [3, 5]);
    ctx.beginPath();
    ctx.moveTo(snap(x1), snap(y1));
    ctx.lineTo(snap(x2), snap(y2));
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

function drawRoom(room: Room, index: number, runById: Map<string, Run>, tick: number): void {
  const r = roomRect(index, canvas.width, office.rooms.length);
  ctx.fillStyle = ROOM_COLORS[room.color] ?? "#c9bca3";
  ctx.globalAlpha = .22;
  ctx.fillRect(snap(r.x + 4), snap(r.y + 4), snap(r.w - 8), snap(r.h - 8));
  ctx.globalAlpha = 1;
  ctx.fillStyle = INK;
  ctx.fillRect(snap(r.x), snap(r.y), snap(r.w), 4);
  ctx.fillRect(snap(r.x), snap(r.y), 4, snap(r.h));
  ctx.fillRect(snap(r.x + r.w - 4), snap(r.y), 4, snap(r.h));
  const doorLeft = snap(r.x + r.w / 2 - 22);
  ctx.fillRect(snap(r.x), snap(r.y + r.h - 4), doorLeft - snap(r.x), 4);
  ctx.fillRect(doorLeft + 44, snap(r.y + r.h - 4), snap(r.x + r.w - doorLeft - 44), 4);
  ctx.fillStyle = COLORS.paper;
  ctx.fillRect(snap(r.x + 4), snap(r.y + 4), snap(r.w - 8), 22);
  ctx.fillStyle = ROOM_COLORS[room.color] ?? "#c9bca3";
  ctx.fillRect(snap(r.x + 4), snap(r.y + 24), snap(r.w - 8), 3);
  textOnCanvas(short(room.name.toUpperCase(), 21), r.x + 11, r.y + 8, INK, 11);

  if (room.name.toLowerCase().includes("design")) {
    drawSprite(ctx, BOARD_MAP, BOARD_PALETTE, snap(r.x + r.w - 53), snap(r.y + 35), 1);
  }
  if (room.name.toLowerCase().includes("backend")) {
    drawSprite(ctx, RACK_MAP, RACK_PALETTE, snap(r.x + r.w - 21), snap(r.y + r.h - 37), 1);
  }
  drawSprite(ctx, PLANT_MAP, PLANT_PALETTE, snap(r.x + 9), snap(r.y + r.h - 22), 1);
  office.objects.filter((object) => object.roomId === room.id).forEach((object, objectIndex) => {
    const ox = snap(r.x + r.w - 38 - objectIndex * 23);
    const oy = snap(r.y + r.h - 25);
    if (object.kind === "printer") drawSprite(ctx, PRINTER_MAP, PRINTER_PALETTE, ox, oy, 1);
    else {
      ctx.fillStyle = "#8c6744";
      ctx.fillRect(ox, oy, 18, 13);
      ctx.fillStyle = COLORS.gold;
      ctx.fillRect(ox + 3, oy + 3, 12, 3);
    }
  });

  const roomDesks = office.desks.filter((desk) => desk.roomId === room.id);
  roomDesks.forEach((desk, deskIndex) => {
    const point = deskPoint(r, deskIndex, roomDesks.length);
    const runId = occupants[desk.id];
    const run = runId ? runById.get(runId) : undefined;
    drawSprite(ctx, CHAIR_MAP, CHAIR_PALETTE, snap(point.x - 8), snap(point.y + 19), 2);
    drawSprite(ctx, DESK_MAP, DESK_PALETTE, snap(point.x - 18), snap(point.y - 12), 2);
    drawSprite(ctx, COMPUTER_MAP, COMPUTER_PALETTE, snap(point.x - 14), snap(point.y - 24), 2);
    if (run?.state === "acting") {
      ctx.fillStyle = "#b3f2ea";
      ctx.fillRect(snap(point.x - 9), snap(point.y - 3), 18, 8);
    }
    textOnCanvas(short(desk.label, 12), point.x - 18, point.y - 30, COLORS.light, 10);
    if (!run) return;
    const characterX = snap(point.x - 12);
    const characterY = snap(point.y + 20);
    drawSprite(ctx, CHAR_FRAMES[frameForState(run.state, tick)], shirtPalette(run.role), characterX, characterY, 2);
    const roleColor = ROLE_PILL[run.role] ?? "#a0a4ad";
    ctx.fillStyle = roleColor;
    ctx.fillRect(characterX - 2, characterY + 28, 28, 4);
    const bubble = BUBBLE_TEXT[run.state]?.(run);
    if (bubble) {
      ctx.font = 'bold 10px "Courier New", monospace';
      const width = Math.ceil(ctx.measureText(bubble).width) + 12;
      const bubbleX = snap(Math.max(37, Math.min(characterX - 8, 924 - width)));
      const bubbleY = snap(characterY - 24);
      ctx.fillStyle = INK;
      ctx.fillRect(bubbleX + 2, bubbleY + 2, width, 17);
      ctx.fillStyle = COLORS.light;
      ctx.fillRect(bubbleX, bubbleY, width, 17);
      textOnCanvas(bubble, bubbleX + 6, bubbleY + 3, INK, 10);
    }
  });
}

function drawLounge(): void {
  const r = roomRect(5, canvas.width, 6);
  ctx.fillStyle = INK;
  ctx.fillRect(snap(r.x), snap(r.y), snap(r.w), 4);
  ctx.fillRect(snap(r.x), snap(r.y), 4, snap(r.h));
  ctx.fillRect(snap(r.x + r.w - 4), snap(r.y), 4, snap(r.h));
  plate("LOUNGE / OUTBOX", r.x + 9, r.y + 11, "#e9dfcd");
  ctx.fillStyle = "#b8a6ba";
  ctx.globalAlpha = .45;
  ctx.fillRect(snap(r.x + 25), snap(r.y + 58), snap(r.w - 50), 92);
  ctx.globalAlpha = 1;
  drawSprite(ctx, SOFA_MAP, SOFA_PALETTE, snap(r.x + 45), snap(r.y + 69), 2);
  drawSprite(ctx, TABLE_MAP, TABLE_PALETTE, snap(r.x + 109), snap(r.y + 109), 2);
  drawSprite(ctx, PLANT_MAP, PLANT_PALETTE, snap(r.x + r.w - 39), snap(r.y + 71), 2);
  const completed = runs.filter((run) => run.state === "done").length;
  textOnCanvas(`${completed} RESULTS READY`, r.x + 25, r.y + 166, COLORS.light, 11);
  for (let i = 0; i < Math.min(completed, 3); i++) {
    ctx.fillStyle = "#b7814f";
    ctx.fillRect(snap(r.x + r.w - 80 + i * 17), snap(r.y + 162), 14, 13);
    ctx.fillStyle = INK;
    ctx.fillRect(snap(r.x + r.w - 80 + i * 17), snap(r.y + 167), 14, 2);
  }
}

function stationFor(run: Run): OfficeStation {
  return stationForRun(run,visibleAgents());
}

function drawAgentBubble(run: Run, x: number, y: number, color: string, lane: number): void {
  const text = short(stationFor(run)==="waiting" ? activityOf(run).label : run.detail || activityOf(run).label, 31);
  ctx.font = 'bold 11px "Courier New", monospace';
  const width = Math.min(278, Math.ceil(ctx.measureText(text).width) + 18);
  const left = snap(Math.max(42, Math.min(x - 16, canvas.width - 42 - width)));
  const top = snap(Math.max(108, y - 27 - lane * 25));
  ctx.fillStyle = "#0c1025"; ctx.fillRect(left + 3, top + 4, width, 22);
  ctx.fillStyle = color; ctx.fillRect(left, top, width, 22);
  ctx.fillStyle = "#242747"; ctx.fillRect(left + 3, top + 3, width - 6, 16);
  const tail = Math.max(left + 8, Math.min(x + 4, left + width - 15));
  ctx.fillStyle = color; ctx.fillRect(tail, top + 22, 7, 5);
  textOnCanvas(text, left + 10, top + 5, "#fff1df", 11);
}

function drawStudioDoors(now: number): void {
  const elapsed = Math.max(0, Math.min(80, now - lastDoorTime));
  lastDoorTime = now;
  for (const door of STUDIO_DOORS) {
    const vertical = door.axis === "vertical";
    const open = [...agentPositions.values()].some((agent) => agent.route.length > 0
      && Math.hypot(agent.point.x - door.x - (vertical ? 0 : door.w / 2), agent.point.y - door.y - (vertical ? door.w / 2 : 0)) < 85);
    const previous = doorOpenness.get(door.id) ?? 0;
    const fraction = reducedMotion ? (open ? 1 : 0) : Math.max(0, Math.min(1, previous + (open ? 1 : -1) * elapsed / 160));
    doorOpenness.set(door.id, fraction);
    const leaf = snap(door.w / 2 - 4 - fraction * (door.w / 2 - 11));
    ctx.save();ctx.translate(door.x,door.y);if (vertical) ctx.rotate(Math.PI/2);
    ctx.fillStyle = "#161b35"; ctx.fillRect(0,-8,5,20); ctx.fillRect(door.w-5,-8,5,20);
    ctx.fillStyle = open ? "#91e5d4" : "#9294bf";
    ctx.fillRect(5,-5,leaf,10);ctx.fillRect(door.w-5-leaf,-5,leaf,10);
    ctx.fillStyle = "#c4b9d4"; ctx.fillRect(5,-6,leaf,2);ctx.fillRect(door.w-5-leaf,-6,leaf,2);
    ctx.fillStyle = "#f8be6a";ctx.fillRect(2,8,3,3);ctx.fillRect(door.w-5,8,3,3);
    ctx.restore();
  }
}

function drawWorkRoleBadge(role: string, x: number, y: number, scale: number, color: string, compact = false): void {
  const caption = short(role.toUpperCase(), compact ? 6 : 14);
  const fontSize = compact ? 8 : 10;
  ctx.font = `bold ${fontSize}px "Courier New", monospace`;
  const width = Math.ceil(ctx.measureText(caption).width) + 16;
  const left = snap(Math.max(42, Math.min(x + 6 * scale - width / 2, canvas.width - 42 - width)));
  const top = snap(Math.min(canvas.height - 34, y + 14 * scale + 2));
  ctx.fillStyle = "#13152d"; ctx.fillRect(left + 2, top + 2, width, 17);
  ctx.fillStyle = "#2b2b4d"; ctx.fillRect(left, top, width, 17);
  ctx.fillStyle = color; ctx.fillRect(left, top, 4, 17);
  textOnCanvas(caption, left + 9, top + 3, COLORS.light, fontSize);
}

function drawOccupiedChair(x: number, y: number, scale: number, front: boolean): void {
  const width = 12 * scale;
  ctx.fillStyle = front ? "#15172f" : "#654764";
  if (front) {
    ctx.fillRect(x - 5, y + 8 * scale, 5, 15);
    ctx.fillRect(x + width, y + 8 * scale, 5, 15);
    ctx.fillStyle = "#d6919a";
    ctx.fillRect(x - 4, y + 8 * scale + 2, 3, 10);
    ctx.fillRect(x + width + 1, y + 8 * scale + 2, 3, 10);
  } else {
    ctx.fillRect(x - 5, y + 7 * scale, width + 10, 7 * scale - 3);
    ctx.fillStyle = "#a76b8c";
    ctx.fillRect(x - 2, y + 7 * scale + 3, width + 4, 5 * scale - 2);
  }
}

function arrivalPoint(fallback: Point): Point {
  const candidates=[STUDIO_ENTRY,...[1048,1000,956].flatMap(y=>[444,480,516].map(x=>({x,y})))];
  return candidates.find(point=>!STUDIO_OBSTACLES.some(r=>point.x>r.x && point.x<r.x+r.w && point.y>r.y && point.y<r.y+r.h)
    && ![...agentPositions.values()].some(agent=>Math.hypot(agent.point.x-point.x,agent.point.y-point.y)<34)) ?? fallback;
}

function drawOfficeAgents(sessions: Run[], tick: number, now: number): void {
  const visibleIds = new Set(sessions.map((run) => run.sessionId ?? run.id));
  for (const id of agentPositions.keys()) if (!visibleIds.has(id)) agentPositions.delete(id);
  for (const id of waitingSchedules.keys()) if (!visibleIds.has(id)) waitingSchedules.delete(id);
  const planningCount = sessions.filter((run) => ["thinking", "delegating"].includes(stationFor(run))).length;
  if (planningCount > 1 && sessions.some((run) => stationFor(run) === "delegating")) {
    ctx.fillStyle = tick % 2 === 0 ? "#f8be6a" : "#cbb5f1";
    for (let dot = 0; dot < 3; dot++) ctx.fillRect(603 + dot * 12, 303 + (dot === tick % 3 ? -4 : 0), 5, 5);
  }
  for (const run of [...sessions].sort((a, b) => (agentPositions.get(a.sessionId ?? a.id)?.point.y ?? studioSeats.get(a.sessionId ?? a.id)?.point.y ?? 0)
    - (agentPositions.get(b.sessionId ?? b.id)?.point.y ?? studioSeats.get(b.sessionId ?? b.id)?.point.y ?? 0))) {
    const station = stationFor(run);
    const scale = 3;
    const id = run.sessionId ?? run.id;
    const seat = studioSeats.get(id);
    if (!seat) continue;
    const computer = seat.computer;
    const prior = agentPositions.get(id);
    const feet = seat.point;
    const entrance=prior?.point ?? arrivalPoint(feet);
    let agent = prior ?? { point: entrance, target: entrance, route: [], time: now, direction: "south" as Direction };
    let target=feet;
    if (station==="waiting" && !reducedMotion) {
      const schedule=prior?.station==="waiting" ? waitingSchedules.get(id) ?? {step:0} : {step:0};
      waitingSchedules.set(id,schedule);
      target=prior?.target ?? feet;
      if (!prior || prior.station!=="waiting") target=feet;
      const destination=waitingDestination(seat,schedule,now,agent.route.length===0 && Math.hypot(agent.point.x-target.x,agent.point.y-target.y)<2);
      if (destination) target=destination;
    } else waitingSchedules.delete(id);
    if (reducedMotion) agent = { ...agent, point: feet, target: feet, route: [] };
    else if (agent.target.x !== target.x || agent.target.y !== target.y) {
      agent = { ...agent, target, route: planRoute(agent.point, target, geometry.obstacles, canvas.height - 24) ?? [] };
    }
    if (agent.route.length) agent = { ...agent, ...advanceTimedRoute(agent.point, agent.route, now - agent.time) };
    agent={...agent,time:now,station};
    agentPositions.set(id, agent);
    const x = snap(agent.point.x - 6 * scale), y = snap(agent.point.y - 13 * scale);
    const moving=agent.route.length>0;
    const arrived = !moving && Math.hypot(agent.point.x - feet.x, agent.point.y - feet.y) < 2;
    const seated = arrived && seat.seated;
    const activity = activityOf(run);
    const workRole = displayWorkRole(run, sessions.length === 1);
    const palette = agentPalette(workRole, id);
    if (run.id === selectedRunId) {
      ctx.strokeStyle = theme.ui.sage; ctx.lineWidth = 2;
      ctx.strokeRect(x - 5, y - 3, 46, 48);
    }
    if (computer && arrived) {
      ctx.fillStyle = tick % 2 === 0 ? "#b5fff0" : "#67dccb";
      ctx.fillRect(computer[0] + 18, computer[1] - 8, 13, 2);
      ctx.fillRect(computer[0] + 18, computer[1] - 3, 9, 2);
    }
    if (station === "approval") {
      ctx.fillStyle = tick % 2 === 0 ? "#ffd594" : "#ff827d"; ctx.fillRect(x+36,y-8,7,7);
    }
    ctx.fillStyle = activity.color;
    ctx.fillRect(x - 5, y + 14 * scale - 4, 12 * scale + 10, 4);
    if (seated && station!=="waiting") drawOccupiedChair(x, y, scale, false);
    const frame = moving ? WALK_FRAMES[agent.direction][Math.floor(now / 90) % 8]
      : CHAR_FRAMES[station === "thinking" || station === "delegating" ? (tick % 2 === 0 ? "talkA" : "talkB")
        : station==="waiting" ? (seated?"talkA":"idle") : seated ? (tick % 2 === 0 ? "typeA" : "typeB") : frameForState(run.state, tick)];
    drawSprite(ctx, avatarFrame(id, frame, moving ? agent.direction : seated && computer ? "north" : "south"), palette, x, y, scale);
    if (seated && station!=="waiting") drawOccupiedChair(x, y, scale, true);
    if ((station === "reading" || station==="review" && ["reading","code-search"].includes(currentWorkActivity(run))) && arrived) {
      ctx.fillStyle = "#fff1df"; ctx.fillRect(x + 8, y + 27, 22, 14);
      ctx.fillStyle = "#8ea8f1"; ctx.fillRect(x + 18, y + 29, 2, 10);
      ctx.fillStyle = "#776f9d"; ctx.fillRect(x + 11, y + 32 + tick % 2 * 3, 6, 2);
    }
    if (run.state === "thinking" && planningCount === 1 && arrived) {
      ctx.fillStyle = "#fff7dd";
      for (let dot = 0; dot < 3; dot++) ctx.fillRect(x + 36 + dot * 7, y - 10 - (tick + dot) % 2 * 3, 4, 4);
    }
    if (sessions.length <= 4) drawAgentBubble(run, x, y, activity.color, 0);
    else {
      const mark = ({ thinking: "…", delegating: "↔", reading: "R", editing: "E", "web-search": "W", terminal: ">_", approval: "!", lounge: "·", arrival: "→", review: "QA", waiting: "…" })[station];
      ctx.fillStyle = "#242747"; ctx.fillRect(x + 30, y + 5, 21, 16);
      textOnCanvas(mark, x + 33, y + 7, activity.color, 10);
    }
    drawWorkRoleBadge(workRole, x, y, scale, palette.C, sessions.length > 4);
  }
}

function occupiedStudioHeight(): number {
  const points = [...agentPositions.entries()].filter(([id]) => studioSeats.has(id)).map(([, agent]) => agent.point.y);
  const bottom = Math.max(0, ...points);
  return bottom < STUDIO_BASE_HEIGHT ? STUDIO_BASE_HEIGHT : STUDIO_BASE_HEIGHT + Math.ceil((bottom + 30 - STUDIO_BASE_HEIGHT) / 136) * 136;
}

function drawSessionFloor(tick: number, now: number): void {
  const sessions = visibleAgents();
  const desiredHeight = Math.max(studioHeight(studioSeats), occupiedStudioHeight());
  if (desiredHeight !== geometry.height) {
    geometry = studioGeometry(studioSeats, desiredHeight);
    canvas.height = desiredHeight;
    camera.updateSize();
    studioDirty = true;
  }
  if (studioDirty || !backgroundCtx || studioBackground.width !== canvas.width || studioBackground.height !== canvas.height) {
    drawExpandedOffice(ctx, theme, studioPeriod, canvas.height, geometry.extraDesks);
    studioBackground.width = canvas.width; studioBackground.height = canvas.height;
    backgroundCtx?.drawImage(canvas, 0, 0);
    studioDirty = false;
  }
  if (backgroundCtx) ctx.drawImage(studioBackground, 0, 0);
  if (sessions.length === 0) {
    agentPositions.clear();
    waitingSchedules.clear();
    doorOpenness.clear();
    drawStudioDoors(now);
    plate("STUDIO STANDBY", 1080, 974, "#f8be6a");
    textOnCanvas("Start a task in OpenCode.", 1080, 1010, theme.ui.ink, 12);
    return;
  }
  drawStudioDoors(now);
  drawOfficeAgents(sessions, tick, now);
  if (showRelations) {
    ctx.save(); ctx.strokeStyle = theme.ui.sage; ctx.globalAlpha = .55; ctx.setLineDash([4, 5]);
    for (const child of sessions) {
      const parent = sessions.find((run) => run.sessionId === child.parentSessionId);
      if (!parent || (selectedRunId && child.id !== selectedRunId && parent.id !== selectedRunId)) continue;
      const a = agentPositions.get(parent.sessionId ?? parent.id)?.point;
      const b = agentPositions.get(child.sessionId ?? child.id)?.point;
      if (a && b) { ctx.beginPath(); ctx.moveTo(a.x, a.y + 4); ctx.lineTo(b.x, b.y + 4); ctx.stroke(); }
    }
    ctx.restore();
  }
  const primary = sessions[0];
  ctx.fillStyle = "#1b1d3b"; ctx.fillRect(42, canvas.height - 27, canvas.width - 84, 16);
  ctx.fillStyle = activityOf(primary).color; ctx.fillRect(42, canvas.height - 27, 5, 16);
  textOnCanvas(short(primary.prompt || "OpenCode session", 47), 54, canvas.height - 25, COLORS.light, 11);
  const activeCount = sessions.filter((run) => run.state !== "done" && run.state !== "blocked").length;
  textOnCanvas(`${activeCount} ACTIVE ${activeCount === 1 ? "AGENT" : "AGENTS"}`, canvas.width - 200, canvas.height - 25, COLORS.light, 11);
}

function draw(now = performance.now()): void {
  if (document.visibilityState!=="visible") return;
  const tick = reducedMotion ? 0 : Math.floor(now / 240);
  ctx.imageSmoothingEnabled = false;
  ctx.textBaseline = "top";
  if (mirrorOnly) { drawSessionFloor(tick, now); scheduleAnimation(); return; }
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawShell();
  if (office.rooms.length === 0) {
    plate("WAITING FOR OFFICE LAYOUT", 340, 266);
    return;
  }
  const rects = new Map(office.rooms.map((room, index) => [room.id, roomRect(index, canvas.width, office.rooms.length)]));
  drawHallways(rects);
  const runById = new Map(runs.map((run) => [run.id, run]));
  office.rooms.forEach((room, index) => drawRoom(room, index, runById, tick));
  if (office.rooms.length <= 5) drawLounge();
  scheduleAnimation();
}

function scheduleAnimation(): void {
  if (reducedMotion || animationFrame !== undefined || document.visibilityState !== "visible") return;
  if (mirrorOnly && (!streamReady || !latestFetchOkay || (healthInfo.leaseManaged && !healthInfo.activeLeases))) return;
  const active = mirrorOnly ? visibleAgents().length > 0 : runs.some((run) => run.state === "walking" || run.state === "delivering");
  if (!active) return;
  animationFrame = window.requestAnimationFrame((now) => {
    animationFrame = undefined;
    const moving = [...agentPositions.values()].some((agent) => agent.route.length > 0)
      || [...doorOpenness.values()].some((fraction) => fraction > 0 && fraction < 1);
    if (now - lastPaint >= (moving ? 15 : 80)) {
      lastPaint = now;
      draw(now);
    }
    scheduleAnimation();
  });
}

function connect(): void {
  const source = new EventSource("/api/events");
  source.onopen = () => { streamReady = true; renderConnection(); void snapshot(); };
  source.addEventListener("snapshot", () => { void snapshot(); });
  source.addEventListener("office", () => { void snapshot(); });
  source.onerror = () => { streamReady = false; renderConnection(); void snapshot(); };
}

updateStudioClock();
window.setInterval(() => {
  if (document.visibilityState === "visible" && updateStudioClock()) draw();
}, 15_000);
window.setInterval(() => {
  if (document.visibilityState === "visible") { renderConnection(); void snapshot(); }
}, 10_000);
draw();
void snapshot();
connect();
document.addEventListener("visibilitychange", () => {
  if (animationFrame !== undefined) window.cancelAnimationFrame(animationFrame);
  animationFrame = undefined;
  const now = performance.now();
  if (document.visibilityState!=="visible") hiddenAt ??= now;
  else if (hiddenAt!==undefined) {
    const paused=Math.max(0,now-hiddenAt);
    for (const schedule of waitingSchedules.values()) if (schedule.pauseUntil!==undefined) schedule.pauseUntil+=paused;
    hiddenAt=undefined;
  }
  for (const agent of agentPositions.values()) agent.time = now;
  lastDoorTime = now;
  if (document.visibilityState === "visible") { updateStudioClock(); draw(now); void snapshot(); }
});
