export interface Rect { x: number; y: number; w: number; h: number }
export interface Point { x: number; y: number }

export function roomRect(index: number, floorW: number, total: number): Rect {
  const columns = Math.max(1, Math.min(3, total));
  const margin = 40;
  const gap = 14;
  const width = (floorW - margin * 2 - gap * (columns - 1)) / columns;
  return {
    x: margin + (index % columns) * (width + gap),
    y: 96 + Math.floor(index / columns) * 218,
    w: width,
    h: 202,
  };
}

export function deskPoint(room: Rect, index: number, total: number): Point {
  const columns = Math.max(1, Math.min(2, total));
  const column = index % columns;
  const row = Math.floor(index / columns);
  return {
    x: room.x + (room.w * (column + 1)) / (columns + 1),
    y: room.y + 76 + row * 72,
  };
}
