import { deskPoint, roomRect, type Rect } from "./layout";
import { displayWorkRole } from "./work-role";
import { selectVisibleAgents } from "./live-agents";
import { allocateStudioSeats, studioGeometry, studioHeight, type OfficeStation, type StudioSeat } from "./studio-seating";
import { getStudioPeriod, recolorStudioPixels, studioMaterial, STUDIO_THEMES } from "./studio-theme";
import { advanceTimedRoute, planRoute, type Direction, type Point } from "./agent-motion";
import { STUDIO_DOORS, STUDIO_WALLS, WORK_DESKS } from "./studio-map";
import {
  BOARD_MAP, BOARD_PALETTE, CHAIR_MAP, CHAIR_PALETTE, CHAR_FRAMES,
  COMPUTER_MAP, COMPUTER_PALETTE, DESK_MAP, DESK_PALETTE, INK, PLANT_MAP, PLANT_PALETTE,
  PRINTER_MAP, PRINTER_PALETTE, RACK_MAP, RACK_PALETTE,
  SOFA_MAP, SOFA_PALETTE, TABLE_MAP, TABLE_PALETTE, WALK_FRAMES,
  agentPalette, drawSprite, frameForState, shirtPalette, snap,
} from "./sprites";

interface Desk { id: string; roomId: string; label: string }
interface Room { id: string; name: string; color: string }
interface Hallway { fromRoomId: string; toRoomId: string; open: boolean }
interface PlacedObject { id: string; roomId: string; kind: string }
interface OfficeDoc { building: string; rooms: Room[]; desks: Desk[]; hallways: Hallway[]; objects: PlacedObject[] }
interface Run { id: string; deskId: string; role: string; state: string; prompt: string; sessionId?: string; activity?: string; detail?: string }
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
let refreshPending = false;
let refreshing = false;
let retryTimer: number | undefined;
const agentPositions = new Map<string, { point: Point; target: Point; route: Point[]; time: number; direction: Direction }>();
const studioBackground = document.createElement("canvas");
const backgroundCtx = studioBackground.getContext("2d");
let studioDirty = true;
let animationFrame: number | undefined;
let lastPaint = 0;
let lastDoorTime = 0;
const doorOpenness = new Map<string, number>();
let studioSeats = new Map<string, StudioSeat>();
let geometry = studioGeometry(studioSeats);
let studioPeriod = getStudioPeriod(new Date());
let theme = STUDIO_THEMES[studioPeriod];

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
  return ACTIVITY[run.activity ?? ""] ?? ACTIVITY[run.state] ?? ACTIVITY.working;
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, content?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (content !== undefined) node.textContent = content;
  return node;
}

function renderConnection(): void {
  const online = streamReady && latestFetchOkay;
  connection.dataset.state = online ? "online" : "offline";
  connection.textContent = online ? "Live · synced" : "Reconnecting…";
}

