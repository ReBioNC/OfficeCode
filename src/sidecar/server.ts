import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { replay } from "./ledgers.js";
import { loadOffice } from "./office-store.js";
import { selectDriver } from "./drivers.js";
import { loadModels, saveModels, detectOpencode, type ModelSlot } from "./models.js";
import { createRun, getRun, listRuns, setOnRunUpdate, setOnSettled } from "./runs.js";
import { registerMirrorRun, mirrorEvent, finishMirrorRun } from "./runs.js";
import { RUN_STATES, type RunState } from "../shared/events.js";
import { enqueueOrRun, pendingList, pumpQueue } from "./queue.js";
import { loadBudgets, saveBudgets, spentToday, overBudget, settleSpend, type BudgetsDoc } from "./budgets.js";
import { loadModels as loadModelSlots } from "./models.js";

const PUBLIC_DIR = path.join(process.env["OFFICECODE_ROOT"] ?? path.resolve(__dirname, "..", "..", ".."), "dashboard", "public");

export interface LeaseOptions {
  ttlMs: number;
  startupGraceMs: number;
  emptyGraceMs: number;
}

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function contentType(file: string): string {
  if (file.endsWith(".html")) return "text/html; charset=utf-8";
  if (file.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (file.endsWith(".css")) return "text/css; charset=utf-8";
  return "application/octet-stream";
}

export async function startServer(workspaceDir: string, port: number, options: { lease?: LeaseOptions } = {}): Promise<{
  server: http.Server;
  close: () => Promise<void>;
}> {
  const store = loadOffice(workspaceDir, process.env["OFFICECODE_DATA_DIR"]);
  const clients = new Set<http.ServerResponse>();
  const leaseManaged = options.lease !== undefined || process.env["OFFICECODE_LEASED"] === "1";
  const leaseOptions = options.lease ?? { ttlMs: 7_000, startupGraceMs: 12_000, emptyGraceMs: 500 };
  const leases = new Map<string, number>();
  let emptySince: number | null = Date.now();
  let hadLease = false;
  let leaseTimer: NodeJS.Timeout | undefined;
  let closing = false;

  const sweepLeases = () => {
    if (!leaseManaged || closing) return;
    const now = Date.now();
    for (const [id, lastSeen] of leases) if (now - lastSeen > leaseOptions.ttlMs) leases.delete(id);
    if (leases.size > 0) { emptySince = null; return; }
    emptySince ??= now;
    const grace = hadLease ? leaseOptions.emptyGraceMs : leaseOptions.startupGraceMs;
    if (now - emptySince < grace) return;
    closing = true;
    if (leaseTimer) clearInterval(leaseTimer);
    for (const client of clients) client.end();
    server.closeAllConnections();
    server.close();
  };

  const broadcast = (payload: unknown) => {
    const line = `event: office\ndata: ${JSON.stringify(payload)}\n\n`;
    for (const res of clients) res.write(line);
  };
  setOnRunUpdate((run) => broadcast({ runId: run.id, state: run.state }));
  setOnSettled(() => {
    void pumpQueue(store, workspaceDir, () => selectDriver(process.env as Record<string, string>))
      .then(() => broadcast({ queueUpdated: true }));
  });

  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (req.method === "GET" && url.pathname === "/api/health") {
      sendJson(res, 200, { ok: true, version: 1, service: "officecode", workspace: path.resolve(workspaceDir), mirrorOnly: process.env["OFFICECODE_MIRROR_ONLY"] === "1", leaseManaged, pid: process.pid });
      return;
    }
    if (url.pathname === "/api/lease" && (req.method === "POST" || req.method === "DELETE")) {
      if (!leaseManaged) { sendJson(res, 404, { error: "not managed" }); return; }
      let body = "";
      req.on("data", (chunk: Buffer) => { if (body.length <= 1024) body += chunk.toString("utf8"); });
      req.on("end", () => {
        try {
          const input = JSON.parse(body) as { id?: unknown };
          if (body.length > 1024 || typeof input.id !== "string" || !/^[a-f0-9]{32}$/.test(input.id)) {
            sendJson(res, 400, { error: "invalid lease id" });
            return;
          }
          if (req.method === "POST") {
            leases.set(input.id, Date.now());
            hadLease = true;
            emptySince = null;
          } else {
            leases.delete(input.id);
            if (leases.size === 0) emptySince = Date.now();
          }
          sendJson(res, 200, { ok: true, activeLeases: leases.size });
        } catch {
          sendJson(res, 400, { error: "invalid JSON body" });
        }
      });
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/office") {
      sendJson(res, 200, { office: store.office, occupants: Object.fromEntries(store.occupants), mirrorOnly: process.env["OFFICECODE_MIRROR_ONLY"] === "1" });
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/runs") {
      sendJson(res, 200, { runs: listRuns() });
      return;
    }
    if (req.method === "GET" && url.pathname.startsWith("/api/runs/")) {
      const id = decodeURIComponent(url.pathname.slice("/api/runs/".length));
      const run = getRun(store, id);
      if (!run) { sendJson(res, 404, { error: "not found" }); return; }
      sendJson(res, 200, { run });
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/models") {
      sendJson(res, 200, loadModels(store.dir));
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/models/opencode") {
      sendJson(res, 200, detectOpencode(workspaceDir));
      return;
    }
    if (req.method === "PUT" && url.pathname === "/api/models") {
      let body = "";
      req.on("data", (c: Buffer) => { body += c.toString("utf8"); });
      req.on("end", () => {
        try {
          const doc = JSON.parse(body) as { slots?: Record<string, ModelSlot> };
          if (!doc || typeof doc.slots !== "object") {
            sendJson(res, 400, { error: "slots object required" });
            return;
          }
          saveModels(store.dir, { version: 1, slots: doc.slots });
          sendJson(res, 200, loadModels(store.dir));
        } catch (err) {
          sendJson(res, 400, { error: (err as Error).message });
        }
      });
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/runs") {
      if (process.env["OFFICECODE_MIRROR_ONLY"] === "1") {
        sendJson(res, 403, { error: "The global dashboard mirrors OpenCode sessions; start tasks in OpenCode." });
        return;
      }
      const MAX_BODY = 1_000_000;
      let body = "";
      let tooLarge = false;
      req.on("data", (c: Buffer) => {
        if (!tooLarge) {
          body += c.toString("utf8");
          if (body.length > MAX_BODY) tooLarge = true;
        }
      });
      req.on("end", () => {
        void (async () => {
          try {
            if (tooLarge) {
              sendJson(res, 413, { error: "body too large (max 1MB)" });
              return;
            }
            let input: { deskId?: string; role?: string; prompt?: string };
            try {
              input = JSON.parse(body) as { deskId?: string; role?: string; prompt?: string };
            } catch {
              sendJson(res, 400, { error: "invalid JSON body" });
              return;
            }
            if (!input.deskId || !input.role || !input.prompt) {
              sendJson(res, 400, { error: "deskId, role, prompt required" });
              return;
            }
            if (overBudget(store.dir)) {
              const spent = spentToday(store.dir);
              sendJson(res, 402, { error: `daily budget cap reached (est. $${spent}). Raise the cap in the Budget panel.` });
              return;
            }
            if (!store.office.desks.some((d) => d.id === input.deskId)) {
              sendJson(res, 404, { error: `unknown desk: ${input.deskId}` });
              return;
            }
            const cap = Number(process.env["OFFICECODE_MAX_CONCURRENT"] ?? 8);
            const outcome = await enqueueOrRun(
              store,
              workspaceDir,
              selectDriver(process.env as Record<string, string>),
              { deskId: input.deskId, role: input.role, prompt: input.prompt },
              Number.isFinite(cap) && cap > 0 ? cap : 8,
            );
            if (outcome.queued) {
              broadcast({ queued: true, position: outcome.position, deskId: outcome.deskId });
              sendJson(res, 202, { queued: true, position: outcome.position, deskId: outcome.deskId, role: outcome.role });
              return;
            }
            settleSpend(store.dir, outcome.run, loadModelSlots);
            broadcast({ runId: outcome.run.id, state: outcome.run.state });
            sendJson(res, 201, { run: outcome.run });
          } catch (err) {
            const code = (err as Error & { code?: number }).code === 409 ? 409 : 500;
            sendJson(res, code, { error: (err as Error).message });
          }
        })();
      });
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/budgets") {
      const config = loadBudgets(store.dir);
      const spent = spentToday(store.dir);
      sendJson(res, 200, { config, spentEstimated: spent, remaining: config.dailyUsdCap - spent });
      return;
    }
    if (req.method === "PUT" && url.pathname === "/api/budgets") {
      let body = "";
      req.on("data", (c: Buffer) => { body += c.toString("utf8"); });
      req.on("end", () => {
        try {
          const doc = JSON.parse(body) as { dailyUsdCap?: unknown; rates?: unknown };
          saveBudgets(store.dir, { version: 1, dailyUsdCap: doc.dailyUsdCap as number, rates: doc.rates as BudgetsDoc["rates"] });
          sendJson(res, 200, loadBudgets(store.dir));
        } catch (err) {
          sendJson(res, 400, { error: (err as Error).message });
        }
      });
      return;
    }
    // Mirror: external opencode sessions projected as characters.
    if ((req.method === "POST" && url.pathname === "/api/mirror/session") ||
        (req.method === "POST" && url.pathname === "/api/mirror/event") ||
        (req.method === "POST" && url.pathname === "/api/mirror/finish")) {
      let body = "";
      req.on("data", (c: Buffer) => { body += c.toString("utf8"); });
      req.on("end", () => {
        void (async () => {
          try {
            const input = JSON.parse(body) as {
              sessionId?: string; role?: string; prompt?: string; parentSessionId?: string;
              state?: string; message?: string; outcome?: string; activity?: string; detail?: string;
            };
            if (!input.sessionId) {
              sendJson(res, 400, { error: "sessionId required" });
              return;
            }
            if (url.pathname === "/api/mirror/session") {
              if (input.parentSessionId !== undefined && (typeof input.parentSessionId !== "string" || input.parentSessionId.length > 200 || input.parentSessionId === input.sessionId)) {
                sendJson(res, 400, { error: "invalid parentSessionId" }); return;
              }
              const run = await registerMirrorRun(store, workspaceDir, {
                sessionId: input.sessionId,
                role: input.role ?? "opencode",
                prompt: input.prompt ?? "opencode session",
                parentSessionId: input.parentSessionId,
              });
              broadcast({ runId: run.id, state: run.state });
              sendJson(res, 201, { run });
              return;
            }
            if (url.pathname === "/api/mirror/event") {
              if (!input.state || !(RUN_STATES as readonly string[]).includes(input.state) || input.state === "off-duty") {
                sendJson(res, 400, { error: `state must be one of: ${(RUN_STATES as readonly string[]).filter((s) => s !== "off-duty").join(", ")}` });
                return;
              }
              const run = await mirrorEvent(store, input.sessionId, {
                state: input.state as RunState,
                message: input.message,
                prompt: input.prompt,
                role: input.role,
                activity: input.activity,
                detail: input.detail,
              });
              broadcast({ runId: run.id, state: run.state });
              sendJson(res, 200, { run });
              return;
            }
            if (input.outcome !== "done" && input.outcome !== "blocked") {
              sendJson(res, 400, { error: 'outcome must be "done" or "blocked"' });
              return;
            }
            const run = await finishMirrorRun(store, input.sessionId, input.outcome, input.message);
            broadcast({ runId: run.id, state: run.state });
            sendJson(res, 200, { run });
          } catch (err) {
            const code = (err as Error & { code?: number }).code;
            sendJson(res, code === 409 ? 409 : code === 404 ? 404 : 500, { error: (err as Error).message });
          }
        })();
      });
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/queue") {      sendJson(res, 200, { queue: pendingList().map((q, i) => ({ position: i + 1, deskId: q.deskId, role: q.role, prompt: q.prompt })) });
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/events") {
      res.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
      });
      res.write(`event: snapshot\ndata: ${JSON.stringify({ events: replay(store.dir).slice(-50) })}\n\n`);
      clients.add(res);
      req.on("close", () => { clients.delete(res); });
      return;
    }
    const file = path.normalize(path.join(PUBLIC_DIR, url.pathname === "/" ? "index.html" : url.pathname.slice(1)));
    if (!file.startsWith(PUBLIC_DIR) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      sendJson(res, 404, { error: "not found" });
      return;
    }
    res.writeHead(200, { "content-type": contentType(file) });
    fs.createReadStream(file).pipe(res);
  });

  await new Promise<void>((resolve) => server.listen(port, "127.0.0.1", resolve));
  if (leaseManaged) {
    leaseTimer = setInterval(sweepLeases, Math.max(50, Math.min(1000, Math.floor(leaseOptions.ttlMs / 4))));
    leaseTimer.unref();
  }
  return {
    server,
    close: () => new Promise((resolve, reject) => {
      if (leaseTimer) clearInterval(leaseTimer);
      server.close((e) => (e ? reject(e) : resolve()));
    }),
  };
}
