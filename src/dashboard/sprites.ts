// 2D pixel-art sprites for the top-down office. Maps are string grids:
// '.' = transparent, other chars index into a palette. All maps in a set
// share dimensions (pinned by test/sprites.test.ts).

export type PixelMap = string[];
export type FrameName = "idle" | "walkA" | "walkB" | "work";

export const INK = "#262033";
export const SKIN = "#F2C297";
export const HAIR = "#4A3226";
export const PANTS = "#3A4A6B";
export const SHOE = "#262033";
export const EYE = "#262033";
export const WOOD = "#A06A35";
export const WOOD_DARK = "#7C4F24";
export const SCREEN = "#9FF3FF";
export const MONITOR = "#2E3440";
export const KEY = "#D8DEE9";
export const POT = "#C96F4A";
export const LEAF = "#3F8F5F";

export type Palette = Record<string, string>;

export const BASE_PALETTE: Palette = {
  O: INK,
  S: SKIN,
  H: HAIR,
  C: "#E0A83C",
  P: PANTS,
  W: SHOE,
  E: EYE,
};

const ROLE_SHIRTS: Record<string, string> = {
  "frontend-dev": "#4A90D9",
  "backend-dev": "#9B51E0",
  "api-dev": "#2FA8A0",
  "database-dev": "#2F7B4F",
  "uiux-designer": "#E08BB8",
  "qa-engineer": "#27AE60",
  reviewer: "#C9A227",
  devops: "#E08A3C",
  "docs-writer": "#8A8FA3",
  pm: "#E05C5C",
};

export function shirtPalette(role: string): Palette {
  return { ...BASE_PALETTE, C: ROLE_SHIRTS[role] ?? BASE_PALETTE["C"] };
}

const HEAD: PixelMap = [
  "....OOOO....",
  "...OHHHHO...",
  "..OHHHHHHO..",
  "..OSSSSSSO..",
  "..OSESSSEO..",
  "...OSSSSO...",
];

const TORSO_IDLE: PixelMap = [
  "..OOCCCCOO..",
  ".SOCCCCCCOS.",
  ".SOCCCCCCOS.",
  "..OCCCCCCO..",
];

const LEGS_IDLE: PixelMap = [
  "...OPPPPO...",
  "...OPPPPO...",
  "...OWWWWO...",
  "...OWWWWO...",
];

const LEGS_WIDE: PixelMap = [
  "..OPO..OPO..",
  "..OPO..OPO..",
  "..OWO..OWO..",
  "..OWO..OWO..",
];

const LEGS_NARROW: PixelMap = [
  "....OPPO....",
  "....OPPO....",
  "....OWWO....",
  "....OWWO....",
];

const TORSO_WORK: PixelMap = [
  "SSOCCCCCOOSS",
  ".SOCCCCCCOS.",
  ".SOCCCCCCOS.",
  "..OCCCCCCO..",
];

export const CHAR_FRAMES: Record<FrameName, PixelMap> = {
  idle: [...HEAD, ...TORSO_IDLE, ...LEGS_IDLE],
  walkA: [...HEAD, ...TORSO_IDLE, ...LEGS_WIDE],
  walkB: [...HEAD, ...TORSO_IDLE, ...LEGS_NARROW],
  work: [...HEAD, ...TORSO_WORK, ...LEGS_IDLE],
};

export const DESK_MAP: PixelMap = [
  "OOOOOOOOOOOOOOOOOO",
  "OWWWWWWWWWWWWWWWWO",
  "OWWWWWWWWWWWWWWWWO",
  "OWWWOMMMMMMMMWWWWO",
  "OWWWOMGGGGGGMWWWWO",
  "OWWWOMGGGGGGMWWWWO",
  "OWWWOMMMMMMMMWWWWO",
  "OWWWWWWWWWWWWWWWWO",
  "OWWWWKKKKKKWWWWWWO",
  "OWWWWWWWWWWWWWWWWO",
  "OWWWWWWWWWWWWWWWWO",
  "OOOOOOOOOOOOOOOOOO",
];

export const DESK_PALETTE: Palette = {
  O: INK,
  W: WOOD,
  M: MONITOR,
  G: SCREEN,
  K: KEY,
};

export const CHAIR_MAP: PixelMap = [
  "OOOOOOOO",
  "OWWWWWWO",
  "OWWWWWWO",
  ".OWWWWO.",
  "..O..O..",
  "..O..O..",
];

export const CHAIR_PALETTE: Palette = {
  O: INK,
  W: WOOD_DARK,
};

export const PLANT_MAP: PixelMap = [
  "..LLLL..",
  ".LLLLLL.",
  "LLLLLLLL",
  ".LLLLLL.",
  "..LLLL..",
  "...LL...",
  "..TTTT..",
  "..TTTT..",
  "..TTTT..",
  "..OOOO..",
];

