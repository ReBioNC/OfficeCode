export interface Point { x: number; y: number }
export interface Obstacle { x: number; y: number; w: number; h: number }

const GRID = 4;
const LEFT = 40, TOP = 112, RIGHT = 920, BOTTOM = 516;
const COLS = (RIGHT - LEFT) / GRID + 1, ROWS = (BOTTOM - TOP) / GRID + 1;
const gridCache = new WeakMap<readonly Obstacle[], Uint8Array>();

function inside(point: Point, obstacle: Obstacle): boolean {
  return point.x > obstacle.x && point.x < obstacle.x + obstacle.w
    && point.y > obstacle.y && point.y < obstacle.y + obstacle.h;
}

function walkable(point: Point, obstacles: readonly Obstacle[]): boolean {
  return point.x >= LEFT && point.x <= RIGHT && point.y >= TOP && point.y <= BOTTOM
    && !obstacles.some((obstacle) => inside(point, obstacle));
}

function segmentClear(from: Point, to: Point, obstacles: readonly Obstacle[]): boolean {
  if (!walkable(from, obstacles) || !walkable(to, obstacles)) return false;
  if (from.x !== to.x && from.y !== to.y) return false;
  return !obstacles.some((r) => from.y === to.y
    ? from.y > r.y && from.y < r.y + r.h && Math.max(from.x, to.x) > r.x && Math.min(from.x, to.x) < r.x + r.w
    : from.x > r.x && from.x < r.x + r.w && Math.max(from.y, to.y) > r.y && Math.min(from.y, to.y) < r.y + r.h);
}

function connector(from: Point, to: Point, obstacles: readonly Obstacle[]): Point[] | null {
  for (const bend of [{ x: to.x, y: from.y }, { x: from.x, y: to.y }]) {
    if (segmentClear(from, bend, obstacles) && segmentClear(bend, to, obstacles)) return [bend, to];
  }
  return null;
}

function gridPoint(id: number): Point {
  return { x: LEFT + id % COLS * GRID, y: TOP + Math.floor(id / COLS) * GRID };
}

function gridAnchor(point: Point, obstacles: readonly Obstacle[]): { id: number; link: Point[] } | null {
  const col = Math.round((point.x - LEFT) / GRID), row = Math.round((point.y - TOP) / GRID);
  const candidates: Array<{ id: number; distance: number }> = [];
  for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
    const x = col + dx, y = row + dy;
    if (x < 0 || x >= COLS || y < 0 || y >= ROWS) continue;
    const id = y * COLS + x, p = gridPoint(id);
    candidates.push({ id, distance: Math.abs(p.x - point.x) + Math.abs(p.y - point.y) });
  }
  candidates.sort((a, b) => a.distance - b.distance);
  for (const { id } of candidates) {
    const link = connector(point, gridPoint(id), obstacles);
    if (link) return { id, link };
  }
  return null;
}

// Search a four-neighbor grid. Both endpoint connectors and each edge are
// checked, so rounding a live position cannot cut across a wall or a desk.
export function planRoute(from: Point, to: Point, obstacles: readonly Obstacle[] = []): Point[] | null {
  if (!walkable(from, obstacles) || !walkable(to, obstacles)) return null;
  const start = gridAnchor(from, obstacles), end = gridAnchor(to, obstacles);
  if (!start || !end) return null;
  let grid = gridCache.get(obstacles);
  if (!grid) {
    grid = new Uint8Array(COLS * ROWS);
    for (let id = 0; id < grid.length; id++) grid[id] = walkable(gridPoint(id), obstacles) ? 1 : 0;
    gridCache.set(obstacles, grid);
  }
  const parents = new Int32Array(grid.length).fill(-1);
  const queue = [start.id];
  parents[start.id] = start.id;
  for (let head = 0; head < queue.length && parents[end.id] === -1; head++) {
    const id = queue[head], col = id % COLS;
    const neighbors = [col > 0 ? id - 1 : -1, col + 1 < COLS ? id + 1 : -1, id - COLS, id + COLS];
    for (const next of neighbors) {
      if (next < 0 || next >= grid.length || !grid[next] || parents[next] !== -1) continue;
      if (!segmentClear(gridPoint(id), gridPoint(next), obstacles)) continue;
      parents[next] = id;
      queue.push(next);
    }
  }
  if (parents[end.id] === -1) return null;
  const path: Point[] = [];
  for (let id = end.id; id !== start.id; id = parents[id]) path.push(gridPoint(id));
  path.push(gridPoint(start.id));
  path.reverse();
  const endLink = connector(gridPoint(end.id), to, obstacles);
  if (!endLink) return null;
  const compact: Point[] = [from];
  for (const point of [...start.link, ...path, ...endLink]) {
    const last = compact[compact.length - 1], previous = compact[compact.length - 2];
    if (last.x === point.x && last.y === point.y) continue;
    if (previous && ((previous.x === last.x && last.x === point.x) || (previous.y === last.y && last.y === point.y))) compact.pop();
    compact.push(point);
  }
  return compact.slice(1);
}

export type Direction = "north" | "south" | "east" | "west";

export function advanceRoute(point: Point, route: readonly Point[], distance: number): { point: Point; route: Point[]; direction: Direction } {
  const remaining = [...route];
  let current = point, direction: Direction = "south";
  while (remaining.length && distance > 0) {
    const next = remaining[0], length = Math.hypot(next.x - current.x, next.y - current.y);
    if (length === 0) { remaining.shift(); continue; }
    direction = next.x > current.x ? "east" : next.x < current.x ? "west" : next.y < current.y ? "north" : "south";
    current = stepToward(current, next, distance);
    distance -= length;
    if (current.x === next.x && current.y === next.y) remaining.shift();
  }
  return { point: current, route: remaining, direction };
}

export function stepToward(from: Point, to: Point, maxDistance: number): Point {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.hypot(dx, dy);
  if (distance <= maxDistance || distance === 0) return { ...to };
  const ratio = maxDistance / distance;
  return { x: from.x + dx * ratio, y: from.y + dy * ratio };
}
