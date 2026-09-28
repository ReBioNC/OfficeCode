import { deskPoint, roomRect, type Rect } from "./layout";
import {
  BOARD_MAP, BOARD_PALETTE, CHAIR_MAP, CHAIR_PALETTE, CHAR_FRAMES,
  DESK_MAP, DESK_PALETTE, INK, PLANT_MAP, PLANT_PALETTE,
  PRINTER_MAP, PRINTER_PALETTE, RACK_MAP, RACK_PALETTE,
  SOFA_MAP, SOFA_PALETTE, TABLE_MAP, TABLE_PALETTE,
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
  arriving: { label: "Menyiapkan ruang", persona: "Agen kerja", station: "pintu", color: "#f8be6a" },
  thinking: { label: "Berpikir", persona: "Perencana", station: "meja ide", color: "#c6a2f6" },
  reading: { label: "Membaca file", persona: "Pembaca kode", station: "rak referensi", color: "#8ea8f1" },
  editing: { label: "Mengedit kode", persona: "Editor kode", station: "meja kode", color: "#ff827d" },
  "web-search": { label: "Mencari di web", persona: "Peneliti web", station: "jendela web", color: "#67dccb" },
  "code-search": { label: "Menelusuri kode", persona: "Peneliti kode", station: "rak referensi", color: "#8ea8f1" },
  terminal: { label: "Menjalankan perintah", persona: "Operator terminal", station: "terminal", color: "#f8be6a" },
  delegating: { label: "Berkoordinasi", persona: "Koordinator", station: "papan tugas", color: "#c6a2f6" },
  working: { label: "Bekerja", persona: "Pelaksana", station: "meja kode", color: "#ff827d" },
  approval: { label: "Menunggu izin", persona: "Menunggu keputusan", station: "pintu", color: "#f8be6a" },
  done: { label: "Selesai", persona: "Selesai", station: "lounge", color: "#8ed9a2" },
  blocked: { label: "Terhenti", persona: "Perlu bantuan", station: "pintu", color: "#ff827d" },
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
      if (portraitCtx) drawSprite(portraitCtx, CHAR_FRAMES.idle, agentPalette(run.role, run.sessionId ?? run.id), 3, 3, 2);
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
  // Sunset windows and a city silhouette establish the studio setting.
  for (const wx of [323, 490, 657]) {
    ctx.fillStyle = INK;
    ctx.fillRect(wx, 39, 139, 58);
    ctx.fillStyle = "#a96a93"; ctx.fillRect(wx + 5, 44, 129, 14);
    ctx.fillStyle = "#e58a87"; ctx.fillRect(wx + 5, 58, 129, 12);
    ctx.fillStyle = "#f2b575"; ctx.fillRect(wx + 5, 70, 129, 20);
    for (let i = 0; i < 14; i++) {
      const px = wx + 9 + (i * 37) % 118;
      const py = 48 + (i * 17) % 34;
      ctx.fillStyle = i % 3 === 0 ? "#ffd4ad" : "#f6bca8";
      ctx.fillRect(px, py, i % 4 === 0 ? 5 : 2, 2);
    }
    ctx.fillStyle = "#343358";
    for (let i = 0; i < 7; i++) {
      const height = 8 + ((i * 13 + wx) % 18);
      ctx.fillRect(wx + 6 + i * 19, 90 - height, 16, height);
      ctx.fillStyle = "#ffd28b";
      ctx.fillRect(wx + 11 + i * 19, 86 - height / 2, 3, 3);
      ctx.fillStyle = "#343358";
    }
    ctx.fillStyle = "#d7b4b5";
    ctx.fillRect(wx + 70, 43, 4, 49);
    ctx.fillRect(wx + 5, 65, 129, 3);
    ctx.fillStyle = "#261f3b"; ctx.fillRect(wx - 3, 97, 145, 5);
    ctx.fillStyle = "#bd839e"; ctx.fillRect(wx + 6, 97, 127, 2);
  }
  plate("OFFICECODE / STUDIO MALAM", 48, 52, "#f8be6a");
  textOnCanvas("LIVE / 01", 842, 52, "#f5d8cb", 11);
  ctx.fillStyle = "#15172f"; ctx.fillRect(31, 101, 898, 6);
  ctx.fillStyle = "#f8be6a"; ctx.fillRect(31, 101, 898, 2);
  ctx.fillStyle = "#30345d"; ctx.fillRect(34, 107, 892, 415);
  drawStudioFloorTexture();
  ctx.globalAlpha = .06;
  ctx.fillStyle = "#f8be6a";
  for (const wx of [323, 490, 657]) ctx.fillRect(wx + 19, 107, 98, 108);
  ctx.globalAlpha = 1;
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
  ctx.fillStyle = "#202341"; ctx.fillRect(x + 6, y + 7, 54, 38);
  drawSprite(ctx, CHAIR_MAP, CHAIR_PALETTE, x + 15, y + 39, 3);
  drawSprite(ctx, DESK_MAP, DESK_PALETTE, x, y, 3);
  ctx.fillStyle = "#e8a08e";
  ctx.fillRect(x + 6, y + 6, 8, 2); ctx.fillRect(x + 42, y + 8, 5, 2);
  ctx.fillStyle = "#a45b70";
  ctx.fillRect(x + 8, y + 27, 12, 2); ctx.fillRect(x + 37, y + 30, 8, 2);
  ctx.fillStyle = "#b5fff0"; ctx.fillRect(x + 20, y + 13, 3, 2);
  ctx.fillStyle = "#477e8d"; ctx.fillRect(x + 27, y + 17, 9, 2);
  if (active) {
    ctx.fillStyle = tick % 2 === 0 ? "#b5fff0" : "#67dccb";
    ctx.fillRect(x + 18, y + 13, 21, 7);
    ctx.fillStyle = "#317488"; ctx.fillRect(x + 22, y + 15, 7, 2);
  }
}

