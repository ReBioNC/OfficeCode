import { deskPoint, roomRect, type Rect } from "./layout";
import {
  BOARD_MAP, BOARD_PALETTE, CHAIR_MAP, CHAIR_PALETTE, CHAR_FRAMES,
  DESK_MAP, DESK_PALETTE, INK, PLANT_MAP, PLANT_PALETTE,
  PRINTER_MAP, PRINTER_PALETTE, RACK_MAP, RACK_PALETTE,
  SOFA_MAP, SOFA_PALETTE, TABLE_MAP, TABLE_PALETTE,
  drawSprite, frameForState, shirtPalette, snap,
} from "./sprites";

interface Desk { id: string; roomId: string; label: string }
interface Room { id: string; name: string; color: string }
interface Hallway { fromRoomId: string; toRoomId: string; open: boolean }
interface PlacedObject { id: string; roomId: string; kind: string }
interface OfficeDoc { building: string; rooms: Room[]; desks: Desk[]; hallways: Hallway[]; objects: PlacedObject[] }
interface Run { id: string; deskId: string; role: string; state: string; prompt: string; sessionId?: string; activity?: string; detail?: string }
interface QueueItem { position: number; deskId: string; role: string; prompt: string }

const COLORS = {
  night: "#1b1720", paper: "#f4f0e6", light: "#fffdf5", wall: "#d6d5ca",
  floor: "#8ca99b", floorLine: "#77968b", muted: "#665d61", gold: "#d8b66d",
};
const ROOM_COLORS: Record<string, string> = {
  blue: "#80abd0", green: "#8fbf9d", red: "#d89792", purple: "#b6a2d2",
};
const ROLE_PILL: Record<string, string> = {
  build: "#80abd0", plan: "#b6a2d2", explore: "#62afa3", general: "#dca267",
  researcher: "#62afa3", architect: "#b6a2d2", tester: "#77b98d",
  writer: "#dc8bb1", debugger: "#d1726d", security: "#c7aa69",
  pm: "#d1726d", "uiux-designer": "#dc8bb1", "frontend-dev": "#80abd0",
  "backend-dev": "#aa8dce", "api-dev": "#62afa3", "database-dev": "#75a681",
  devops: "#dca267", "qa-engineer": "#77b98d", reviewer: "#c7aa69",
  "docs-writer": "#a0a4ad",
};
const ACTIVITY: Record<string, { label: string; persona: string; station: string; color: string }> = {
  arriving: { label: "Menyiapkan ruang", persona: "Agen kerja", station: "pintu", color: "#d8b66d" },
  thinking: { label: "Berpikir", persona: "Perencana", station: "meja ide", color: "#b6a2d2" },
  reading: { label: "Membaca file", persona: "Pembaca kode", station: "rak referensi", color: "#80abd0" },
  editing: { label: "Mengedit kode", persona: "Editor kode", station: "meja kode", color: "#d89792" },
  "web-search": { label: "Mencari di web", persona: "Peneliti web", station: "jendela web", color: "#62afa3" },
  "code-search": { label: "Menelusuri kode", persona: "Peneliti kode", station: "rak referensi", color: "#80abd0" },
  terminal: { label: "Menjalankan perintah", persona: "Operator terminal", station: "terminal", color: "#dca267" },
  delegating: { label: "Berkoordinasi", persona: "Koordinator", station: "papan tugas", color: "#b6a2d2" },
  working: { label: "Bekerja", persona: "Pelaksana", station: "meja kode", color: "#d89792" },
  approval: { label: "Menunggu izin", persona: "Menunggu keputusan", station: "pintu", color: "#d8b66d" },
  done: { label: "Selesai", persona: "Selesai", station: "lounge", color: "#8fbf9d" },
  blocked: { label: "Terhenti", persona: "Perlu bantuan", station: "pintu", color: "#d89792" },
};
const STATUS_LABEL: Record<string, string> = {
  walking: "Menuju meja", thinking: "Berpikir", acting: "Bekerja",
  "waiting-approval": "Perlu izin", blocked: "Terhambat",
  "in-handoff": "Handoff", delivering: "Mengantar", done: "Selesai",
};
const BUBBLE_TEXT: Record<string, (run: Run) => string | null> = {
  thinking: () => "Berpikir…",
  acting: (run) => `Kerja: ${short(run.prompt, 18)}`,
  "waiting-approval": () => "Perlu izin !",
  blocked: () => "Butuh bantuan !",
  "in-handoff": () => "Handoff",
  delivering: () => "Mengantar hasil",
  done: () => "Selesai ✓",
};

