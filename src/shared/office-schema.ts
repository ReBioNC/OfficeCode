export interface Floor { id: string; name: string; worktree: string | null }
export interface Room {
  id: string; floorId: string; name: string; color: string;
  paths: string[]; maxDesks: number;
}
export interface Desk { id: string; roomId: string; label: string }
export interface Hallway { id: string; fromRoomId: string; toRoomId: string; open: boolean }
export interface PlacedObject { id: string; roomId: string; kind: string; grants: string[] }
export interface Office {
  version: number; building: string; floors: Floor[]; rooms: Room[];
  desks: Desk[]; hallways: Hallway[]; objects: PlacedObject[]; roster: unknown[];
}

export function validateOffice(doc: unknown): { ok: true } | { ok: false; error: string } {
  if (typeof doc !== "object" || doc === null) return { ok: false, error: "office must be an object" };
  const o = doc as Record<string, unknown>;
  for (const k of ["version", "building", "floors", "rooms", "desks", "hallways", "objects", "roster"]) {
    if (!(k in o)) return { ok: false, error: `office missing key: ${k}` };
  }
  const office = o as unknown as Office;
  if (!Array.isArray(office.floors)) return { ok: false, error: "office.floors must be an array" };
  if (!Array.isArray(office.rooms)) return { ok: false, error: "office.rooms must be an array" };
  if (!Array.isArray(office.desks)) return { ok: false, error: "office.desks must be an array" };
  if (!Array.isArray(office.hallways)) return { ok: false, error: "office.hallways must be an array" };
  if (!Array.isArray(office.objects)) return { ok: false, error: "office.objects must be an array" };
  const floorIds = new Set(office.floors.map((f) => f?.id));
  for (const r of office.rooms) {
    if (!r || typeof r.id !== "string") return { ok: false, error: "room entry must have a string id" };
    if (!floorIds.has(r.floorId)) return { ok: false, error: `room ${r.id} points at missing floor ${r.floorId}` };
  }
  const seen = new Set<string>();
  for (const id of [...office.rooms.map((r) => r.id), ...office.desks.map((d) => d?.id)]) {
    if (typeof id !== "string") return { ok: false, error: "room/desk entry must have a string id" };
    if (seen.has(id)) return { ok: false, error: `duplicate id: ${id}` };
    seen.add(id);
  }
  const roomIds = new Set(office.rooms.map((r) => r.id));
  for (const d of office.desks) {
    if (!roomIds.has(d.roomId)) return { ok: false, error: `desk ${d.id} points at missing room ${d.roomId}` };
  }
  const perRoom = new Map<string, number>();
  for (const d of office.desks) perRoom.set(d.roomId, (perRoom.get(d.roomId) ?? 0) + 1);
  for (const r of office.rooms) {
    if ((perRoom.get(r.id) ?? 0) > r.maxDesks)
      return { ok: false, error: `room ${r.id} exceeds maxDesks ${r.maxDesks}` };
  }
  for (const h of office.hallways) {
    if (!roomIds.has(h.fromRoomId) || !roomIds.has(h.toRoomId))
      return { ok: false, error: `hallway ${h.id} has unknown endpoint room` };
  }
  for (const ob of office.objects) {
    if (!roomIds.has(ob.roomId)) return { ok: false, error: `object ${ob.id} points at missing room ${ob.roomId}` };
  }
  return { ok: true };
}
