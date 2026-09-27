import { makeEvent } from "../shared/events.js";
import { appendEvent, nextSeq } from "./ledgers.js";
import { settleSpend } from "./budgets.js";
import { loadModels } from "./models.js";
import { createRun, type RunRecord } from "./runs.js";
import type { OfficeStore } from "./office-store.js";
import type { Driver } from "./drivers.js";

export interface RunInput { deskId: string; role: string; prompt: string }
export interface QueueEntry extends RunInput { queuedAt: string }

const pending: QueueEntry[] = [];

export function pendingCount(): number {
  return pending.length;
}

export function pendingList(): QueueEntry[] {
  return [...pending];
}

export type EnqueueResult =
  | { queued: false; run: RunRecord }
  | { queued: true; position: number; deskId: string; role: string };

export async function enqueueOrRun(
  store: OfficeStore,
  workspaceDir: string,
  driver: Driver,
  input: RunInput,
  cap: number,
): Promise<EnqueueResult> {
  if (store.occupants.size < cap) {
    const run = await createRun(store, workspaceDir, driver, input);
    return { queued: false, run };
  }
  pending.push({ ...input, queuedAt: new Date().toISOString() });
  appendEvent(store.dir, makeEvent(nextSeq(store.dir), null, "run.queued", { message: `${input.role}@${input.deskId}` }));
  return { queued: true, position: pending.length, deskId: input.deskId, role: input.role };
}

export async function pumpQueue(
  store: OfficeStore,
  workspaceDir: string,
  makeDriver: () => Driver,
): Promise<void> {
  while (pending.length > 0) {
    const next = pending[0];
    if (store.occupants.has(next.deskId)) break;
    pending.shift();
    try {
      const run = await createRun(store, workspaceDir, makeDriver(), next);
      settleSpend(store.dir, run, loadModels);
    } catch {
      pending.unshift(next);
      break;
    }
  }
}
