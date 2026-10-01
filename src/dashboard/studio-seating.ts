import type { Point } from "./agent-motion";
import { WORK_DESKS, WEB_DESK, OPS_DESK, STUDIO_OBSTACLES } from "./studio-map";

export type OfficeStation = "reading" | "editing" | "web-search" | "terminal" | "thinking" | "delegating" | "approval" | "lounge";
export interface StudioAgent { id: string; station: OfficeStation }
export interface StudioSeat { id: string; point: Point; seated: boolean; computer?: readonly [number, number]; station: OfficeStation }

type Place = Omit<StudioSeat, "station">;
const computerSeat = (desk: readonly [number, number], id: string): Place => ({ id, computer: desk, point: { x: desk[0] + 27, y: desk[1] + 74 }, seated: true });
const computers = [...WORK_DESKS, WEB_DESK, OPS_DESK].map((desk, i) => computerSeat(desk, `computer-${i}`));
const planning: Place[] = [269, 169].flatMap((y, row) => [356, 462, 409, 515].map((x, i) => ({ id: `planning-${row}-${i}`, point: { x, y }, seated: true })));
const reading: Place[] = [750, 804, 858].map((x, i) => ({ id: `reading-${i}`, point: { x, y: 259 }, seated: false }));
const standing: Place[] = [{ x: 145, y: 201 }, { x: 205, y: 207 }, { x: 221, y: 267 }, { x: 650, y: 450 }, { x: 702, y: 464 }, { x: 817, y: 453 }]
  .map((point, i) => ({ id: `standing-${i}`, point, seated: false }));
const allPlaces = [...computers, ...planning, ...reading, ...standing];

const group = (station: OfficeStation): string => station === "delegating" ? "thinking" : station;
export function annexDesk(index: number): readonly [number, number] {
  return [100 + index % 4 * 200, 590 + Math.floor(index / 4) * 130];
}
export function studioHeight(seats: ReadonlyMap<string, StudioSeat>): number {
  const lowest = Math.max(0, ...[...seats.values()].map((seat) => seat.point.y));
  return lowest <= 516 ? 560 : 560 + Math.ceil((lowest - 560) / 130) * 130;
}
export function studioGeometry(seats: ReadonlyMap<string, StudioSeat>, minimumHeight = 560) {
  const height = Math.max(studioHeight(seats), minimumHeight);
  const extraDesks = Array.from({ length: (height - 560) / 130 * 4 }, (_, i) => annexDesk(i));
  const obstacles = extraDesks.length ? [...STUDIO_OBSTACLES, ...extraDesks.map(([x, y]) => ({ x: x - 12, y: y - 5, w: 78, h: 46 }))] : STUDIO_OBSTACLES;
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
      : station === "reading" ? reading
        : station === "approval" || station === "lounge" ? standing
          : station === "web-search" ? [computers[6], ...computers]
            : station === "terminal" ? [computers[7], ...computers] : computers;
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