function drawRug(x: number, y: number, w: number, h: number, edge: string, fill: string): void {
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
  ctx.globalAlpha = tick % 2 === 0 ? .13 : .09;
  ctx.fillStyle = "#f8be6a"; ctx.fillRect(x - 8, y + 22, 42, 43);
  ctx.globalAlpha = 1;
}

function drawOfficeFurniture(tick: number, active: Set<OfficeStation>): void {
  // Color-blocked rugs organize one uninterrupted studio floor.
  drawRug(49, 124, 225, 159, "#a05f8f", "#493455");
  drawRug(291, 124, 295, 159, "#9c86ce", "#45406b");
  drawRug(606, 124, 308, 159, "#59bdb7", "#294a62");
  drawRug(49, 300, 542, 212, "#6869a4", "#343660");
  drawRug(611, 300, 303, 212, "#dd917c", "#493c60");
  plate("IDEA POD", 59, 131, "#f2a1aa");
  plate("ATELIER / RENCANA", 302, 131, "#cbb5f1");
  plate("PUSTAKA DIGITAL", 618, 131, "#86e5d4");
  plate("MEJA KERJA", 59, 307, "#aca9e0");
  plate("OPS / KOPI", 623, 307, "#f8bd91");

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
  for (const [x, y] of [[77, 348], [208, 342], [346, 355], [90, 440], [264, 431], [452, 413]]) {
    officeDesk(x, y, active.has("editing") && x === 208, tick);
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

function drawOfficeAgents(sessions: Run[], tick: number): void {
  const spots: Record<OfficeStation, { x: number; y: number }> = {
    reading: { x: 680, y: 220 },
    "web-search": { x: 819, y: 221 },
    thinking: { x: 417, y: 211 },
    delegating: { x: 190, y: 207 },
    editing: { x: 221, y: 379 },
    terminal: { x: 765, y: 420 },
    approval: { x: 626, y: 385 },
    lounge: { x: 660, y: 387 },
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
    drawSprite(ctx, CHAR_FRAMES[frameForState(run.state, tick)], agentPalette(run.role, run.sessionId ?? run.id), x, y, scale);
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
    plate("STUDIO SIAGA", 384, 377, "#f8be6a");
    textOnCanvas("Mulai sesi OpenCode untuk melihat agen bekerja.", 282, 411, COLORS.light, 12);
    return;
  }
  drawOfficeAgents(sessions, tick);
  const primary = sessions[0];
  ctx.fillStyle = "#1b1d3b"; ctx.fillRect(42, 489, 610, 26);
  ctx.fillStyle = activityOf(primary).color; ctx.fillRect(42, 489, 5, 26);
  textOnCanvas(short(primary.prompt || "Sesi OpenCode", 47), 54, 495, COLORS.light, 11);
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
