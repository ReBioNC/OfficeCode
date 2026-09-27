import { roomRect, deskPoint } from "./layout";

interface Desk { id: string; roomId: string; label: string }
interface Room { id: string; name: string; color: string }
interface OfficeDoc { rooms: Room[]; desks: Desk[] }
interface Run { id: string; deskId: string; role: string; state: string }

const canvas = document.getElementById("floor") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;
const deskSel = document.getElementById("desk") as HTMLSelectElement;
const runsUl = document.getElementById("runs") as HTMLUListElement;
const transcript = document.getElementById("transcript") as HTMLDivElement;

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

function draw(): void {
  ctx.fillStyle = "#101828";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  office.rooms.forEach((room, i) => {
    const r = roomRect(i, canvas.width, office.rooms.length);
    ctx.fillStyle = "#1d2939";
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.fillStyle = "#ffffff";
    ctx.fillText(room.name, r.x + 12, r.y + 20);
    office.desks
      .filter((d) => d.roomId === room.id)
      .forEach((d, di) => {
        const p = deskPoint(r, di, 3);
        ctx.fillStyle = occupants[d.id] ? "#f79009" : "#12b76a";
        ctx.fillRect(p.x - 20, p.y - 12, 40, 24);
        ctx.fillStyle = "#ffffff";
        ctx.fillText(d.label, p.x - 14, p.y + 4);
      });
  });
  ctx.fillStyle = "#ffffff";
  runs.slice(-6).forEach((run, i) => {
    ctx.fillText(`${run.role}@${run.deskId}: ${run.state}`, 16, 470 + i * 16);
  });
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

void snapshot().then(() => connect());
