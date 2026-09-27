import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { replay } from "./ledgers.js";
import { loadOffice } from "./office-store.js";
import { selectDriver } from "./drivers.js";
import { createRun, getRun, listRuns } from "./runs.js";

const PUBLIC_DIR = path.resolve("dashboard/public");

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

export async function startServer(workspaceDir: string, port: number): Promise<{
  server: http.Server;
  close: () => Promise<void>;
}> {
  const store = loadOffice(workspaceDir);
  const clients = new Set<http.ServerResponse>();

  const broadcast = (payload: unknown) => {
    const line = `event: office\ndata: ${JSON.stringify(payload)}\n\n`;
    for (const res of clients) res.write(line);
  };

  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (req.method === "GET" && url.pathname === "/api/health") {
      sendJson(res, 200, { ok: true, version: 1 });
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/office") {
      sendJson(res, 200, { office: store.office, occupants: Object.fromEntries(store.occupants) });
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
    if (req.method === "POST" && url.pathname === "/api/runs") {
      let body = "";
      req.on("data", (c: Buffer) => { body += c.toString("utf8"); });
      req.on("end", () => {
        void (async () => {
          try {
            const input = JSON.parse(body) as { deskId?: string; role?: string; prompt?: string };
            if (!input.deskId || !input.role || !input.prompt) {
              sendJson(res, 400, { error: "deskId, role, prompt required" });
              return;
            }
            const run = await createRun(store, workspaceDir, selectDriver(process.env as Record<string, string>), {
              deskId: input.deskId,
              role: input.role,
              prompt: input.prompt,
            });
            broadcast({ runId: run.id, state: run.state });
            sendJson(res, 201, { run });
          } catch (err) {
            const code = (err as Error & { code?: number }).code === 409 ? 409 : 500;
            sendJson(res, code, { error: (err as Error).message });
          }
        })();
      });
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
  return {
    server,
    close: () => new Promise((resolve, reject) => server.close((e) => (e ? reject(e) : resolve()))),
  };
}
