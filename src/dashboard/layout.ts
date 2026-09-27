export interface Rect { x: number; y: number; w: number; h: number }
export interface Point { x: number; y: number }

export function roomRect(index: number, floorW: number, total: number): Rect {
  const gap = 16;
  const w = (floorW - gap * (total + 1)) / total;
  return { x: gap + index * (w + gap), y: 80, w, h: 360 };
}

export function deskPoint(room: Rect, index: number, _total: number): Point {
  void _total;
  const cols = 3;
  const col = index % cols;
  const row = Math.floor(index / cols);
  return { x: room.x + 40 + col * 90, y: room.y + 70 + row * 90 };
}