export const PLANT_PALETTE: Palette = {
  O: INK,
  L: LEAF,
  T: POT,
};

export const PRINTER_MAP: PixelMap = [
  "..OOOOOOOO..",
  "..OPPPPPPO..",
  ".OWWWWWWWWO.",
  ".OWGGGGGGWO.",
  ".OWWWWWWWWO.",
  ".OOOOOOOOOO.",
  "..OPPPPPPO..",
  "..OOOOOOOO..",
];

export const PRINTER_PALETTE: Palette = {
  O: INK,
  W: "#9AA0B4",
  G: "#7FE0C3",
  P: "#FFFFFF",
};

export const BOARD_MAP: PixelMap = [
  "OOOOOOOOOOOOOOOOOOOO",
  "OWWWWWWWWWWWWWWWWWWO",
  "OWYYWWGGWWBBWWRRWWWO",
  "OWYYWWGGWWBBWWRRWWWO",
  "OWWWWWWWWWWWWWWWWWWO",
  "OWWWWWTTTTTTTTWWWWWO",
  "OWWWWWWWWWWWWWWWWWWO",
  "OOOOOOOOOOOOOOOOOOOO",
];

export const BOARD_PALETTE: Palette = {
  O: INK,
  W: "#F8FAFC",
  Y: "#F2D24B",
  G: LEAF,
  B: "#7FB2E5",
  R: "#E05C5C",
  T: "#9AA0B4",
};

export const RACK_MAP: PixelMap = [
  "OOOOOOOOOO",
  "OMMMMMMMMO",
  "OMGMGRMMMO",
  "OMMMMMMMMO",
  "OMRMGMMGMO",
  "OMMMMMMMMO",
  "OMGMGRMMMO",
  "OMMMMMMMMO",
  "OMRMGMMGMO",
  "OMMMMMMMMO",
  "OMGMGRMMMO",
  "OMMMMMMMMO",
  "OMMMMMMMMO",
  "OOOOOOOOOO",
];

export const RACK_PALETTE: Palette = {
  O: INK,
  M: MONITOR,
  G: SCREEN,
  R: "#E05C5C",
};

export const SOFA_MAP: PixelMap = [
  "OOOOOOOOOOOOOOOOOOOO",
  "OACCCCCCCCCCCCCCCCAO",
  "OACCCCCCCCCCCCCCCCAO",
  "OACCCOOOCCCCOOOCCCAO",
  "OACCCOOOCCCCOOOCCCAO",
  "OACCCCCCCCCCCCCCCCAO",
  "OOOOOOOOOOOOOOOOOOOO",
];

export const SOFA_PALETTE: Palette = {
  O: INK,
  A: "#2F6B4F",
  C: "#48A06B",
};

export const TABLE_MAP: PixelMap = [
  "OOOOOOOOOOOOOOOO",
  "OWWWWWWWWWWWWWWO",
  "OWDDDDDDDDDDDDWO",
  "OWDDDDDDDDDDDDWO",
  "OWDDDDDDDDDDDDWO",
  "OWWWWWWWWWWWWWWO",
  "OOOOOOOOOOOOOOOO",
];

export const TABLE_PALETTE: Palette = {
  O: INK,
  W: WOOD,
  D: WOOD_DARK,
};

export function validateMap(map: PixelMap): { ok: true } | { ok: false; error: string } {
  if (map.length === 0) return { ok: false, error: "empty map" };
  const w = map[0].length;
  for (let i = 0; i < map.length; i++) {
    if (map[i].length !== w) return { ok: false, error: `row ${i} width ${map[i].length} != ${w}` };
    for (const ch of map[i]) {
      if (!".OSHECPWEMGKLTDYBRA".includes(ch)) return { ok: false, error: `row ${i} unknown pixel '${ch}'` };
    }
  }
  return { ok: true };
}

export function frameForState(state: string, tick: number): FrameName {
  if (state === "walking" || state === "delivering") return tick % 2 === 0 ? "walkA" : "walkB";
  if (state === "acting") return "work";
  return "idle";
}

export function snap(v: number): number {
  return Math.round(v);
}

export function drawSprite(
  ctx: {
    fillStyle: string | CanvasGradient | CanvasPattern;
    fillRect: (x: number, y: number, w: number, h: number) => void;
  },
  map: PixelMap,
  palette: Palette,
  dx: number,
  dy: number,
  px: number,
): void {
  for (let y = 0; y < map.length; y++) {
    for (let x = 0; x < map[y].length; x++) {
      const ch = map[y][x];
      if (ch === ".") continue;
      ctx.fillStyle = palette[ch] ?? "#FF00FF";
      ctx.fillRect(snap(dx + x * px), snap(dy + y * px), px, px);
    }
  }
}
