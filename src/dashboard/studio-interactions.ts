import type { Point } from "./agent-motion";
import type { StudioSeat } from "./studio-seating";
import { STUDIO_ROOMS, STUDIO_BASE_HEIGHT, WORK_DESKS, REVIEW_DESKS, WEB_DESK, type StudioRoom } from "./studio-map";

export function studioRooms(height: number): readonly StudioRoom[] {
  return height <= STUDIO_BASE_HEIGHT ? STUDIO_ROOMS : [...STUDIO_ROOMS, {
    id: "annex", name: "TEAM WORKSPACE", x: 54, y: STUDIO_BASE_HEIGHT, w: 1332, h: height - STUDIO_BASE_HEIGHT - 24,
    color: "#343660", accent: "#aca9e0",
  }];
}
export function roomAt(point: Point, height: number): StudioRoom | undefined {
  return studioRooms(height).find(room => point.x >= room.x && point.x <= room.x + room.w && point.y >= room.y && point.y <= room.y + room.h);
}
export function roomResidents(roomId: string, positions: ReadonlyMap<string, Point>, height: number): string[] {
  return [...positions].filter(([, point]) => roomAt(point, height)?.id === roomId).map(([id]) => id);
}
export function hitComputer(point: Point, seats: ReadonlyMap<string, StudioSeat>, extraDesks: ReadonlyArray<readonly [number, number]>): { desk: readonly [number, number]; sessionId?: string } | undefined {
  const desk = [...WORK_DESKS, ...REVIEW_DESKS, WEB_DESK, ...extraDesks].find(([x, y]) => point.x >= x + 6 && point.x <= x + 48 && point.y >= y - 18 && point.y <= y + 15);
  if (!desk) return undefined;
  const owner = [...seats].find(([, seat]) => seat.computer?.[0] === desk[0] && seat.computer[1] === desk[1]);
  return { desk, sessionId: owner?.[0] };
}
