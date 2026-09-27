export const RUN_STATES = [
  "off-duty",
  "walking",
  "thinking",
  "acting",
  "delivering",
  "done",
  "blocked",
] as const;
export type RunState = (typeof RUN_STATES)[number];

export type OfficeEventType =
  | "run.created"
  | "run.state"
  | "run.chunk"
  | "run.finished"
  | "office.updated";

export interface OfficeEvent {
  seq: number;
  ts: string;
  runId: string | null;
  type: OfficeEventType;
  state?: RunState;
  message?: string;
}

export function makeEvent(
  seq: number,
  runId: string | null,
  type: OfficeEventType,
  extra: Partial<Pick<OfficeEvent, "state" | "message">> = {},
): OfficeEvent {
  return { seq, ts: new Date().toISOString(), runId, type, ...extra };
}
