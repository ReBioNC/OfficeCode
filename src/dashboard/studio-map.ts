import type { Obstacle } from "./agent-motion";

export const WORK_DESKS: ReadonlyArray<readonly [number, number]> = [
  [208, 342], [346, 355], [77, 348], [452, 413], [264, 431], [90, 440],
];
export const WEB_DESK: readonly [number, number] = [809, 179];
export const OPS_DESK: readonly [number, number] = [741, 424];
export const STUDIO_DOORS = [
  { id: "idea", x: 164, y: 280, w: 72 },
  { id: "planning", x: 402, y: 280, w: 72 },
  { id: "library", x: 732, y: 280, w: 72 },
  { id: "work", x: 138, y: 300, w: 72 },
  { id: "ops", x: 752, y: 300, w: 72 },
] as const;

// This geometry drives both visible partitions and navigation collision.
export const STUDIO_WALLS: readonly Obstacle[] = [
  { x: 49, y: 120, w: 865, h: 6 },
  { x: 43, y: 120, w: 6, h: 166 }, { x: 914, y: 120, w: 6, h: 166 },
  { x: 278, y: 120, w: 8, h: 166 }, { x: 596, y: 120, w: 8, h: 166 },
  { x: 49, y: 280, w: 115, h: 6 }, { x: 236, y: 280, w: 42, h: 6 },
  { x: 286, y: 280, w: 116, h: 6 }, { x: 474, y: 280, w: 122, h: 6 },
  { x: 604, y: 280, w: 128, h: 6 }, { x: 804, y: 280, w: 110, h: 6 },
  { x: 49, y: 300, w: 89, h: 6 }, { x: 210, y: 300, w: 384, h: 6 },
  { x: 606, y: 300, w: 146, h: 6 }, { x: 824, y: 300, w: 90, h: 6 },
  { x: 43, y: 300, w: 6, h: 223 }, { x: 914, y: 300, w: 6, h: 223 },
  { x: 594, y: 300, w: 12, h: 223 },
];

const furniture: readonly Obstacle[] = [
  ...[...WORK_DESKS, WEB_DESK, OPS_DESK].map(([x, y]) => ({ x, y, w: 54, h: 36 })),
  { x: 322, y: 175, w: 235, h: 64 },
  { x: 625, y: 164, w: 89, h: 74 },
  { x: 75, y: 220, w: 60, h: 21 }, { x: 177, y: 228, w: 34, h: 19 },
  { x: 632, y: 356, w: 60, h: 21 }, { x: 721, y: 372, w: 32, h: 14 },
  { x: 842, y: 347, w: 48, h: 49 }, { x: 863, y: 416, w: 30, h: 42 },
  { x: 815, y: 474, w: 24, h: 16 },
  ...[[242, 239], [561, 244], [888, 246], [66, 477], [552, 477], [891, 475]]
    .map(([x, y]) => ({ x, y: y + 12, w: 16, h: 8 })),
];

// Feet need lateral clearance while the upper body can overlap furniture in
// this top-down projection. Doors leave enough room for the widest character.
export const STUDIO_OBSTACLES: readonly Obstacle[] = [...STUDIO_WALLS, ...furniture]
  .map((r) => ({ x: r.x - 12, y: r.y - 5, w: r.w + 24, h: r.h + 10 }));
