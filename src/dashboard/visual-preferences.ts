import { getStudioPeriod, type StudioPeriod } from "./studio-theme";
export interface VisualPreferences { theme: "auto" | StudioPeriod; motion: "full" | "reduced" | "off"; labels: "small" | "normal" | "large"; bubbles: boolean }
const KEY = "officecode.visual-preferences.v1";
interface StorageLike { getItem(key: string): string | null; setItem(key: string, value: string): void }
export function normalizePreferences(value: unknown): VisualPreferences {
  const data = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    theme: ["auto", "morning", "day", "evening", "night"].includes(String(data.theme)) ? data.theme as VisualPreferences["theme"] : "auto",
    motion: ["full", "reduced", "off"].includes(String(data.motion)) ? data.motion as VisualPreferences["motion"] : "full",
    labels: ["small", "normal", "large"].includes(String(data.labels)) ? data.labels as VisualPreferences["labels"] : "normal",
    bubbles: typeof data.bubbles === "boolean" ? data.bubbles : true,
  };
}
export function loadPreferences(storage: StorageLike): VisualPreferences {
  try { return normalizePreferences(JSON.parse(storage.getItem(KEY) || "null")); } catch { return normalizePreferences(null); }
}
export function savePreferences(storage: StorageLike, preferences: VisualPreferences): void {
  try { storage.setItem(KEY, JSON.stringify(preferences)); } catch { /* The view still works when storage is unavailable. */ }
}
export function chosenPeriod(preferences: VisualPreferences, date: Date): StudioPeriod {
  return preferences.theme === "auto" ? getStudioPeriod(date) : preferences.theme;
}
export function motionPolicy(motion: VisualPreferences["motion"], systemReduced: boolean) {
  return { travel: !systemReduced && motion === "full", animate: !systemReduced && motion !== "off", interval: motion === "full" && !systemReduced ? 80 : 250 };
}
