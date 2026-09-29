export interface Point { x: number; y: number }

export function stepToward(from: Point, to: Point, maxDistance: number): Point {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.hypot(dx, dy);
  if (distance <= maxDistance || distance === 0) return { ...to };
  const ratio = maxDistance / distance;
  return { x: from.x + dx * ratio, y: from.y + dy * ratio };
}