function renderPanels(): void {
  const runById = new Map(runs.map((run) => [run.id, run]));
  const sessions = mirrorOnly ? visibleAgents() : [];
  studioSeats = allocateStudioSeats(sessions.map((run) => ({ id: run.sessionId ?? run.id, station: stationFor(run) })), studioSeats);
  const nextGeometry = studioGeometry(studioSeats, occupiedStudioHeight());
  if (geometry.height !== nextGeometry.height) studioDirty = true;
  geometry = nextGeometry;
  const focus = sessions[0];
  const roleFor = (run: Run): string => displayWorkRole(run, sessions.length === 1 && focus?.id === run.id);
  (document.getElementById("focusSection") as HTMLElement).hidden = !mirrorOnly;
  (document.getElementById("activityTracker") as HTMLElement).hidden = !mirrorOnly;
  if (mirrorOnly) {
    (document.getElementById("focusStation") as HTMLElement).textContent = focus ? activityOf(focus).station : "Standby";
    (document.getElementById("focusRole") as HTMLElement).textContent = focus ? `Agent ${roleFor(focus)} · ${activityOf(focus).persona}` : "OpenCode agent";
    (document.getElementById("focusTask") as HTMLElement).textContent = focus?.prompt || "Waiting for a session";
    (document.getElementById("focusActivity") as HTMLElement).textContent = focus ? activityOf(focus).label : "No activity yet";
    (document.getElementById("focusDetail") as HTMLElement).textContent = focus?.detail || "Start working on a feature in OpenCode.";
    const activeModes = new Set(sessions.map((run) => {
      if (run.activity === "code-search") return "reading";
      if (run.activity === "working") return "editing";
      if (run.activity === "delegating") return "thinking";
      if (run.activity === "approval") return "approval";
      return run.activity;
    }));
    document.querySelectorAll<HTMLElement>(".activity-chip").forEach((chip) => {
      chip.dataset.active = activeModes.has(chip.dataset.activity) ? "true" : "false";
    });
  }
  statActive.textContent = String(mirrorOnly ? sessions.filter((run) => run.state !== "done" && run.state !== "blocked").length : Object.keys(occupants).length);
  statQueue.textContent = String(queue.length);
  statSpent.textContent = `$${spentEstimated < 1 ? spentEstimated.toFixed(4) : spentEstimated.toFixed(2)}`;
  (document.getElementById("floorMeta") as HTMLElement).textContent = mirrorOnly ? `1 studio · ${sessions.length} ${sessions.length === 1 ? "agent" : "agents"}` : `${office.rooms.length} rooms · ${office.desks.length} desks`;
  (document.getElementById("crewCount") as HTMLElement).textContent = mirrorOnly ? `${sessions.length} ${sessions.length === 1 ? "agent" : "agents"} visible` : `${office.desks.length} slots available`;
  (document.getElementById("activityCount") as HTMLElement).textContent = `${runs.length} ${runs.length === 1 ? "run" : "runs"}`;
  (document.getElementById("queueCount") as HTMLElement).textContent = `${queue.length} ${queue.length === 1 ? "task" : "tasks"}`;
  (document.getElementById("queueEmpty") as HTMLElement).hidden = queue.length > 0;
  (document.getElementById("lastSync") as HTMLElement).textContent = `Synced ${new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
  const roomSlots = office.rooms.length <= 5 ? office.rooms.length + 1 : office.rooms.length;
  const floorHeight = mirrorOnly ? geometry.height : Math.max(560, 124 + Math.ceil(roomSlots / 3) * 218);
  if (canvas.height !== floorHeight) canvas.height = floorHeight;

  const activityNodes = [...runs].reverse().slice(0, 5).map((run) => {
    const item = element("li", "activity-item");
    item.dataset.state = run.state;
    const top = element("div", "activity-top");
    top.append(element("span", "activity-role", mirrorOnly ? roleFor(run) : run.role), element("span", "run-state", mirrorOnly ? activityOf(run).label : label(run.state)));
    item.append(top, element("p", "activity-prompt", short(run.prompt, 120) || run.id));
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
      card.style.setProperty("--room-color", activityOf(run).color);
      const avatar = element("span", "crew-avatar");
      const portrait = document.createElement("canvas");
      portrait.width = 30; portrait.height = 35;
      const portraitCtx = portrait.getContext("2d");
      if (portraitCtx) drawSprite(portraitCtx, CHAR_FRAMES.idle, agentPalette(workRole, run.sessionId ?? run.id), 3, 3, 2);
      avatar.append(portrait);
      const copy = element("div", "crew-copy");
      copy.append(element("span", "crew-name", workRole), element("span", "crew-meta", short(`${run.role} · ${run.prompt}`, 36)),
        element("span", "crew-status", activityOf(run).label));
      card.append(avatar, copy);
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
}

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(path, { cache: "no-store" });
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
        const [officeData, runsData, queueData, budgetData] = await Promise.all([
          fetchJson<{ office: OfficeDoc; occupants: Record<string, string>; mirrorOnly?: boolean }>("/api/office"),
          fetchJson<{ runs: Run[] }>("/api/runs"),
          fetchJson<{ queue: QueueItem[] }>("/api/queue"),
          fetchJson<{ spentEstimated: number }>("/api/budgets"),
        ]);
        office = officeData.office;
        occupants = officeData.occupants;
        mirrorOnly = officeData.mirrorOnly === true;
        runs = runsData.runs;
        queue = queueData.queue;
        spentEstimated = Number.isFinite(budgetData.spentEstimated) ? budgetData.spentEstimated : 0;
        latestFetchOkay = true;
        if (retryTimer !== undefined) { window.clearTimeout(retryTimer); retryTimer = undefined; }
        renderPanels();
        draw();
      } catch {
        latestFetchOkay = false;
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

function drawStudioShell(): void {
  ctx.fillStyle = "#0b0e20";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#a96989";
  ctx.fillRect(14, 14, 932, 532);
  ctx.fillStyle = "#2a2749";
  ctx.fillRect(20, 20, 920, 520);
  ctx.fillStyle = "#514168";
  ctx.fillRect(31, 31, 898, 76);
  // Narrow wall panels and rivets keep the large header from looking flat.
  for (let x = 39; x < 924; x += 27) {
    ctx.fillStyle = "#615073"; ctx.fillRect(x, 34, 2, 65);
    ctx.fillStyle = "#8d6a8b"; ctx.fillRect(x + 5, 38, 3, 3);
    ctx.fillStyle = "#3d345b"; ctx.fillRect(x + 5, 94, 4, 2);
  }
  ctx.fillStyle = "#231f3f";
  ctx.fillRect(34, 104, 892, 421);
  // The skyline follows local time; geometry stays identical in every theme.
  for (const wx of [323, 490, 657]) {
    ctx.fillStyle = INK;
    ctx.fillRect(wx, 39, 139, 58);
    ctx.fillStyle = theme.sky[0]; ctx.fillRect(wx + 5, 44, 129, 14);
    ctx.fillStyle = theme.sky[1]; ctx.fillRect(wx + 5, 58, 129, 12);
    ctx.fillStyle = theme.sky[2]; ctx.fillRect(wx + 5, 70, 129, 20);
    if (studioPeriod === "night") {
      ctx.fillStyle = "#f1e5cf"; ctx.fillRect(wx + 109, 47, 12, 12);
      ctx.fillStyle = theme.sky[0]; ctx.fillRect(wx + 113, 45, 10, 11);
    } else {
      const sunY = studioPeriod === "day" ? 47 : 61;
      ctx.fillStyle = studioPeriod === "day" ? "#fff7d6" : "#ffe2a4";
      ctx.fillRect(wx + 101, sunY, 15, 15); ctx.fillRect(wx + 98, sunY + 3, 21, 9);
      ctx.fillStyle = "#eef8ed";
      ctx.fillRect(wx + 18, 52, 26, 4); ctx.fillRect(wx + 25, 49, 14, 4);
    }
    for (let i = 0; studioPeriod === "night" && i < 14; i++) {
      const px = wx + 9 + (i * 37) % 118;
      const py = 48 + (i * 17) % 34;
      ctx.fillStyle = i % 3 === 0 ? "#e2dbff" : "#b6c8ea";
      ctx.fillRect(px, py, i % 4 === 0 ? 5 : 2, 2);
    }
    ctx.fillStyle = theme.skyline;
    for (let i = 0; i < 7; i++) {
      const height = 8 + ((i * 13 + wx) % 18);
      ctx.fillRect(wx + 6 + i * 19, 90 - height, 16, height);
      ctx.fillStyle = studioPeriod === "night" || studioPeriod === "evening" ? "#ffd28b" : "#cde0df";
      ctx.fillRect(wx + 11 + i * 19, 86 - height / 2, 3, 3);
      ctx.fillStyle = theme.skyline;
    }
    ctx.fillStyle = "#d7b4b5";
    ctx.fillRect(wx + 70, 43, 4, 49);
    ctx.fillRect(wx + 5, 65, 129, 3);
    ctx.fillStyle = "#261f3b"; ctx.fillRect(wx - 3, 97, 145, 5);
    ctx.fillStyle = "#bd839e"; ctx.fillRect(wx + 6, 97, 127, 2);
  }
  plate(`OFFICECODE / ${theme.label.toUpperCase()} STUDIO`, 48, 52, "#f8be6a");
  textOnCanvas("LIVE / 01", 842, 52, theme.ui.ink, 11);
  ctx.fillStyle = "#15172f"; ctx.fillRect(31, 101, 898, 6);
  ctx.fillStyle = "#f8be6a"; ctx.fillRect(31, 101, 898, 2);
  ctx.fillStyle = "#30345d"; ctx.fillRect(34, 107, 892, 415);
  drawStudioFloorTexture();
  ctx.fillStyle = "#191b38"; ctx.fillRect(30, 523, 900, 7);
  ctx.fillStyle = "#f18f89"; ctx.fillRect(30, 523, 900, 2);
}

function drawStudioFloorTexture(): void {
  const left = 34, top = 107, right = 926, bottom = 522;
  for (let row = 0, y = top; y < bottom; row++, y += 30) {
    const offset = row % 2 === 0 ? 0 : 16;
    for (let col = -1, x = left - offset; x < right; col++, x += 32) {
      const tileLeft = Math.max(left, x);
      const tileRight = Math.min(right, x + 31);
      if (tileRight <= tileLeft) continue;
      ctx.fillStyle = (row + col) % 3 === 0 ? "#393d69" : "#353961";
      ctx.fillRect(tileLeft, y + 1, tileRight - tileLeft, Math.min(28, bottom - y - 1));
      const mark = (row * 19 + col * 11 + 89) >>> 0;
      ctx.fillStyle = "#4d5078";
      const glintX = Math.max(tileLeft + 2, x + 6);
      if (glintX + 5 <= tileRight) ctx.fillRect(glintX, y + 5, 5, 2);
      if (mark % 4 === 0) {
        ctx.fillStyle = "#54557a";
        const fleckX = Math.max(tileLeft + 2, x + 19);
        if (fleckX + 3 <= tileRight) ctx.fillRect(fleckX, y + 18, 3, 3);
      }
      if (mark % 7 === 0) {
        ctx.fillStyle = "#292e55";
        const scuffX = Math.max(tileLeft + 2, x + 11);
        if (scuffX + 8 <= tileRight) ctx.fillRect(scuffX, y + 23, 8, 2);
      }
    }
  }
}

function drawShell(): void {
  if (mirrorOnly) { drawStudioShell(); return; }
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
  if (run.state === "done") return "lounge";
  if (run.state === "blocked") return "approval";
  if (run.activity === "reading" || run.activity === "code-search") return "reading";
  if (run.activity === "web-search") return "web-search";
  if (run.activity === "terminal") return "terminal";
  if (run.activity === "delegating") return "delegating";
  if (run.activity === "editing" || run.activity === "working") return "editing";
  if (run.activity === "approval" || run.state === "waiting-approval") return "approval";
  return "thinking";
}

function officeDesk(x: number, y: number, active = false, tick = 0): void {
  ctx.fillStyle = "#202341"; ctx.fillRect(x + 6, y + 7, 54, 38);
  drawSprite(ctx, CHAIR_MAP, CHAIR_PALETTE, x + 15, y + 39, 3);
  drawSprite(ctx, DESK_MAP, DESK_PALETTE, x, y, 3);
  drawSprite(ctx, COMPUTER_MAP, COMPUTER_PALETTE, x + 6, y - 18, 3);
  ctx.fillStyle = "#e8a08e";
  ctx.fillRect(x + 6, y + 6, 8, 2); ctx.fillRect(x + 42, y + 8, 5, 2);
  ctx.fillStyle = "#a45b70";
  ctx.fillRect(x + 8, y + 27, 12, 2); ctx.fillRect(x + 37, y + 30, 8, 2);
  if (active) {
    ctx.fillStyle = tick % 2 === 0 ? "#b5fff0" : "#67dccb";
    ctx.fillRect(x + 18, y - 8, 13, 2);
    ctx.fillRect(x + 18, y - 3, 9, 2);
  }
}

function drawRug(x: number, y: number, w: number, h: number, edge: string, fill: string): void {
  // Resolve colors before translucent weave marks are composited; otherwise
  // those blended pixels retain the old night hue in the daylight themes.
  edge = studioMaterial(edge, studioPeriod);
  fill = studioMaterial(fill, studioPeriod);
  ctx.fillStyle = "#1b1c38"; ctx.fillRect(x + 6, y + 8, w, h);
  ctx.fillStyle = edge; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = fill; ctx.fillRect(x + 6, y + 6, w - 12, h - 12);
  // Staggered tile seams and sparse weave marks give the rugs a fabric surface.
  ctx.save();
  ctx.beginPath(); ctx.rect(x + 8, y + 8, w - 16, h - 16); ctx.clip();
  ctx.globalAlpha = .25;
  ctx.fillStyle = edge;
  for (let row = 0, py = y + 10; py < y + h - 8; row++, py += 29) {
    ctx.fillRect(x + 8, py, w - 16, 2);
    for (let px = x + 8 + (row % 2) * 15; px < x + w - 8; px += 30) {
      ctx.fillRect(px, py, 2, 29);
    }
  }
  ctx.globalAlpha = .16;
  ctx.fillStyle = "#fff0d6";
  for (let row = 0, py = y + 18; py < y + h - 10; row++, py += 29) {
    for (let px = x + 16 + (row % 2) * 15; px < x + w - 10; px += 30) {
      ctx.fillRect(px, py, 5, 2);
      ctx.fillRect(px + 9, py + 8, 2, 3);
    }
  }
  ctx.restore();
  ctx.fillStyle = "#f0c5b8";
  ctx.globalAlpha = .48;
  for (let px = x + 9; px < x + w - 8; px += 16) {
    ctx.fillRect(px, y + 3, 5, 2);
    ctx.fillRect(px, y + h - 5, 5, 2);
  }
  for (let py = y + 10; py < y + h - 8; py += 16) {
    ctx.fillRect(x + 3, py, 2, 5);
    ctx.fillRect(x + w - 5, py, 2, 5);
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = edge;
  for (const corner of [[x + 12, y + 12], [x + w - 24, y + 12], [x + 12, y + h - 24], [x + w - 24, y + h - 24]]) {
    ctx.fillRect(corner[0], corner[1], 12, 3);
    ctx.fillRect(corner[0], corner[1], 3, 12);
  }
}

function drawLamp(x: number, y: number, tick: number): void {
  ctx.fillStyle = "#c48c9b"; ctx.fillRect(x + 11, y, 4, 11);
  ctx.fillStyle = INK; ctx.fillRect(x + 2, y + 10, 22, 6);
  ctx.fillStyle = "#f8be6a"; ctx.fillRect(x + 6, y + 16, 14, 5);
}

function drawOfficeFurniture(tick: number, active: Set<OfficeStation>, editingCount: number): void {
  // Color-blocked rugs organize one uninterrupted studio floor.
  drawRug(49, 124, 225, 159, "#a05f8f", "#493455");
  drawRug(291, 124, 295, 159, "#9c86ce", "#45406b");
  drawRug(606, 124, 308, 159, "#59bdb7", "#294a62");
  drawRug(49, 300, 542, 212, "#6869a4", "#343660");
  drawRug(611, 300, 303, 212, "#dd917c", "#493c60");
  plate("IDEA POD", 59, 131, "#f2a1aa");
  plate("DIGITAL LIBRARY", 618, 131, "#86e5d4");
  plate("WORKSTATIONS", 59, 307, "#aca9e0");
  plate("OPS / COFFEE", 623, 307, "#f8bd91");

  // Wall art, corkboard, and a lounge seat make the idea area recognizable.
  ctx.fillStyle = INK; ctx.fillRect(68, 166, 45, 34);
  ctx.fillStyle = "#e996a0"; ctx.fillRect(72, 170, 37, 26);
  ctx.fillStyle = "#ffc884"; ctx.fillRect(77, 181, 12, 8);
  ctx.fillStyle = "#513e65"; ctx.fillRect(84, 176, 19, 4);
  drawSprite(ctx, BOARD_MAP, BOARD_PALETTE, 171, 163, 3);
  drawSprite(ctx, SOFA_MAP, SOFA_PALETTE, 75, 220, 3);
  ctx.fillStyle = "#f8be6a"; ctx.fillRect(177, 228, 34, 19);
  ctx.fillStyle = "#54405d"; ctx.fillRect(183, 234, 22, 6);
  drawSprite(ctx, PLANT_MAP, PLANT_PALETTE, 242, 239, 2);

  // A collaborative planning table with documents and hanging lamps.
  drawLamp(356, 118, tick); drawLamp(506, 118, tick);
  ctx.fillStyle = INK; ctx.fillRect(322, 175, 235, 64);
  ctx.fillStyle = "#9d5579"; ctx.fillRect(327, 180, 225, 54);
  ctx.fillStyle = "#e58e86"; ctx.fillRect(333, 186, 213, 42);
  for (const x of [339, 392, 445, 498]) {
    ctx.fillStyle = "#291e40"; ctx.fillRect(x, 158, 33, 16); ctx.fillRect(x, 240, 33, 16);
    ctx.fillStyle = "#c17e95"; ctx.fillRect(x + 4, 160, 25, 11); ctx.fillRect(x + 4, 243, 25, 10);
  }
  ctx.fillStyle = "#fae5d3"; ctx.fillRect(357, 194, 30, 20);
  ctx.fillStyle = "#77daca"; ctx.fillRect(361, 198, 22, 3); ctx.fillRect(361, 204, 16, 3);
  ctx.fillStyle = "#f8be6a"; ctx.fillRect(480, 196, 23, 17);
  ctx.fillStyle = "#fbe8d0"; ctx.fillRect(486, 198, 11, 8);
  drawSprite(ctx, PLANT_MAP, PLANT_PALETTE, 561, 244, 2);

  // Books, a wall globe, and a search monitor occupy the research rug.
  for (const y of [164, 190, 216]) {
    ctx.fillStyle = INK; ctx.fillRect(625, y, 89, 22);
    ctx.fillStyle = "#655173"; ctx.fillRect(630, y + 4, 79, 14);
    for (let i = 0; i < 9; i++) {
      ctx.fillStyle = ["#ff9c83", "#f8be6a", "#89dcd1", "#bda4e9", "#eaa1c4"][i % 5];
      ctx.fillRect(636 + i * 8, y + 5, 5, 12);
    }
  }
  ctx.fillStyle = "#f8be6a"; ctx.fillRect(736, 166, 30, 30);
  ctx.fillStyle = "#294a62"; ctx.fillRect(741, 171, 20, 20);
  ctx.fillStyle = "#86e5d4"; ctx.fillRect(749, 172, 3, 18); ctx.fillRect(742, 179, 18, 3);
  officeDesk(809, 179, active.has("web-search"), tick);
  ctx.fillStyle = active.has("web-search") && tick % 2 === 0 ? "#c3fff0" : "#67dccb";
  ctx.fillRect(826, 191, 22, 9);
  drawSprite(ctx, PLANT_MAP, PLANT_PALETTE, 888, 246, 2);

  // Staggered workstations, a blueprint board, stationery and cables.
  for (const [index, [x, y]] of WORK_DESKS.entries()) {
    officeDesk(x, y, index < editingCount, tick);
  }
  drawSprite(ctx, BOARD_MAP, BOARD_PALETTE, 493, 330, 3);
  ctx.fillStyle = "#f8be6a"; ctx.fillRect(373, 332, 20, 14);
  ctx.fillStyle = "#ff827d"; ctx.fillRect(400, 334, 13, 13);
  ctx.fillStyle = "#242746";
  for (let x = 151; x < 311; x += 16) ctx.fillRect(x, 492, 8, 2);
  drawSprite(ctx, PLANT_MAP, PLANT_PALETTE, 66, 477, 2);
  drawSprite(ctx, PLANT_MAP, PLANT_PALETTE, 552, 477, 2);

  // Coffee counter, soft seating, printer, terminal and server tower.
  drawSprite(ctx, SOFA_MAP, SOFA_PALETTE, 632, 356, 3);
  drawSprite(ctx, TABLE_MAP, TABLE_PALETTE, 721, 372, 2);
  ctx.fillStyle = INK; ctx.fillRect(842, 347, 48, 49);
  ctx.fillStyle = "#ec9b83"; ctx.fillRect(847, 352, 38, 38);
  ctx.fillStyle = "#312c50"; ctx.fillRect(857, 357, 18, 24);
  ctx.fillStyle = "#89e7d8"; ctx.fillRect(861, 364, 10, 8);
  ctx.fillStyle = "#f8be6a"; ctx.fillRect(791, 360, 15, 11); ctx.fillRect(811, 360, 15, 11);
  officeDesk(741, 424, active.has("terminal"), tick);
  drawSprite(ctx, RACK_MAP, RACK_PALETTE, 863, 416, 3);
  drawSprite(ctx, PRINTER_MAP, PRINTER_PALETTE, 815, 474, 2);
  drawSprite(ctx, PLANT_MAP, PLANT_PALETTE, 891, 475, 2);
  if (active.has("approval")) {
    ctx.fillStyle = tick % 2 === 0 ? "#ffd594" : "#ff827d";
    ctx.fillRect(613, 347, 8, 53);
  }
}

function drawAgentBubble(run: Run, x: number, y: number, color: string, lane: number): void {
  const text = short(run.detail || activityOf(run).label, 31);
  ctx.font = 'bold 11px "Courier New", monospace';
  const width = Math.min(278, Math.ceil(ctx.measureText(text).width) + 18);
  const left = snap(Math.max(42, Math.min(x - 16, 919 - width)));
  const top = snap(Math.max(108, y - 27 - lane * 25));
  ctx.fillStyle = "#0c1025"; ctx.fillRect(left + 3, top + 4, width, 22);
  ctx.fillStyle = color; ctx.fillRect(left, top, width, 22);
  ctx.fillStyle = "#242747"; ctx.fillRect(left + 3, top + 3, width - 6, 16);
  const tail = Math.max(left + 8, Math.min(x + 4, left + width - 15));
  ctx.fillStyle = color; ctx.fillRect(tail, top + 22, 7, 5);
  textOnCanvas(text, left + 10, top + 5, "#fff1df", 11);
}

function drawStudioPartitions(): void {
  ctx.fillStyle = "#53547b"; ctx.fillRect(49, 287, 865, 12);
  ctx.fillStyle = "#747093";
  for (let x = 59; x < 914; x += 28) ctx.fillRect(x, 292, 12, 2);
  for (const wall of STUDIO_WALLS) {
    ctx.fillStyle = "#11162c"; ctx.fillRect(wall.x, wall.y - 5, wall.w, wall.h + 5);
    ctx.fillStyle = "#726084"; ctx.fillRect(wall.x + 1, wall.y - 4, wall.w - 2, wall.h + 2);
    ctx.fillStyle = "#bd94af"; ctx.fillRect(wall.x + 1, wall.y - 4, wall.w - 2, 2);
    ctx.fillStyle = "#42465f"; ctx.fillRect(wall.x + 2, wall.y, Math.max(2, wall.w - 4), Math.max(2, wall.h - 2));
  }
}

function drawStudioDoors(now: number): void {
  const elapsed = Math.max(0, Math.min(80, now - lastDoorTime));
  lastDoorTime = now;
  for (const door of STUDIO_DOORS) {
    const open = [...agentPositions.values()].some((agent) => agent.route.length > 0
      && Math.hypot(agent.point.x - door.x - door.w / 2, agent.point.y - door.y) < 85);
    const previous = doorOpenness.get(door.id) ?? 0;
    const fraction = reducedMotion ? (open ? 1 : 0) : Math.max(0, Math.min(1, previous + (open ? 1 : -1) * elapsed / 160));
    doorOpenness.set(door.id, fraction);
    const leaf = snap(door.w / 2 - 4 - fraction * (door.w / 2 - 11));
    ctx.fillStyle = "#161b35"; ctx.fillRect(door.x, door.y - 8, 5, 20); ctx.fillRect(door.x + door.w - 5, door.y - 8, 5, 20);
    ctx.fillStyle = open ? "#91e5d4" : "#9294bf";
    ctx.fillRect(door.x + 5, door.y - 5, leaf, 10); ctx.fillRect(door.x + door.w - 5 - leaf, door.y - 5, leaf, 10);
    ctx.fillStyle = "#c4b9d4"; ctx.fillRect(door.x + 5, door.y - 6, leaf, 2); ctx.fillRect(door.x + door.w - 5 - leaf, door.y - 6, leaf, 2);
    ctx.fillStyle = "#f8be6a"; ctx.fillRect(door.x + 2, door.y + 8, 3, 3); ctx.fillRect(door.x + door.w - 5, door.y + 8, 3, 3);
  }
}

function drawWorkRoleBadge(role: string, x: number, y: number, scale: number, color: string, compact = false): void {
  const caption = short(role.toUpperCase(), compact ? 6 : 14);
  const fontSize = compact ? 8 : 10;
  ctx.font = `bold ${fontSize}px "Courier New", monospace`;
  const width = Math.ceil(ctx.measureText(caption).width) + 16;
  const left = snap(Math.max(42, Math.min(x + 6 * scale - width / 2, 918 - width)));
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

function drawOfficeAgents(sessions: Run[], tick: number, now: number): void {
  const visibleIds = new Set(sessions.map((run) => run.sessionId ?? run.id));
  for (const id of agentPositions.keys()) if (!visibleIds.has(id)) agentPositions.delete(id);
  const planningCount = sessions.filter((run) => ["thinking", "delegating"].includes(stationFor(run))).length;
  if (planningCount > 1 && sessions.some((run) => stationFor(run) === "delegating")) {
    ctx.fillStyle = tick % 2 === 0 ? "#f8be6a" : "#cbb5f1";
    for (let dot = 0; dot < 3; dot++) ctx.fillRect(415 + dot * 12, 210 + (dot === tick % 3 ? -4 : 0), 5, 5);
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
    let agent = prior ?? { point: feet, target: feet, route: [], time: now, direction: "south" as Direction };
    if (reducedMotion) agent = { ...agent, point: feet, target: feet, route: [] };
    else if (agent.target.x !== feet.x || agent.target.y !== feet.y) {
      agent = { ...agent, target: feet, route: planRoute(agent.point, feet, geometry.obstacles, canvas.height === 560 ? 516 : canvas.height - 24) ?? [] };
    }
    if (agent.route.length) agent = { ...agent, ...advanceTimedRoute(agent.point, agent.route, now - agent.time) };
    agent.time = now;
    agentPositions.set(id, agent);
    const x = snap(agent.point.x - 6 * scale), y = snap(agent.point.y - 13 * scale);
    const arrived = Math.hypot(agent.point.x - feet.x, agent.point.y - feet.y) < 2;
    const seated = arrived && seat.seated;
    const activity = activityOf(run);
    const workRole = displayWorkRole(run, sessions.length === 1);
    const palette = agentPalette(workRole, id);
    if (computer) {
      ctx.fillStyle = tick % 2 === 0 ? "#b5fff0" : "#67dccb";
      ctx.fillRect(computer[0] + 18, computer[1] - 8, 13, 2);
      ctx.fillRect(computer[0] + 18, computer[1] - 3, 9, 2);
    }
    if (station === "approval") {
      ctx.fillStyle = tick % 2 === 0 ? "#ffd594" : "#ff827d"; ctx.fillRect(613, 347, 8, 53);
    }
    ctx.fillStyle = activity.color;
    ctx.fillRect(x - 5, y + 14 * scale - 4, 12 * scale + 10, 4);
    if (seated) drawOccupiedChair(x, y, scale, false);
    const frame = !arrived ? WALK_FRAMES[agent.direction][Math.floor(now / 90) % 8]
      : CHAR_FRAMES[station === "thinking" || station === "delegating" ? (tick % 2 === 0 ? "talkA" : "talkB")
        : seated ? (tick % 2 === 0 ? "typeA" : "typeB") : frameForState(run.state, tick)];
    drawSprite(ctx, frame, palette, x, y, scale);
    if (seated) drawOccupiedChair(x, y, scale, true);
    if (station === "reading" && arrived) {
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
      const mark = ({ thinking: "…", delegating: "↔", reading: "R", editing: "E", "web-search": "W", terminal: ">_", approval: "!", lounge: "·" })[station];
      ctx.fillStyle = "#242747"; ctx.fillRect(x + 30, y + 5, 21, 16);
      textOnCanvas(mark, x + 33, y + 7, activity.color, 10);
    }
    drawWorkRoleBadge(workRole, x, y, scale, palette.C, sessions.length > 4);
  }
}

function occupiedStudioHeight(): number {
  const points = [...agentPositions.entries()].filter(([id]) => studioSeats.has(id)).map(([, agent]) => agent.point.y);
  const bottom = Math.max(516, ...points);
  return bottom <= 516 ? 560 : 560 + Math.ceil((bottom - 560) / 130) * 130;
}

function drawStudioAmbience(): void {
  ctx.save();
  // Window light falls in stepped bands so the pixel texture stays visible.
  ctx.beginPath(); ctx.rect(34, 107, 892, 415); ctx.clip();
  ctx.fillStyle = theme.daylight;
  for (const wx of [323, 490, 657]) {
    for (let band = 0; band < 5; band++) {
      ctx.globalAlpha = theme.lightStrength * (1 - band * .16);
      const shift = studioPeriod === "evening" ? -band * 16 : band * 9;
      ctx.fillRect(wx + 16 + shift, 107 + band * 22, 100, 22);
    }
  }
  // Lamps warm the table at dusk and at night without starting another loop.
  for (const x of [371, 521]) {
    for (let ring = 3; ring >= 0; ring--) {
      ctx.globalAlpha = theme.lampStrength * .22;
      ctx.fillStyle = "#ffd48c";
      ctx.fillRect(x - 20 - ring * 8, 149 - ring * 4, 40 + ring * 16, 69 + ring * 8);
    }
  }
  ctx.restore();
}

function drawSessionFloor(tick: number, now: number): void {
  const sessions = visibleAgents();
  const desiredHeight = Math.max(studioHeight(studioSeats), occupiedStudioHeight());
  if (desiredHeight !== geometry.height) {
    geometry = studioGeometry(studioSeats, desiredHeight);
    canvas.height = desiredHeight;
    studioDirty = true;
  }
  if (studioDirty || !backgroundCtx || studioBackground.width !== canvas.width || studioBackground.height !== canvas.height) {
    drawShell();
    drawOfficeFurniture(0, new Set(), 0);
    drawStudioPartitions();
    textOnCanvas("PLANNING ATELIER", 324, 114, theme.ui.ink, 10);
    if (geometry.extraDesks.length) {
      drawRug(34, 555, 892, canvas.height - 570, "#6869a4", "#343660");
      plate("TEAM WORKSPACE", 48, 558, "#cbb5f1");
      for (const [x, y] of geometry.extraDesks) officeDesk(x, y);
    }
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
    recolorStudioPixels(pixels.data, studioPeriod);
    ctx.putImageData(pixels, 0, 0);
    drawStudioAmbience();
    studioBackground.width = canvas.width; studioBackground.height = canvas.height;
    backgroundCtx?.drawImage(canvas, 0, 0);
    studioDirty = false;
  }
  if (backgroundCtx) ctx.drawImage(studioBackground, 0, 0);
  if (sessions.length === 0) {
    agentPositions.clear();
    doorOpenness.clear();
    drawStudioDoors(now);
    plate("STUDIO STANDBY", 384, 377, "#f8be6a");
    textOnCanvas("Start an OpenCode session to see agents at work.", 282, 411, COLORS.light, 12);
    return;
  }
  drawStudioDoors(now);
  drawOfficeAgents(sessions, tick, now);
  const primary = sessions[0];
  ctx.fillStyle = "#1b1d3b"; ctx.fillRect(42, 530, 872, 16);
  ctx.fillStyle = activityOf(primary).color; ctx.fillRect(42, 530, 5, 16);
  textOnCanvas(short(primary.prompt || "OpenCode session", 47), 54, 532, COLORS.light, 11);
  const activeCount = sessions.filter((run) => run.state !== "done" && run.state !== "blocked").length;
  textOnCanvas(`${activeCount} ACTIVE ${activeCount === 1 ? "AGENT" : "AGENTS"}`, 792, 532, COLORS.light, 11);
}

function draw(now = performance.now()): void {
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
  source.onerror = () => { streamReady = false; renderConnection(); };
}

updateStudioClock();
window.setInterval(() => {
  if (document.visibilityState === "visible" && updateStudioClock()) draw();
}, 15_000);
draw();
void snapshot();
connect();
document.addEventListener("visibilitychange", () => {
  if (animationFrame !== undefined) window.cancelAnimationFrame(animationFrame);
  animationFrame = undefined;
  const now = performance.now();
  for (const agent of agentPositions.values()) agent.time = now;
  lastDoorTime = now;
  if (document.visibilityState === "visible") { updateStudioClock(); draw(now); }
});
