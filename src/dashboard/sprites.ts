// 2D pixel-art sprites for the top-down office. Maps are string grids:
// '.' = transparent, other chars index into a palette. All maps in a set
// share dimensions (pinned by test/sprites.test.ts).

export type PixelMap = string[];
export type FrameName = "idle" | "walkA" | "walkB" | "work" | "typeA" | "typeB" | "typeC" | "typeD" | "readA" | "readB" | "readSeatA" | "readSeatB" | "watchA" | "watchB" | "talkA" | "talkB";

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
  fullstack: "#67DCCB",
  frontend: "#FF827D",
  backend: "#B49CF0",
  auditor: "#F8BE6A",
  qa: "#8ED9A2",
  "ui/ux": "#EAA1C4",
  database: "#8ED9A2",
  api: "#67DCCB",
  dokumentasi: "#A7ADD5",
  riset: "#67DCCB",
  perencana: "#C6A2F6",
  arsitek: "#C6A2F6",
  developer: "#F8BE6A",
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
  return { ...shirtPalette(role), S: skins[hash % skins.length], H: hairs[(hash >>> 3) % hairs.length],
    A: "#81E8DA", L: "#F7E7D5", J: "#53577D" };
}

export const AVATAR_STYLES = ["Crop", "Bob", "Curls", "Ponytail", "Bun", "Side part",
  "Glasses", "Headset", "Beard", "Cardigan", "Hoodie", "Vest"] as const;
const avatarCache = new WeakMap<PixelMap, Map<string, PixelMap>>();