const canvas = document.getElementById("floor") as HTMLCanvasElement;
const context = canvas.getContext("2d");
if (!context) throw new Error("Canvas 2D tidak tersedia");
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

function short(value: string, max: number): string {
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

function label(state: string): string {
  return STATUS_LABEL[state] ?? state;
}

function visibleAgents(): Run[] {
  const latest = new Map<string, Run>();
  for (const run of runs) {
    if (!run.sessionId) continue;
    latest.delete(run.sessionId);
    latest.set(run.sessionId, run);
  }
  const current = [...latest.values()].filter((run) => run.state !== "done" && run.state !== "blocked");
  return current.length ? current : [...latest.values()].slice(-1);
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
  connection.textContent = online ? "Live · tersinkron" : "Menghubungkan ulang…";
}

function renderPanels(): void {
  const runById = new Map(runs.map((run) => [run.id, run]));
  const sessions = mirrorOnly ? visibleAgents() : [];
  const focus = sessions[0];
  (document.getElementById("focusSection") as HTMLElement).hidden = !mirrorOnly;
  (document.getElementById("activityTracker") as HTMLElement).hidden = !mirrorOnly;
  if (mirrorOnly) {
    (document.getElementById("focusStation") as HTMLElement).textContent = focus ? activityOf(focus).station : "Siaga";
    (document.getElementById("focusRole") as HTMLElement).textContent = focus ? `Agen ${focus.role} · ${activityOf(focus).persona}` : "Agen OpenCode";
    (document.getElementById("focusTask") as HTMLElement).textContent = focus?.prompt || "Menunggu sesi kerja";
    (document.getElementById("focusActivity") as HTMLElement).textContent = focus ? activityOf(focus).label : "Belum ada aktivitas";
    (document.getElementById("focusDetail") as HTMLElement).textContent = focus?.detail || "Mulai mengerjakan fitur di OpenCode.";
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
  (document.getElementById("floorMeta") as HTMLElement).textContent = mirrorOnly ? `1 kantor · ${sessions.length} agen` : `${office.rooms.length} ruang · ${office.desks.length} meja`;
  (document.getElementById("crewCount") as HTMLElement).textContent = mirrorOnly ? `${sessions.length} agen terlihat` : `${office.desks.length} slot tersedia`;
  (document.getElementById("activityCount") as HTMLElement).textContent = `${runs.length} run`;
  (document.getElementById("queueCount") as HTMLElement).textContent = `${queue.length} tugas`;
  (document.getElementById("queueEmpty") as HTMLElement).hidden = queue.length > 0;
  (document.getElementById("lastSync") as HTMLElement).textContent = `Sinkron ${new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}`;
  const roomSlots = office.rooms.length <= 5 ? office.rooms.length + 1 : office.rooms.length;
  const floorHeight = mirrorOnly ? 560 : Math.max(560, 124 + Math.ceil(roomSlots / 3) * 218);
  if (canvas.height !== floorHeight) canvas.height = floorHeight;

  const activityNodes = [...runs].reverse().slice(0, 5).map((run) => {
    const item = element("li", "activity-item");
    item.dataset.state = run.state;
    const top = element("div", "activity-top");
    top.append(element("span", "activity-role", run.role), element("span", "run-state", mirrorOnly ? activityOf(run).label : label(run.state)));
    item.append(top, element("p", "activity-prompt", short(run.prompt, 120) || run.id));
    if (mirrorOnly && run.detail) item.append(element("p", "activity-detail", short(run.detail, 100)));
    return item;
  });
  if (activityNodes.length === 0) activityNodes.push(element("li", "empty", "Belum ada aktivitas. Jalankan tugas dari OpenCode."));
  runsUl.replaceChildren(...activityNodes);

  queueUl.replaceChildren(...queue.map((entry) => {
    const item = element("li", "queue-item");
    item.append(element("span", "queue-number", `#${entry.position}`), element("span", "", `${entry.role} → ${entry.deskId}`));
    return item;
  }));

  if (mirrorOnly) {
    crewUl.replaceChildren(...sessions.map((run) => {
      const card = element("li", "crew-card");
      card.dataset.state = run.state;
      card.style.setProperty("--room-color", activityOf(run).color);
      const avatar = element("span", "crew-avatar");
      const portrait = document.createElement("canvas");
      portrait.width = 30; portrait.height = 35;
      const portraitCtx = portrait.getContext("2d");
      if (portraitCtx) drawSprite(portraitCtx, CHAR_FRAMES.idle, shirtPalette(run.role), 3, 3, 2);
      avatar.append(portrait);
      const copy = element("div", "crew-copy");
      copy.append(element("span", "crew-name", run.role), element("span", "crew-meta", short(run.prompt, 36)),
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
      element("span", "crew-meta", `${room?.name ?? "Ruang"} · ${desk.label}`),
      element("span", "crew-status", run ? label(run.state) : runId ? "Memuat run…" : "Meja kosong"),
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
        (document.getElementById("lastSync") as HTMLElement).textContent = "Data belum terbarui";
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
  textOnCanvas(mirrorOnly ? "SATU KANTOR" : "LIVE FLOOR", 806, 51, "#726963", 11);
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
  textOnCanvas(`${completed} HASIL SELESAI`, r.x + 25, r.y + 166, COLORS.light, 11);
  for (let i = 0; i < Math.min(completed, 3); i++) {
    ctx.fillStyle = "#b7814f";
    ctx.fillRect(snap(r.x + r.w - 80 + i * 17), snap(r.y + 162), 14, 13);
    ctx.fillStyle = INK;
    ctx.fillRect(snap(r.x + r.w - 80 + i * 17), snap(r.y + 167), 14, 2);
  }
}

type OfficeStation = "reading" | "editing" | "web-search" | "terminal" | "thinking" | "delegating" | "approval" | "lounge";

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
  drawSprite(ctx, CHAIR_MAP, CHAIR_PALETTE, x + 15, y + 39, 3);
  drawSprite(ctx, DESK_MAP, DESK_PALETTE, x, y, 3);
  if (active) {
    ctx.fillStyle = tick % 2 === 0 ? "#c0fff0" : "#80d7e5";
    ctx.fillRect(x + 17, y + 13, 23, 10);
  }
}

function drawOfficeFurniture(tick: number, active: Set<OfficeStation>): void {
  // One continuous floor, with furniture and low partitions defining work zones.
  ctx.fillStyle = "#a5b8a8";
  ctx.fillRect(40, 91, 884, 163);
  ctx.fillStyle = "#8fae9c";
  ctx.fillRect(40, 276, 621, 241);
  ctx.fillStyle = "#a4b9b4";
  ctx.fillRect(682, 276, 242, 241);
  ctx.fillStyle = "#789689";
  for (let x = 50; x < 922; x += 34) {
    for (let y = 102; y < 510; y += 34) ctx.fillRect(x, y, 5, 5);
  }

  // Low office partitions leave wide passages between every zone.
  for (const [x, w] of [[40, 207], [283, 244], [563, 361]]) {
    ctx.fillStyle = INK; ctx.fillRect(x, 255, w, 5);
    ctx.fillStyle = COLORS.paper; ctx.fillRect(x, 260, w, 12);
  }
  ctx.fillStyle = INK; ctx.fillRect(670, 278, 5, 99); ctx.fillRect(670, 423, 5, 94);
  ctx.fillStyle = COLORS.paper; ctx.fillRect(675, 278, 9, 99); ctx.fillRect(675, 423, 9, 94);

  plate("STUDIO", 54, 101, "#e8dfca");
  plate("MEJA RAPAT", 299, 101, "#e8dfca");
  plate("RISET / WEB", 637, 101, "#e8dfca");
  plate("AREA KERJA", 54, 284, "#e8dfca");
  plate("LOUNGE / OPS", 695, 284, "#e8dfca");

  // Studio desk and pinned notes.
  officeDesk(91, 163, active.has("delegating"), tick);
  drawSprite(ctx, BOARD_MAP, BOARD_PALETTE, 188, 138, 2);
  drawSprite(ctx, PLANT_MAP, PLANT_PALETTE, 57, 219, 2);
  ctx.fillStyle = "#f7e1ae"; ctx.fillRect(213, 202, 25, 22);
  ctx.fillStyle = "#b88f7b"; ctx.fillRect(218, 208, 5, 5);

  // A communal table with chairs and documents for planning.
  ctx.fillStyle = INK; ctx.fillRect(311, 153, 239, 71);
  ctx.fillStyle = "#a36d42"; ctx.fillRect(316, 158, 229, 61);
  ctx.fillStyle = "#c8915b"; ctx.fillRect(322, 164, 217, 48);
  for (const x of [333, 383, 433, 483]) {
    ctx.fillStyle = "#6b4550"; ctx.fillRect(x, 136, 31, 17); ctx.fillRect(x, 225, 31, 16);
    ctx.fillStyle = INK; ctx.fillRect(x, 149, 31, 4); ctx.fillRect(x, 225, 31, 4);
  }
  ctx.fillStyle = "#f4efe2"; ctx.fillRect(484, 172, 26, 30);
  ctx.fillStyle = "#80abd0"; ctx.fillRect(490, 179, 15, 3); ctx.fillRect(490, 187, 13, 3);
  drawSprite(ctx, PLANT_MAP, PLANT_PALETTE, 564, 216, 2);

  // Research library, web desk, and a small file cart.
  for (const y of [140, 163, 186]) {
    ctx.fillStyle = INK; ctx.fillRect(632, y, 75, 20);
    ctx.fillStyle = "#8d6848"; ctx.fillRect(636, y + 4, 67, 13);
    for (let x = 643; x < 700; x += 10) {
      ctx.fillStyle = ["#d8b66d", "#80abd0", "#d89792", "#b6a2d2"][(x / 10) % 4 | 0];
      ctx.fillRect(x, y + 5, 6, 11);
    }
  }
  officeDesk(781, 156, active.has("web-search"), tick);
  ctx.fillStyle = active.has("web-search") && tick % 2 === 0 ? "#d2fff4" : "#a6d6d5";
  ctx.fillRect(797, 169, 24, 10);
  ctx.fillStyle = INK; ctx.fillRect(805, 171, 8, 6);
  drawSprite(ctx, PLANT_MAP, PLANT_PALETTE, 895, 216, 2);

  // Open-plan desks. Every station stays on the same visible floor.
  for (const y of [326, 424]) {
    for (const x of [72, 184, 296, 408, 520]) officeDesk(x, y, active.has("editing") && x === 184 && y === 326, tick);
  }
  drawSprite(ctx, BOARD_MAP, BOARD_PALETTE, 594, 310, 2);
  drawSprite(ctx, PLANT_MAP, PLANT_PALETTE, 46, 486, 2);
  drawSprite(ctx, PLANT_MAP, PLANT_PALETTE, 633, 486, 2);

  // Shared lounge, coffee corner, and operations terminal.
  drawSprite(ctx, SOFA_MAP, SOFA_PALETTE, 713, 322, 3);
  drawSprite(ctx, TABLE_MAP, TABLE_PALETTE, 796, 338, 2);
  ctx.fillStyle = INK; ctx.fillRect(867, 322, 35, 51);
  ctx.fillStyle = "#b9dda1"; ctx.fillRect(871, 326, 27, 40);
  ctx.fillStyle = "#5a785d"; ctx.fillRect(881, 337, 7, 16);
  officeDesk(735, 412, active.has("terminal"), tick);
  drawSprite(ctx, RACK_MAP, RACK_PALETTE, 869, 409, 3);
  drawSprite(ctx, PRINTER_MAP, PRINTER_PALETTE, 816, 470, 2);
  drawSprite(ctx, PLANT_MAP, PLANT_PALETTE, 897, 480, 2);
}

function drawAgentBubble(run: Run, x: number, y: number, color: string, lane: number): void {
  const text = short(run.detail || activityOf(run).label, 31);
  ctx.font = 'bold 11px "Courier New", monospace';
  const width = Math.min(278, Math.ceil(ctx.measureText(text).width) + 18);
  const left = snap(Math.max(42, Math.min(x - 16, 919 - width)));
  const top = snap(Math.max(108, y - 27 - lane * 25));
  ctx.fillStyle = INK; ctx.fillRect(left + 3, top + 3, width, 22);
  ctx.fillStyle = COLORS.light; ctx.fillRect(left, top, width, 22);
  ctx.fillStyle = color; ctx.fillRect(left, top, 5, 22);
  textOnCanvas(text, left + 11, top + 5, INK, 11);
}

function drawOfficeAgents(sessions: Run[], tick: number): void {
  const spots: Record<OfficeStation, { x: number; y: number }> = {
    reading: { x: 682, y: 194 },
    "web-search": { x: 813, y: 195 },
    thinking: { x: 410, y: 189 },
    delegating: { x: 163, y: 189 },
    editing: { x: 197, y: 355 },
    terminal: { x: 761, y: 417 },
    approval: { x: 681, y: 365 },
    lounge: { x: 744, y: 365 },
  };
  const stationOccupancy = new Map<OfficeStation, number>();
  for (const [index, run] of sessions.entries()) {
    const station = stationFor(run);
    const slot = stationOccupancy.get(station) ?? 0;
    stationOccupancy.set(station, slot + 1);
    const base = spots[station];
    const x = base.x + (base.x > 720 ? -1 : 1) * (slot % 3) * 50;
    const y = base.y - Math.floor(slot / 3) * 30 + (tick % 2 === 0 ? 0 : 1);
    const scale = sessions.length <= 2 ? 4 : 3;
    const activity = activityOf(run);
    ctx.fillStyle = activity.color;
    ctx.fillRect(x - 5, y + 14 * scale - 4, 12 * scale + 10, 4);
    drawSprite(ctx, CHAR_FRAMES[frameForState(run.state, tick)], shirtPalette(run.role), x, y, scale);
    if (run.state === "thinking") {
      ctx.fillStyle = "#fff7dd";
      for (let dot = 0; dot < 3; dot++) ctx.fillRect(x + 36 + dot * 7, y - 10 - (tick + dot) % 2 * 3, 4, 4);
    }
    drawAgentBubble(run, x, y, activity.color, index % 3);
    textOnCanvas(short(run.role.toUpperCase(), 13), x - 3, y + 15 * scale, COLORS.light, 10);
  }
}

function drawSessionFloor(tick: number): void {
  const sessions = visibleAgents();
  const active = new Set(sessions.map(stationFor));
  drawOfficeFurniture(tick, active);
  if (sessions.length === 0) {
    plate("KANTOR SIAGA", 384, 377, "#e9dfcd");
    textOnCanvas("Mulai sesi OpenCode untuk melihat agen bekerja.", 282, 411, COLORS.light, 12);
    return;
  }
  drawOfficeAgents(sessions, tick);
  const primary = sessions[0];
  ctx.fillStyle = "#e8dfca"; ctx.fillRect(42, 489, 610, 26);
  ctx.fillStyle = activityOf(primary).color; ctx.fillRect(42, 489, 5, 26);
  textOnCanvas(short(primary.prompt || "Sesi OpenCode", 47), 54, 495, INK, 11);
  const activeCount = sessions.filter((run) => run.state !== "done" && run.state !== "blocked").length;
  textOnCanvas(activeCount + " AGEN AKTIF", 792, 494, COLORS.light, 11);
}

function draw(): void {
  const tick = reducedMotion ? 0 : Math.floor(Date.now() / 400);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = false;
  ctx.textBaseline = "top";
  drawShell();
  if (mirrorOnly) { drawSessionFloor(tick); return; }
  if (office.rooms.length === 0) {
    plate("MENUNGGU DENAH KANTOR", 340, 266);
    return;
  }
  const rects = new Map(office.rooms.map((room, index) => [room.id, roomRect(index, canvas.width, office.rooms.length)]));
  drawHallways(rects);
  const runById = new Map(runs.map((run) => [run.id, run]));
  office.rooms.forEach((room, index) => drawRoom(room, index, runById, tick));
  if (office.rooms.length <= 5) drawLounge();
}

function connect(): void {
  const source = new EventSource("/api/events");
  source.onopen = () => { streamReady = true; renderConnection(); void snapshot(); };
  source.addEventListener("snapshot", () => { void snapshot(); });
  source.addEventListener("office", () => { void snapshot(); });
  source.onerror = () => { streamReady = false; renderConnection(); };
}

draw();
void snapshot();
connect();
if (!reducedMotion) {
  window.setInterval(() => {
    if (document.visibilityState === "visible" && (mirrorOnly ? visibleAgents().length > 0 : runs.some((run) => run.state === "walking" || run.state === "delivering"))) draw();
  }, 400);
}
