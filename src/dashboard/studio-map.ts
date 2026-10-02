import type { Obstacle, Point } from "./agent-motion";

export const STUDIO_WIDTH = 1440;
export const STUDIO_BASE_HEIGHT = 1140;
export const STUDIO_ENTRY: Point = { x: 444, y: 1048 };
export const WORK_DESKS: ReadonlyArray<readonly [number, number]> = [
  [154, 570], [364, 570], [574, 570], [154, 706], [364, 706], [574, 706],
];
export const REVIEW_DESKS: ReadonlyArray<readonly [number, number]> = [
  [920, 268], [1038, 268], [1156, 268], [1274, 268],
];
export const WEB_DESK: readonly [number, number] = [166, 292];
export const OPS_DESK = WORK_DESKS[5];

export interface StudioRoom extends Obstacle { id: string; name: string; color: string; accent: string }
export const STUDIO_ROOMS: readonly StudioRoom[] = [
  { id: "library", name: "LIBRARY", x: 54, y: 150, w: 296, h: 254, color: "#294a62", accent: "#86e5d4" },
  { id: "planning", name: "PLANNING", x: 414, y: 150, w: 376, h: 254, color: "#493455", accent: "#f2a1aa" },
  { id: "review", name: "FOCUS & REVIEW", x: 858, y: 150, w: 528, h: 254, color: "#45406b", accent: "#cbb5f1" },
  { id: "work", name: "CODE WORKSPACE", x: 54, y: 492, w: 736, h: 330, color: "#343660", accent: "#aca9e0" },
  { id: "lobby", name: "LOBBY / RECEPTION", x: 54, y: 856, w: 736, h: 222, color: "#493c60", accent: "#f8be6a" },
  { id: "lounge", name: "LOUNGE / COFFEE", x: 858, y: 492, w: 528, h: 586, color: "#294a62", accent: "#86e5d4" },
];
export const STUDIO_DOORS = [
  { id: "library", x: 236, y: 399, w: 72, axis: "horizontal" },
  { id: "planning", x: 606, y: 399, w: 72, axis: "horizontal" },
  { id: "review", x: 1090, y: 399, w: 72, axis: "horizontal" },
  { id: "work-north", x: 420, y: 496, w: 72, axis: "horizontal" },
  { id: "work-south", x: 606, y: 817, w: 72, axis: "horizontal" },
  { id: "lobby-north", x: 606, y: 860, w: 72, axis: "horizontal" },
  { id: "entry", x: 410, y: 1073, w: 72, axis: "horizontal" },
  { id: "lobby-east", x: 785, y: 944, w: 84, axis: "vertical" },
  { id: "lounge", x: 862, y: 818, w: 84, axis: "vertical" },
] as const;

// Rendering and navigation share walls, with real openings for every door.
export const STUDIO_WALLS: readonly Obstacle[] = STUDIO_ROOMS.flatMap((room) => {
  const result: Obstacle[] = [];
  for (const edge of [
    { x: room.x, y: room.y + 4, w: room.w, axis: "horizontal" },
    { x: room.x, y: room.y + room.h - 5, w: room.w, axis: "horizontal" },
    { x: room.x + 4, y: room.y, w: room.h, axis: "vertical" },
    { x: room.x + room.w - 5, y: room.y, w: room.h, axis: "vertical" },
  ] as const) {
    const horizontal = edge.axis === "horizontal";
    const start = horizontal ? edge.x : edge.y, end = start + edge.w;
    const cuts = STUDIO_DOORS.filter((door) => door.axis === edge.axis && Math.abs(horizontal ? door.y - edge.y : door.x - edge.x) < 2)
      .filter((door) => (horizontal ? door.x : door.y) >= start && (horizontal ? door.x : door.y) < end)
      .sort((a,b) => horizontal ? a.x - b.x : a.y - b.y);
    let cursor = start;
    for (const door of cuts) {
      const at = horizontal ? door.x : door.y;
      if (at > cursor) result.push(horizontal ? {x:cursor,y:edge.y-4,w:at-cursor,h:9} : {x:edge.x-4,y:cursor,w:9,h:at-cursor});
      cursor = at + door.w;
    }
    if (cursor < end) result.push(horizontal ? {x:cursor,y:edge.y-4,w:end-cursor,h:9} : {x:edge.x-4,y:cursor,w:9,h:end-cursor});
  }
  return result;
});

export const STUDIO_FURNITURE: readonly Obstacle[] = [
  ...[...WORK_DESKS,...REVIEW_DESKS,WEB_DESK].map(([x,y]) => ({x,y,w:54,h:36})),
  {x:500,y:273,w:236,h:61}, {x:83,y:210,w:234,h:58}, {x:692,y:627,w:65,h:61},
  {x:118,y:915,w:143,h:36}, {x:292,y:915,w:143,h:36},
  {x:215,y:975,w:116,h:30}, {x:550,y:900,w:184,h:68},
  {x:984,y:538,w:273,h:48}, {x:1290,y:545,w:54,h:86}, {x:1323,y:693,w:29,h:28},
  // Sofa backs are solid; front cushions are usable sitting places.
  {x:950,y:706,w:150,h:24}, {x:1151,y:808,w:150,h:24}, {x:1058,y:769,w:142,h:30},
  {x:936,y:1042,w:129,h:23}, {x:1193,y:1047,w:135,h:23}, {x:574,y:1034,w:136,h:23}, {x:366,y:208,w:18,h:96},
  ...[[295,355],[462,360],[746,363],[892,355],[1343,355],[85,746],[736,752],[111,1026],[398,1028],[744,1009],[923,820],[1289,703],[76,446],[1345,448]]
    .map(([x,y])=>({x:x+8,y:y+15,w:16,h:18})),
];
export const STUDIO_OBSTACLES: readonly Obstacle[] = [...STUDIO_WALLS,...STUDIO_FURNITURE]
  .map((r)=>({x:r.x-12,y:r.y-5,w:r.w+24,h:r.h+10}));
