import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { makeEvent, type RunState } from "../shared/events.js";
import { appendEvent, nextSeq } from "./ledgers.js";
import type { OfficeStore } from "./office-store.js";
import type { Driver } from "./drivers.js";

export interface RunRecord {
  id: string;
  deskId: string;
  role: string;
  prompt: string;
  state: RunState;
  sessionId?: string;
  activity?: string;
  detail?: string;
  transcriptPath: string;
  outboxDir: string;
  exitCode: number | null;
}

const runs = new Map<string, RunRecord>();
let settled: (() => void) | null = null;
let runUpdate: ((run: RunRecord) => void) | null = null;

export function setOnSettled(cb: () => void): void {
  settled = cb;
}

export function setOnRunUpdate(cb: (run: RunRecord) => void): void {
  runUpdate = cb;
}

function notifyRun(run: RunRecord): void {
  try {
    runUpdate?.(run);
  } catch {
    // A disconnected observer must not interrupt a real run.
  }
}

export function getRun(_store: OfficeStore, id: string): RunRecord | undefined {
  void _store;
  return runs.get(id);
}

export function listRuns(): RunRecord[] {
  return [...runs.values()];
}

// --- Mirror: external opencode sessions projected as characters ---
// Every state here comes from a real opencode event forwarded by the
// project plugin. Nothing is simulated.

const mirrorBySession = new Map<string, string>();

export function getMirrorRun(sessionId: string): RunRecord | undefined {
  const id = mirrorBySession.get(sessionId);
  return id ? runs.get(id) : undefined;
}

function firstFreeDesk(store: OfficeStore): string | null {
  for (const room of store.office.rooms) {
    for (const desk of store.office.desks) {
      if (desk.roomId === room.id && !store.occupants.has(desk.id)) return desk.id;
    }
  }
  return null;
}

function notFound(sessionId: string): Error & { code: number } {
  const err = new Error(`unknown mirrored session: ${sessionId} (404)`) as Error & { code: number };
  err.code = 404;
  return err;
}

export async function registerMirrorRun(
  store: OfficeStore,
  workspaceDir: string,
  input: { sessionId: string; role: string; prompt: string },
): Promise<RunRecord> {
  const existing = getMirrorRun(input.sessionId);
  if (existing) {
    if (input.prompt && input.prompt !== "OpenCode session") existing.prompt = input.prompt.slice(0, 200);
    if (input.role && input.role !== "opencode") existing.role = input.role.slice(0, 48);
    notifyRun(existing);
    return existing;
  }
  // Mirrored sessions own virtual rooms in the dashboard. Sample desks are
  // only a compatibility fallback and must never limit OpenCode sessions.
  const deskId = firstFreeDesk(store) ?? `session-${crypto.createHash("sha256").update(input.sessionId).digest("hex").slice(0, 12)}`;
  const id = `mirror-${crypto.randomBytes(4).toString("hex")}`;
  store.occupants.set(deskId, id);
  const run: RunRecord = {
    id,
    deskId,
    role: input.role || "opencode",
    prompt: input.prompt || "opencode session",
    state: "walking",
    sessionId: input.sessionId,
    activity: "arriving",
    detail: "Setting up workspace",
    transcriptPath: path.join(store.dir, "transcripts", `${id}.md`),
    outboxDir: path.join(store.dir, "outbox", id),
    exitCode: null,
  };
  runs.set(id, run);
  mirrorBySession.set(input.sessionId, id);
  notifyRun(run);
  appendEvent(store.dir, makeEvent(nextSeq(store.dir), id, "run.created", { state: "walking", message: `mirror ${input.sessionId}` }));
  fs.mkdirSync(path.dirname(run.transcriptPath), { recursive: true });
  fs.appendFileSync(run.transcriptPath, `# ${id} (mirror ${input.sessionId} @ ${deskId})\n\n> ${run.prompt}\n`, "utf8");
  return run;
}

export async function mirrorEvent(
  store: OfficeStore,
  sessionId: string,
  event: { state: RunState; message?: string; prompt?: string; role?: string; activity?: string; detail?: string },
): Promise<RunRecord> {
  const run = getMirrorRun(sessionId);
  if (!run) throw notFound(sessionId);
  if (event.prompt) run.prompt = event.prompt;
  if (event.role) run.role = event.role.slice(0, 48);
  if (event.activity) run.activity = event.activity;
  if (event.detail !== undefined) run.detail = event.detail.slice(0, 160);
  if (event.message) {
    fs.appendFileSync(run.transcriptPath, `\n[${run.state}→${event.state}] ${event.message}\n`, "utf8");
  }
  setState(store, run, event.state, event.message);
  return run;
}

