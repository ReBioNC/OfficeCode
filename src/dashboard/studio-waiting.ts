import type { Point } from "./agent-motion";
import type { StudioSeat } from "./studio-seating";

export interface WaitingSchedule { step: number; pauseUntil?: number }

export function waitingStops(seat: StudioSeat): Point[] {
  if (!seat.id.startsWith("lounge-")) return [];
  const index=Number(seat.id.slice(7));
  const x=948+index%4*116, shift=index>=4?32:0;
  return [{x,y:640+shift},{x,y:976+shift},{x:824,y:860},{...seat.point}];
}

/** Called only for a session still awaiting an actual OpenCode delegation. */
export function waitingDestination(seat: StudioSeat, schedule: WaitingSchedule, now: number, arrived: boolean): Point | undefined {
  const stops=waitingStops(seat);
  if (!stops.length || !arrived) return undefined;
  if (schedule.pauseUntil===undefined) {schedule.pauseUntil=now+3500;return undefined;}
  if (now<schedule.pauseUntil) return undefined;
  const target=stops[schedule.step%stops.length];
  schedule.step++;schedule.pauseUntil=undefined;
  return target;
}
