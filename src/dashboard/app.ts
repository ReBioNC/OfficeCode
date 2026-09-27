import { roomRect, deskPoint } from "./layout";
import {
  CHAIR_MAP,
  CHAIR_PALETTE,
  CHAR_FRAMES,
  DESK_MAP,
  DESK_PALETTE,
  INK,
  PLANT_MAP,
  PLANT_PALETTE,
  SCREEN,
  drawSprite,
  frameForState,
  shirtPalette,
  snap,
} from "./sprites";

interface Desk { id: string; roomId: string; label: string }
interface Room { id: string; name: string; color: string }
interface OfficeDoc { rooms: Room[]; desks: Desk[] }
interface Run { id: string; deskId: string; role: string; state: string }

// Pixel-office palette (warm daylight, ink outlines)
const FLOOR_A = "#DCB47E";
const FLOOR_B = "#D2A971";
const WALL_FACE = "#6E5F7E";
const PLATE = "#262033";
const PAPER = "#FFF6E5";
const PX = 2;

const CARPETS: Record<string, string> = {
  blue: "#7FB2E5",
  green: "#8FD0A0",
  red: "#E58F8F",
  purple: "#B79FE5",
};

const BUBBLES: Record<string, string> = {
  thinking: "💭",
  acting: "⌨️",
  blocked: "❗",
  delivering: "📦",
  done: "✅",
};

const canvas = document.getElementById("floor") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;
ctx.imageSmoothingEnabled = false;
const deskSel = document.getElementById("desk") as HTMLSelectElement;
const runsUl = document.getElementById("runs") as HTMLUListElement;
const transcript = document.getElementById("transcript") as HTMLDivElement;
const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

let office: OfficeDoc = { rooms: [], desks: [] };
let occupants: Record<string, string> = {};
let runs: Run[] = [];

async function snapshot(): Promise<void> {
  const res = await fetch("/api/office");
  const data = (await res.json()) as { office: OfficeDoc; occupants: Record<string, string> };
  office = data.office;
  occupants = data.occupants;
  const rr = await fetch("/api/runs");
  runs = ((await rr.json()) as { runs: Run[] }).runs;
  deskSel.textContent = "";
  for (const d of office.desks) {
    const opt = document.createElement("option");
    opt.value = d.id;
    opt.textContent = `${d.label} (${d.id})`;
    deskSel.appendChild(opt);
  }
  draw();
}

function checker(x0: number, y0: number, w: number, h: number, cell: number): void {
  for (let y = 0; y * cell < h; y++) {
    for (let x = 0; x * cell < w; x++) {
      ctx.fillStyle = (x + y) % 2 === 0 ? FLOOR_A : FLOOR_B;
      ctx.fillRect(snap(x0 + x * cell), snap(y0 + y * cell), cell, cell);
    }
  }
}

function plate(text: string, x: number, y: number): void {
  ctx.font = "10px 'Courier New', monospace";
  const w = ctx.measureText(text).width + 12;
  ctx.fillStyle = PLATE;
  ctx.fillRect(snap(x), snap(y), snap(w), 18);
  ctx.fillStyle = PAPER;
  ctx.fillText(text, snap(x + 6), snap(y + 4));
}

