import type { Point } from "./agent-motion";
import { WORK_DESKS, REVIEW_DESKS, WEB_DESK, STUDIO_BASE_HEIGHT, STUDIO_OBSTACLES } from "./studio-map";

export type OfficeStation = "reading" | "editing" | "web-search" | "terminal" | "thinking" | "delegating" | "approval" | "lounge" | "arrival" | "review" | "waiting";
export interface StudioAgent { id: string; station: OfficeStation }
export interface StudioSeat { id: string; point: Point; seated: boolean; computer?: readonly [number, number]; station: OfficeStation }

type Place = Omit<StudioSeat, "station">;
const computerSeat = (desk: readonly [number, number], id: string): Place => ({ id, computer: desk, point: { x: desk[0] + 27, y: desk[1] + 74 }, seated: true });
const computers = WORK_DESKS.map((desk, i) => computerSeat(desk, `computer-${i}`));
const review = REVIEW_DESKS.map((desk, i) => computerSeat(desk, `review-${i}`));
const web = [computerSeat(WEB_DESK, "web-0")];
const planning: Place[] = [240, 380].flatMap((y, row) => [530, 585, 640, 695].map((x, i) => ({ id: `planning-${row}-${i}`, point: { x, y }, seated: true })));
const reading: Place[] = [{x:130,y:360},{x:276,y:355},{x:276,y:305}].map((point,i)=>({id:`reading-${i}`,point,seated:false}));
const lounge: Place[] = [{x:980,y:750},{x:1052,y:750},{x:1190,y:852},{x:1260,y:852},{x:960,y:946},{x:1072,y:946},{x:1202,y:946},{x:1314,y:946}]
  .map((point,i)=>({id:`lounge-${i}`,point,seated:i<4}));
const lobby: Place[] = [{x:488,y:1000},{x:528,y:990},{x:374,y:1028},{x:500,y:1036}].map((point,i)=>({id:`lobby-${i}`,point,seated:false}));
const allPlaces = [...computers,...review,...web,...planning,...reading,...lounge,...lobby];
const group = (station: OfficeStation): string => station === "delegating" ? "thinking" : station === "waiting" ? "lounge" : station;
export function annexDesk(index: number): readonly [number, number] {
  return [154 + index % 6 * 210, 1182 + Math.floor(index / 6) * 136];
}
export function studioHeight(seats: ReadonlyMap<string, StudioSeat>): number {
  const lowest = Math.max(0, ...[...seats.values()].map((seat) => seat.point.y));
  return lowest < STUDIO_BASE_HEIGHT ? STUDIO_BASE_HEIGHT : STUDIO_BASE_HEIGHT + Math.ceil((lowest + 30 - STUDIO_BASE_HEIGHT) / 136) * 136;
}
export function studioGeometry(seats: ReadonlyMap<string, StudioSeat>, minimumHeight = STUDIO_BASE_HEIGHT) {
  const height = Math.max(studioHeight(seats), minimumHeight);
  const extraDesks = Array.from({ length: Math.ceil((height - STUDIO_BASE_HEIGHT) / 136) * 6 }, (_, i) => annexDesk(i));
  const obstacles = extraDesks.length ? [...STUDIO_OBSTACLES, ...extraDesks.map(([x,y])=>({x:x-12,y:y-5,w:78,h:46}))] : STUDIO_OBSTACLES;
  return { height, extraDesks, obstacles };
}

// Reserve existing sessions first: arrivals and completions cannot displace them.
// Overflow uses real extra desks instead of wrapping a fixed array of positions.
export function allocateStudioSeats(agents: readonly StudioAgent[], previous: ReadonlyMap<string, StudioSeat> = new Map()): Map<string, StudioSeat> {
  const used = new Set<string>();
  const assigned = new Map<string, StudioSeat>();
  for (const { id, station } of agents) {
    const seat = previous.get(id);
    if (seat && group(seat.station) === group(station) && !used.has(seat.id)) {
      assigned.set(id, { ...seat, station }); used.add(seat.id);
    }
  }
  for (const { id, station } of agents) {
    if (assigned.has(id)) continue;
    const preferred = group(station) === "thinking" ? planning
      : station === "reading" ? [...reading,...web]
        : station === "web-search" ? [...web,...reading]
          : station === "review" ? review
            : station === "waiting" || station === "lounge" ? lounge
              : station === "approval" || station === "arrival" ? lobby : computers;
    let place = [...preferred, ...allPlaces].find((seat) => !used.has(seat.id));
    if (!place) {
      let index = 0;
      while (used.has(`annex-${index}`)) index++;
      place = computerSeat(annexDesk(index), `annex-${index}`);
    }
    assigned.set(id, { ...place, station }); used.add(place.id);
  }
  return assigned;
}
