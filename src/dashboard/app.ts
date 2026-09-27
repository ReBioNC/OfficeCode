import { roomRect, deskPoint } from "./layout";
import {
  BOARD_MAP,
  BOARD_PALETTE,
  CHAIR_MAP,
  CHAIR_PALETTE,
  CHAR_FRAMES,
  DESK_MAP,
  DESK_PALETTE,
  INK,
  PLANT_MAP,
  PLANT_PALETTE,
  PRINTER_MAP,
  PRINTER_PALETTE,
  RACK_MAP,
  RACK_PALETTE,
  SCREEN,
  SOFA_MAP,
  SOFA_PALETTE,
  TABLE_MAP,
  TABLE_PALETTE,
  drawSprite,
  frameForState,
  shirtPalette,
  snap,
} from "./sprites";

interface Desk { id: string; roomId: string; label: string }
interface Room { id: string; name: string; color: string }
interface PlacedObject { id: string; roomId: string; kind: string }
interface OfficeDoc { rooms: Room[]; desks: Desk[]; objects: PlacedObject[] }
interface Run { id: string; deskId: string; role: string; state: string; prompt: string }
interface QueueItem { position: number; deskId: string; role: string; prompt: string }

// Warm modern-office palette (2D take on the reference)
const FLOOR_A = "#DCB47E";
const FLOOR_B = "#D2A971";
const WALL_FACE = "#8A7B8C";
const SKY = "#9FD0E8";
const SKY_DARK = "#7FB2D9";
const CITY = "#5B6B7C";
const CITY_LIT = "#F2E6B8";
const PLATE = "#262033";
const PAPER = "#FFF6E5";
const PX = 2;

const CARPETS: Record<string, string> = {
  blue: "#7FB2E5",
  green: "#8FD0A0",
  red: "#E58F8F",
  purple: "#B79FE5",
};

const ROLE_PILL: Record<string, string> = {
  pm: "#E05C5C",
  "uiux-designer": "#E08BB8",
  "frontend-dev": "#4A90D9",
  "backend-dev": "#9B51E0",
  "api-dev": "#2FA8A0",
  "database-dev": "#2F7B4F",
  devops: "#E08A3C",
  "qa-engineer": "#27AE60",
  reviewer: "#C9A227",
  "docs-writer": "#8A8FA3",
};

const BUBBLE_TEXT: Record<string, (run: Run) => string | null> = {
  thinking: () => "Berpikir…",
  acting: (run) => `Menjalankan: ${run.prompt.slice(0, 30)}`,
  blocked: () => "Butuh bantuan ❗",
  delivering: () => "Mengantar 📦",
  done: () => "Selesai ✅",
};

const canvas = document.getElementById("floor") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;
ctx.imageSmoothingEnabled = false;
const statActive = document.getElementById("statActive") as HTMLSpanElement;
const statQueue = document.getElementById("statQueue") as HTMLSpanElement;
const statSpent = document.getElementById("statSpent") as HTMLSpanElement;
const queueUl = document.getElementById("queue") as HTMLUListElement;
const lastRun = document.getElementById("lastRun") as HTMLParagraphElement;
const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

let office: OfficeDoc = { rooms: [], desks: [], objects: [] };
let occupants: Record<string, string> = {};
let runs: Run[] = [];

async function snapshot(): Promise<void> {
  const res = await fetch("/api/office");
  const data = (await res.json()) as { office: OfficeDoc; occupants: Record<string, string> };
  office = data.office;
  occupants = data.occupants;
  const rr = await fetch("/api/runs");
  runs = ((await rr.json()) as { runs: Run[] }).runs;
  const qr = await fetch("/api/queue");
  const queue = ((await qr.json()) as { queue: QueueItem[] }).queue;
  const br = await fetch("/api/budgets");
  const budget = (await br.json()) as { spentEstimated: number };
  const active = runs.filter((r) => !["done", "blocked"].includes(r.state)).length;
  statActive.textContent = String(active);
  statQueue.textContent = String(queue.length);
  statSpent.textContent = `$${budget.spentEstimated.toFixed(4)} (est.)`;
  queueUl.textContent = "";
  for (const q of queue) {
    const li = document.createElement("li");
    li.textContent = `#${q.position} ${q.role} → ${q.deskId}`;
    queueUl.appendChild(li);
  }
  const finished = [...runs].reverse().find((r) => r.state === "done");
  lastRun.textContent = finished ? `Terakhir selesai: ${finished.role} (${finished.id})` : "Belum ada run selesai.";
  draw();
}

function plate(text: string, x: number, y: number): void {
  ctx.font = "10px 'Courier New', monospace";
  const w = ctx.measureText(text).width + 12;
  ctx.fillStyle = PLATE;
  ctx.fillRect(snap(x), snap(y), snap(w), 18);
  ctx.fillStyle = PAPER;
  ctx.fillText(text, snap(x + 6), snap(y + 4));
}