/** Keep the same model for a session across poses; never change the foot anchor. */
export function avatarFrame(identity: string, base: PixelMap, direction: "north" | "south" | "east" | "west" = "south", model?: number): PixelMap {
  let hash = 2166136261;
  for (const char of identity) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
  const style = model ?? hash % AVATAR_STYLES.length;
  const key = `${style}:${direction}`;
  let poses = avatarCache.get(base);
  if (!poses) { poses = new Map(); avatarCache.set(base, poses); }
  const cached = poses.get(key);
  if (cached) return cached;
  const west = direction === "west";
  const pixels = base.map((row) => [...(west ? [...row].reverse().join("") : row)]);
  const side = direction === "east" || west;
  const face = direction !== "north";
  const put = (x: number, y: number, color: string) => { pixels[y][x] = color; };
  if (style === 0) { for (let x = 4; x < 8; x++) put(x, 2, "S"); }
  if (style === 1) { for (const x of [2, side ? 4 : 9]) for (let y = 3; y <= 6; y++) put(x, y, "H"); }
  if (style === 2) { for (const x of [3, 5, 7, 8]) put(x, 0, "H"); put(2, 2, "H"); put(9, 2, "H"); }
  if (style === 3) { for (let y = 3; y <= 7; y++) put(side ? 2 : 9, y, "H"); put(side ? 2 : 9, 4, "A"); }
  if (style === 4) { put(5, 0, "H"); put(6, 0, "H"); put(5, 1, "A"); }
  if (style === 5) { put(4, 3, "H"); put(5, 3, "H"); put(6, 2, "S"); }
  if (style === 6 && face) { for (let x = side ? 7 : 3; x <= 8; x++) put(x, 4, x === 5 || x === 6 ? "O" : "A"); }
  if (style === 7) { for (let x = 3; x <= 8; x++) put(x, 1, "J"); put(2, 3, "A"); put(side ? 4 : 9, 3, "A"); if (face) put(8, 5, "J"); }
  if (style === 8 && face) { for (let x = side ? 6 : 4; x <= 7; x++) put(x, 5, "H"); }
  for (let y = 6; y <= 9; y++) for (let x = 2; x <= 9; x++) {
    if (pixels[y][x] !== "C") continue;
    if (style === 9 && (x <= 3 || x >= 8)) put(x, y, "J");
    if (style === 10 && y === 6) put(x, y, "L");
    if (style === 11 && (x === 5 || x === 6)) put(x, y, "J");
  }
  if (style === 10) { put(side ? 5 : 4, 7, "L"); put(side ? 7 : 7, 7, "L"); }
  const result = pixels.map((row) => west ? row.reverse().join("") : row.join(""));
  poses.set(key, result);
  return result;
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

// The monitor is north of the chair, so typing frames show the back of the head.
const HEAD_AT_COMPUTER: PixelMap = [
  "....OOOO....",
  "...OHHHHO...",
  "..OHHHHHHO..",
  "..OHHHHHHO..",
  "..OSHHHHSO..",
  "...OSSSSO...",
];

const TORSO_TYPE_A: PixelMap = [
  "..SOCCCCOS..",
  ".SSOCCCCOSS.",
  "..OCCCCCCO..",
  "...OCCCCO...",
];

const TORSO_TYPE_B: PixelMap = [
  ".SSOCCCCOS..",
  "..SOCCCCOSS.",
  "..OCCCCCCO..",
  "...OCCCCO...",
];

const TORSO_TALK_A: PixelMap = [
  "..OOCCCCOO..",
  ".SOCCCCCCOS.",
  "SSOCCCCCCO..",
  "..OCCCCCCO..",
];

const TORSO_TALK_B: PixelMap = [
  "..OOCCCCOO..",
  ".SOCCCCCCOS.",
  "..OCCCCCCOSS",
  "..OCCCCCCO..",
];

const LEGS_SEATED: PixelMap = [
  "..OPPPPPPO..",
  "..OPPPPPPO..",
  "..OWO..OWO..",
  "............",
];

export const CHAR_FRAMES: Record<FrameName, PixelMap> = {
  idle: [...HEAD, ...TORSO_IDLE, ...LEGS_IDLE],
  walkA: [...HEAD, ...TORSO_IDLE, ...LEGS_WIDE],
  walkB: [...HEAD, ...TORSO_IDLE, ...LEGS_NARROW],
  work: [...HEAD, ...TORSO_WORK, ...LEGS_IDLE],
  typeA: [...HEAD_AT_COMPUTER, ...TORSO_TYPE_A, ...LEGS_SEATED],
  typeB: [...HEAD_AT_COMPUTER, ...TORSO_TYPE_B, ...LEGS_SEATED],
  typeC: [...HEAD_AT_COMPUTER, "..SOCCCCOSS.", ".SSOCCCCOS..", "..OCCCCCCO..", "...OCCCCO...", ...LEGS_SEATED],
  typeD: [...HEAD_AT_COMPUTER, ".SSOCCCCOSS.", "..SOCCCCOS..", "..OCCCCCCO..", "...OCCCCO...", ...LEGS_SEATED],
  readA: [...HEAD, "..OOCCCCOO..", "..SOCCCCOS..", "..SSOCCOSS..", "...OCCCCO...", ...LEGS_IDLE],
  readB: [...HEAD, "..OOCCCCOO..", "..SOCCCCOS..", "...SOCCOSS..", "..SOCCCCO...", ...LEGS_IDLE],
  readSeatA: [...HEAD, "..OOCCCCOO..", "..SOCCCCOS..", "..SSOCCOSS..", "...OCCCCO...", ...LEGS_SEATED],
  readSeatB: [...HEAD, "..OOCCCCOO..", "..SOCCCCOS..", "...SOCCOSS..", "..SOCCCCO...", ...LEGS_SEATED],
  watchA: [...HEAD_AT_COMPUTER, "..OOCCCCOO..", "..SOCCCCOS..", "..OCCCCCCO..", "...OCCCCO...", ...LEGS_SEATED],
  watchB: [...HEAD_AT_COMPUTER, "..SOCCCCOO..", "..SOCCCCOS..", "..OCCCCCCO..", "...OCCCCO...", ...LEGS_SEATED],
  talkA: [...HEAD, ...TORSO_TALK_A, ...LEGS_SEATED],
  talkB: [...HEAD, ...TORSO_TALK_B, ...LEGS_SEATED],
};

const HEAD_SIDE: PixelMap = [
  "....OOOO....", "...OHHHHO...", "...OHHSSSO..",
  "...OHHSESO..", "...OSSSSSO..", "....OSSSO...",
];
const TORSO_SIDE: PixelMap = [
  "...OOCCOO...", "...OCCCCOS..", "...OCCCCOS..", "....OCCCO...",
];

function buildWalkFrames(head: PixelMap, side: boolean): PixelMap[] {
  const strides = [0, 1, 2, 1, 0, -1, -2, -1];
  return strides.map((stride, phase) => {
    const pixels = [...head, ...(side ? TORSO_SIDE : TORSO_IDLE), ...Array(4).fill("............")]
      .map((row) => [...row]);
    const armPhase = phase < 4 ? phase : (phase + 2) % 4;
    const left = side ? 4 + stride : 3 + (stride === 2 ? -1 : stride === -2 ? 1 : 0);
    const right = side ? 6 - stride : 7 + (stride === 2 ? 1 : stride === -2 ? -1 : 0);
    for (const [x, bootY] of [[left, 12 + Math.sign(stride)], [right, 12 - Math.sign(stride)]]) {
      for (let y = 10; y <= bootY; y++) {
        pixels[y][x] = y === bootY ? "W" : "P";
        pixels[y][x + 1] = y === bootY ? "W" : "P";
      }
    }
    if (side) {
      pixels[7][9] = pixels[8][9] = ".";
      pixels[6 + armPhase][9] = "S";
      pixels[7 + armPhase][9] = "S";
    } else {
      for (const x of [1, 10]) pixels[7][x] = pixels[8][x] = ".";
      pixels[6 + armPhase][1] = "S";
      pixels[9 - armPhase][10] = "S";
    }
    return pixels.map((row) => row.join(""));
  });
}

const WALK_EAST = buildWalkFrames(HEAD_SIDE, true);
export const WALK_FRAMES: Record<"north" | "south" | "east" | "west", PixelMap[]> = {
  north: buildWalkFrames(HEAD_AT_COMPUTER, false), south: buildWalkFrames(HEAD, false),
  east: WALK_EAST, west: WALK_EAST.map((frame) => frame.map((row) => [...row].reverse().join(""))),
};

export const DESK_MAP: PixelMap = [
  "OOOOOOOOOOOOOOOOOO",
  "OWWWWWWWWWWWWWWWWO",
  "OWWWWWWWWWWWWWWWWO",
  "OWWWWWWWWWWWWWWWWO",
  "OWWWWWWWWWWWWWWWWO",
  "OWWWWWWWWWWWWWWWWO",
  "OWWWWWWWWWWWWWWWWO",
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

export const COMPUTER_MAP: PixelMap = [
  "..OOOOOOOOOO..",
  ".OMMMMMMMMMMO.",
  ".OMGGGGGGGGMO.",
  ".OMGBBBBBBGMO.",
  ".OMGBHHHBBGMO.",
  ".OMGBBBBBBGMO.",
  ".OMGGGGGGGGMO.",
  ".OMMMMMMMMMMO.",
  "..OOOOOOOOOO..",
  ".....OMMO.....",
  "....OOOOOO....",
];

export const COMPUTER_PALETTE: Palette = {
  O: INK,
  M: "#777A9F",
  G: "#88E2DC",
  B: "#36718D",
  H: "#E5F8D9",
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
