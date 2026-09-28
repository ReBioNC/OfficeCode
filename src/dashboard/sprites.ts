// 2D pixel-art sprites for the top-down office. Maps are string grids:
// '.' = transparent, other chars index into a palette. All maps in a set
// share dimensions (pinned by test/sprites.test.ts).

export type PixelMap = string[];
export type FrameName = "idle" | "walkA" | "walkB" | "work";

export const INK = "#15172F";
export const SKIN = "#F2C19E";
export const HAIR = "#35253F";
export const PANTS = "#34345D";
export const SHOE = "#15172F";
export const EYE = "#15172F";
export const WOOD = "#CB7C78";
export const WOOD_DARK = "#8A506D";
export const SCREEN = "#81E8DA";
export const MONITOR = "#292948";
export const KEY = "#DED9EE";
export const POT = "#D78C76";
export const LEAF = "#6FD3AA";

export type Palette = Record<string, string>;

export const BASE_PALETTE: Palette = {
  O: INK,
  S: SKIN,
  H: HAIR,
  C: "#F8BE6A",
  P: PANTS,
  W: SHOE,
  E: EYE,
};

const ROLE_SHIRTS: Record<string, string> = {
  build: "#FF827D",
  plan: "#C6A2F6",
  explore: "#67DCCB",
  general: "#F8BE6A",
  opencode: "#F8BE6A",
  researcher: "#67DCCB",
  architect: "#C6A2F6",
  tester: "#8ED9A2",
  writer: "#EAA1C4",
  debugger: "#FF827D",
  security: "#F8BE6A",
  "frontend-dev": "#FF827D",
  "backend-dev": "#B49CF0",
  "api-dev": "#67DCCB",
  "database-dev": "#8ED9A2",
  "uiux-designer": "#EAA1C4",
  "qa-engineer": "#8ED9A2",
  reviewer: "#F8BE6A",
  devops: "#F29C75",
  "docs-writer": "#A7ADD5",
  pm: "#FF827D",
};

export function shirtPalette(role: string): Palette {
  const key = role.toLowerCase();
  const colors = ["#FF827D", "#C6A2F6", "#67DCCB", "#F8BE6A", "#EAA1C4", "#F29C75"];
  let hash = 0;
  for (const char of key) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return { ...BASE_PALETTE, C: ROLE_SHIRTS[key] ?? colors[hash % colors.length] };
}

export function agentPalette(role: string, identity: string): Palette {
  let hash = 0;
  for (const char of identity) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  const skins = ["#F2C19E", "#DCA77E", "#B98164", "#805B57", "#F7D7B4"];
  const hairs = ["#35253F", "#6A3F4B", "#A86350", "#27283D", "#D8A066"];
  return { ...shirtPalette(role), S: skins[hash % skins.length], H: hairs[(hash >>> 3) % hairs.length] };
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
  "..LLAA..",
  ".LLAALL.",
  "LLLAAALL",
  ".ALLLLA.",
  "..AALL..",
  "...LL...",
  "..TTUU..",
  "..TTUU..",
  "..TTTT..",
  "..OOOO..",
];

export const PLANT_PALETTE: Palette = {
  O: INK,
  L: LEAF,
  A: "#3E9F89",
  T: POT,
  U: "#A65D76",
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
  W: "#8F92C2",
  G: "#81E8DA",
  P: "#F5E8D7",
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
  W: "#EEE3D6",
  Y: "#F8BE6A",
  G: LEAF,
  B: "#8EA8F1",
  R: "#FF827D",
  T: "#969AC4",
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
  R: "#FF827D",
};

export const SOFA_MAP: PixelMap = [
  "OOOOOOOOOOOOOOOOOOOO",
  "OACCCCCCCCCCCCCCCCAO",
  "OACCCCHHHHHHHCCCCCAO",
  "OACCCOOOCCCCOOOCCCAO",
  "OACCCOOODDDDOOOCCCAO",
  "OACCCCCCCCCCCCCCCCAO",
  "OOOOOOOOOOOOOOOOOOOO",
];

export const SOFA_PALETTE: Palette = {
  O: INK,
  A: "#9A4F70",
  C: "#E9859A",
  H: "#FFC0B1",
  D: "#B86689",
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