function drawRoom(room: Room, i: number, runById: Map<string, Run>, tick: number): void {
  const r = roomRect(i, canvas.width, office.rooms.length);
  const carpet = CARPETS[room.color] ?? "#E8D9B8";
  ctx.globalAlpha = 0.45;
  ctx.fillStyle = carpet;
  ctx.fillRect(snap(r.x), snap(r.y), snap(r.w), snap(r.h));
  ctx.globalAlpha = 1;
  // pixel wall: ink outline + face, door gap centered on top edge
  ctx.fillStyle = INK;
  ctx.fillRect(snap(r.x - 3), snap(r.y - 3), snap(r.w + 6), snap(r.h + 6));
  ctx.fillStyle = WALL_FACE;
  ctx.fillRect(snap(r.x), snap(r.y), snap(r.w), snap(r.h));
  ctx.fillStyle = carpet;
  ctx.globalAlpha = 0.45;
  ctx.fillRect(snap(r.x + 3), snap(r.y + 3), snap(r.w - 6), snap(r.h - 6));
  ctx.globalAlpha = 1;
  ctx.fillStyle = WALL_FACE; // door gap repainted as wall opening
  const doorW = 34;
  ctx.fillRect(snap(r.x + r.w / 2 - doorW / 2), snap(r.y - 3), doorW, 9);
  checker(snap(r.x + r.w / 2 - doorW / 2), snap(r.y - 3), doorW, 9, 3);
  plate(room.name.toUpperCase(), r.x + 8, r.y + 8);

  office.desks
    .filter((d) => d.roomId === room.id)
    .forEach((d, di) => {
      const p = deskPoint(r, di, 3);
      const runId = occupants[d.id];
      const run = runId ? runById.get(runId) : undefined;
      const state = run?.state ?? "off-duty";
      // chair
      drawSprite(ctx, CHAIR_MAP, CHAIR_PALETTE, p.x - 8, p.y + 26, PX);
      // monitor glow while acting
      if (state === "acting") {
        ctx.globalAlpha = 0.55;
        ctx.fillStyle = SCREEN;
        ctx.fillRect(snap(p.x - 18 - 6), snap(p.y - 12 - 6), 48, 40);
        ctx.globalAlpha = 1;
      }
      // desk (36x24 at PX=2)
      drawSprite(ctx, DESK_MAP, DESK_PALETTE, p.x - 18, p.y - 12, PX);
      ctx.font = "9px 'Courier New', monospace";
      ctx.fillStyle = PAPER;
      ctx.fillText(d.label, snap(p.x - 12), snap(p.y - 24));
      if (run) {
        const frame = frameForState(state, tick);
        const cx = snap(p.x - 12);
        const cy = snap(p.y + 10);
        drawSprite(ctx, CHAR_FRAMES[frame], shirtPalette(run.role), cx, cy, PX);
        const bubble = BUBBLES[state];
        if (bubble) {
          ctx.font = "13px serif";
          ctx.fillStyle = PAPER;
          ctx.fillRect(cx + 20, cy - 16, 20, 18);
          ctx.fillStyle = INK;
          ctx.fillRect(cx + 20, cy - 16, 20, 2);
          ctx.fillText(bubble, cx + 21, cy - 14);
        }
        const tag = run.role.slice(0, 12);
        const tw = ctx.measureText(tag).width + 8;
        ctx.fillStyle = PLATE;
        ctx.fillRect(snap(cx + 12 - tw / 2), snap(cy + 30), snap(tw), 14);
        ctx.fillStyle = PAPER;
        ctx.font = "9px 'Courier New', monospace";
        ctx.fillText(tag, snap(cx + 12 - tw / 2 + 4), snap(cy + 32));
      }
    });
}

function draw(): void {
  const tick = REDUCED ? 0 : Math.floor(Date.now() / 350);
  checker(0, 0, canvas.width, canvas.height, 12);
  // building ink border
  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, canvas.width, 6);
  ctx.fillRect(0, canvas.height - 6, canvas.width, 6);
  ctx.fillRect(0, 0, 6, canvas.height);
  ctx.fillRect(canvas.width - 6, 0, 6, canvas.height);
  plate("OFFICECODE HQ · FLOOR 1", 16, 14);

  const runById = new Map(runs.map((r) => [r.id, r]));
  office.rooms.forEach((room, i) => drawRoom(room, i, runById, tick));

  // plants in bottom corners
  drawSprite(ctx, PLANT_MAP, PLANT_PALETTE, 16, canvas.height - 52, PX);
  drawSprite(ctx, PLANT_MAP, PLANT_PALETTE, canvas.width - 32, canvas.height - 52, PX);

  // outbox counter: parcels for finished runs
  const done = runs.filter((r) => r.state === "done").length;
  const ox = 16;
  const oy = canvas.height - 96;
  ctx.fillStyle = PLATE;
  ctx.fillRect(ox - 6, oy - 22, 110, 20);
  ctx.fillStyle = PAPER;
  ctx.font = "10px 'Courier New', monospace";
  ctx.fillText(`OUTBOX · ${done}`, ox, oy - 18);
  for (let i = 0; i < Math.min(done, 3); i++) {
    ctx.fillStyle = "#A06A35";
    ctx.fillRect(ox + i * 26, oy, 22, 16);
    ctx.fillStyle = INK;
    ctx.fillRect(ox + i * 26, oy + 7, 22, 2);
  }
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

(document.getElementById("dispatch") as HTMLFormElement).addEventListener("submit", (e) => {
  e.preventDefault();
  const deskId = deskSel.value;
  const role = (document.getElementById("role") as HTMLInputElement).value;
  const prompt = (document.getElementById("prompt") as HTMLTextAreaElement).value;
  void fetch("/api/runs", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ deskId, role, prompt }),
  }).then(async (res) => {
    const data = (await res.json()) as { run?: Run; error?: string };
    runsUl.textContent = "";
    const li = document.createElement("li");
    li.textContent = res.ok && data.run ? `${data.run.id} ${data.run.state}` : `error: ${data.error ?? res.status}`;
    runsUl.appendChild(li);
    if (data.run) transcript.textContent = `dispatched ${data.run.id}`;
    await snapshot();
  });
});

void snapshot().then(() => {
  connect();
  if (!REDUCED) window.setInterval(draw, 400);
});
