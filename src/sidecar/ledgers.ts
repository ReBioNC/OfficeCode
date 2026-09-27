import fs from "node:fs";
import path from "node:path";
import type { OfficeEvent } from "../shared/events.js";

export function eventsPath(dir: string): string {
  return path.join(dir, "events.jsonl");
}

export function appendEvent(dir: string, event: OfficeEvent): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(eventsPath(dir), JSON.stringify(event) + "\n", "utf8");
}

export function replay(dir: string): OfficeEvent[] {
  const file = eventsPath(dir);
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, "utf8")
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as OfficeEvent);
}

export function nextSeq(dir: string): number {
  return replay(dir).length + 1;
}