function windows(): void {
  // sky band with sun, city skyline, and glass mullions
  ctx.fillStyle = SKY;
  ctx.fillRect(6, 6, canvas.width - 12, 64);
  ctx.fillStyle = SKY_DARK;
  ctx.fillRect(6, 44, canvas.width - 12, 26);
  ctx.fillStyle = "#F2D24B";
  ctx.fillRect(canvas.width - 90, 16, 18, 18);
  const city = [26, 40, 32, 48, 36, 44, 30, 52, 38, 42, 34, 50, 28, 46, 36];
  let x = 14;
  for (let i = 0; i < city.length && x < canvas.width - 20; i++) {
    const h = city[i];
    ctx.fillStyle = CITY;
    ctx.fillRect(x, 70 - h, 30, h);
    ctx.fillStyle = CITY_LIT;
    for (let wy = 70 - h + 4; wy < 66; wy += 8) {
      for (let wx = x + 4; wx < x + 26; wx += 8) {
        if ((wx + wy + i) % 3 === 0) ctx.fillRect(wx, wy, 3, 4);
      }
    }
    x += 34;
  }
  ctx.fillStyle = INK;
  for (let mx = 6; mx <= canvas.width - 6; mx += 60) ctx.fillRect(mx, 6, 3, 64);
  ctx.fillRect(6, 67, canvas.width - 12, 3);
  // wall clock on the right
  const cx = canvas.width - 46;
  const cy = 38;
  ctx.fillStyle = PAPER;
  ctx.beginPath();
  ctx.arc(cx, cy, 13, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = INK;
  ctx.fillRect(cx - 1, cy - 9, 2, 10);
  ctx.fillRect(cx - 1, cy - 1, 7, 2);
}

function checker(x0: number, y0: number, w: number, h: number, cell: number): void {
  for (let y = 0; y * cell < h; y++) {
    for (let x = 0; x * cell < w; x++) {
      ctx.fillStyle = (x + y) % 2 === 0 ? FLOOR_A : FLOOR_B;
      ctx.fillRect(snap(x0 + x * cell), snap(y0 + y * cell), cell, cell);
    }
  }
}

function drawRoom(room: Room, i: number, runById: Map<string, Run>, tick: number): void {
  const r = roomRect(i, canvas.width, office.rooms.length);
  const carpet = CARPETS[room.color] ?? "#E8D9B8";
  // rug under the room
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = carpet;
  ctx.fillRect(snap(r.x - 6), snap(r.y - 6), snap(r.w + 12), snap(r.h + 12));
  ctx.globalAlpha = 1;
  // thin pixel walls with door gap
  ctx.fillStyle = INK;
  ctx.fillRect(snap(r.x - 2), snap(r.y - 2), snap(r.w + 4), 4);
  ctx.fillRect(snap(r.x - 2), snap(r.y + r.h - 2), snap(r.w + 4), 4);
  ctx.fillRect(snap(r.x - 2), snap(r.y - 2), 4, snap(r.h + 4));
  ctx.fillRect(snap(r.x + r.w - 2), snap(r.y - 2), 4, snap(r.h + 4));
  ctx.fillStyle = WALL_FACE;
  ctx.fillRect(snap(r.x), snap(r.y), snap(r.w), 3);
  const doorW = 30;
  checker(snap(r.x + r.w / 2 - doorW / 2), snap(r.y - 2), doorW, 6, 3);
  plate(room.name.toUpperCase(), r.x + 8, r.y + 8);

  // room decor by team
  if (room.name === "Design") {
    drawSprite(ctx, BOARD_MAP, BOARD_PALETTE, snap(r.x + r.w - 52), snap(r.y + 26), 1);
  }
  if (room.name === "Backend") {
    drawSprite(ctx, RACK_MAP, RACK_PALETTE, snap(r.x + r.w - 30), snap(r.y + r.h - 40), 1);
  }
  // placed objects are real capability grants — draw them
  office.objects
    .filter((o) => o.roomId === room.id)
    .forEach((o, oi) => {
      const ox = snap(r.x + 10 + oi * 30);
      const oy = snap(r.y + r.h - 26);
      if (o.kind === "printer") drawSprite(ctx, PRINTER_MAP, PRINTER_PALETTE, ox, oy, 1);
      else {
        ctx.fillStyle = "#A06A35";
        ctx.fillRect(ox, oy, 20, 14);
        ctx.fillStyle = INK;
        ctx.fillRect(ox, oy + 6, 20, 2);
      }
    });

  office.desks
    .filter((d) => d.roomId === room.id)
    .forEach((d, di) => {
      const p = deskPoint(r, di, 3);
      const runId = occupants[d.id];
      const run = runId ? runById.get(runId) : undefined;
      const state = run?.state ?? "off-duty";
      drawSprite(ctx, CHAIR_MAP, CHAIR_PALETTE, p.x - 8, p.y + 26, PX);
      if (state === "acting") {
        ctx.globalAlpha = 0.55;
        ctx.fillStyle = SCREEN;
        ctx.fillRect(snap(p.x - 18 - 6), snap(p.y - 12 - 6), 48, 40);
        ctx.globalAlpha = 1;
      }
      drawSprite(ctx, DESK_MAP, DESK_PALETTE, p.x - 18, p.y - 12, PX);
      ctx.font = "9px 'Courier New', monospace";
      ctx.fillStyle = PAPER;
      ctx.fillText(d.label, snap(p.x - 12), snap(p.y - 24));
      if (run) {
        const frame = frameForState(state, tick);
        const cx = snap(p.x - 12);
        const cy = snap(p.y + 10);
        drawSprite(ctx, CHAR_FRAMES[frame], shirtPalette(run.role), cx, cy, PX);
        // name tag + role pill (reference style)
        ctx.font = "9px 'Courier New', monospace";
        const pillColor = ROLE_PILL[run.role] ?? "#8A8FA3";
        const tagW = ctx.measureText(run.role).width + 10;
        ctx.fillStyle = PLATE;
        ctx.fillRect(snap(cx + 12 - tagW / 2), snap(cy + 30), snap(tagW), 13);
        ctx.fillStyle = pillColor;
        ctx.fillRect(snap(cx + 12 - tagW / 2), snap(cy + 40), snap(tagW), 4);
        ctx.fillStyle = PAPER;
        ctx.fillText(run.role, snap(cx + 12 - tagW / 2 + 5), snap(cy + 31));
        // status bubble
        const say = BUBBLE_TEXT[state]?.(run) ?? null;
        if (say) {
          ctx.font = "10px 'Courier New', monospace";
          const bw = ctx.measureText(say).width + 12;
          const bx = snap(Math.min(Math.max(cx - 10, 8), canvas.width - bw - 8));
          const by = snap(cy - 22);
          ctx.fillStyle = PAPER;
          ctx.fillRect(bx, by, snap(bw), 17);
          ctx.fillStyle = INK;
          ctx.fillRect(bx, by + 15, snap(bw), 2);
          ctx.fillText(say, bx + 6, by + 3);
        }
      }
    });
}

function lounge(): void {
  const y = canvas.height - 66;
  // rug
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = "#B79FE5";
  ctx.fillRect(300, y - 6, 300, 60);
  ctx.globalAlpha = 1;
  drawSprite(ctx, SOFA_MAP, SOFA_PALETTE, 350, y + 8, PX);
  drawSprite(ctx, TABLE_MAP, TABLE_PALETTE, 420, y + 14, PX);
  drawSprite(ctx, PLANT_MAP, PLANT_PALETTE, 270, y + 10, PX);
  drawSprite(ctx, PLANT_MAP, PLANT_PALETTE, 600, y + 10, PX);
  plate("LOUNGE", 306, y - 2);
  // outbox counter
  const done = runs.filter((r) => r.state === "done").length;
  plate(`OUTBOX · ${done}`, 16, y + 18);
  for (let i = 0; i < Math.min(done, 3); i++) {
    ctx.fillStyle = "#A06A35";
    ctx.fillRect(20 + i * 26, y + 40, 22, 14);
    ctx.fillStyle = INK;
    ctx.fillRect(20 + i * 26, y + 46, 22, 2);
  }
}

function draw(): void {
  const tick = REDUCED ? 0 : Math.floor(Date.now() / 350);
  checker(0, 76, canvas.width, canvas.height - 76, 12);
  windows();
  ctx.fillStyle = INK;
  ctx.fillRect(0, canvas.height - 6, canvas.width, 6);
  ctx.fillRect(0, 0, 6, canvas.height);
  ctx.fillRect(canvas.width - 6, 0, 6, canvas.height);
  plate("OFFICECODE HQ · FLOOR 1", 16, 12);
  const runById = new Map(runs.map((r) => [r.id, r]));
  office.rooms.forEach((room, i) => drawRoom(room, i, runById, tick));
  lounge();
}

function connect(): void {
  const src = new EventSource("/api/events");
  src.addEventListener("snapshot", () => {
    void snapshot();
  });
  src.addEventListener("office", () => {
    void snapshot();
  });
  src.onerror = () => {
    src.close();
    setTimeout(() => {
      void snapshot().then(() => connect());
    }, 1000);
  };
}

void snapshot().then(() => {
  connect();
  if (!REDUCED) window.setInterval(draw, 400);
});