export async function finishMirrorRun(
  store: OfficeStore,
  sessionId: string,
  outcome: "done" | "blocked",
  message?: string,
): Promise<RunRecord> {
  const run = getMirrorRun(sessionId);
  if (!run) throw notFound(sessionId);
  appendEvent(store.dir, makeEvent(nextSeq(store.dir), run.id, "run.finished", { state: outcome }));
  setState(store, run, outcome, message);
  run.activity = outcome;
  run.detail = outcome === "done" ? "Session complete" : "Session stopped";
  store.occupants.delete(run.deskId);
  mirrorBySession.delete(sessionId);
  notifyRun(run);
  if (settled) {
    try {
      settled();
    } catch {
      // pump failures must never break mirror completion
    }
  }
  return run;
}

function setState(store: OfficeStore, run: RunRecord, state: RunState, message?: string): void {
  run.state = state;
  appendEvent(store.dir, makeEvent(nextSeq(store.dir), run.id, "run.state", { state, message }));
  notifyRun(run);
}

export async function createRun(
  store: OfficeStore,
  workspaceDir: string,
  driver: Driver,
  input: { deskId: string; role: string; prompt: string },
): Promise<RunRecord> {
  // Synchronous check-and-claim: atomic within one tick, so concurrent
  // dispatches serialize deterministically and occupants.size is exact.
  if (store.occupants.has(input.deskId)) {
    const err = new Error(`desk ${input.deskId} is occupied (409)`) as Error & { code: number };
    err.code = 409;
    throw err;
  }
  const id = `run-${crypto.randomBytes(4).toString("hex")}`;
  store.occupants.set(input.deskId, id);

  const run: RunRecord = {
    id,
    deskId: input.deskId,
    role: input.role,
    prompt: input.prompt,
    state: "walking",
    transcriptPath: path.join(workspaceDir, ".officecode", "transcripts", `${id}.md`),
    outboxDir: path.join(workspaceDir, "output", "outbox", id),
    exitCode: null,
  };
  runs.set(id, run);
  try {
    appendEvent(store.dir, makeEvent(nextSeq(store.dir), id, "run.created", { state: "walking", message: input.role }));
    notifyRun(run);
    fs.mkdirSync(path.dirname(run.transcriptPath), { recursive: true });
    fs.appendFileSync(run.transcriptPath, `# ${id} (${input.role} @ ${input.deskId})\n\n> ${input.prompt}\n`, "utf8");
    setState(store, run, "thinking");

    let failed = false;
    const code = await driver.start(input.prompt, (e) => {
      if (e.kind === "chunk") {
        if (run.state !== "acting") setState(store, run, "acting");
        fs.appendFileSync(run.transcriptPath, e.text, "utf8");
        appendEvent(store.dir, makeEvent(nextSeq(store.dir), id, "run.chunk", { message: e.text.slice(0, 200) }));
      } else if (e.kind === "error") {
        failed = true;
        fs.appendFileSync(run.transcriptPath, `\n[error] ${e.message}\n`, "utf8");
      }
    });

    run.exitCode = code;
    if (failed || code !== 0) {
      setState(store, run, "blocked", code === 127 ? "missing-cli" : `exit ${code}`);
    } else {
      setState(store, run, "delivering");
      fs.mkdirSync(run.outboxDir, { recursive: true });
      fs.writeFileSync(
        path.join(run.outboxDir, "manifest.json"),
        JSON.stringify({ runId: id, role: input.role, desk: input.deskId, prompt: input.prompt }, null, 2),
        "utf8",
      );
      fs.writeFileSync(path.join(run.outboxDir, "result.md"), fs.readFileSync(run.transcriptPath, "utf8"), "utf8");
      appendEvent(store.dir, makeEvent(nextSeq(store.dir), id, "run.finished", { state: "done" }));
      setState(store, run, "done");
    }
    return run;
  } catch (error) {
    run.exitCode ??= 1;
    if (run.state !== "blocked" && run.state !== "done") {
      try { setState(store, run, "blocked", "internal error"); } catch { run.state = "blocked"; }
    }
    throw error;
  } finally {
    store.occupants.delete(input.deskId);
    notifyRun(run);
    if (settled) {
      try {
        settled();
      } catch {
        // Pump failures must never keep a desk occupied.
      }
    }
  }
}
