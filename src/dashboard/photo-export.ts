import type { StudioPeriod } from "./studio-theme";

export function exportSize(width: number, height: number, aspect: number) {
  if (![width, height, aspect].every(value => Number.isFinite(value) && value > 0)) return { width: 1, height: 1 };
  const projectedWidth = width * aspect;
  const scale = Math.min(1, 8192 / projectedWidth, 8192 / height, Math.sqrt(16_000_000 / (projectedWidth * height)));
  return { width: Math.max(1, Math.floor(projectedWidth * scale)), height: Math.max(1, Math.floor(height * scale)) };
}
export function photoFilename(period: StudioPeriod, date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `officecode-studio-${period}-${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}.png`;
}
export async function downloadStudioPng(source: HTMLCanvasElement, aspect: number, filename: string) {
  const size = exportSize(source.width, source.height, aspect);
  const output = document.createElement("canvas");
  output.width = size.width; output.height = size.height;
  const context = output.getContext("2d");
  if (!context) throw new Error("Canvas export is unavailable.");
  context.imageSmoothingEnabled = false;
  context.drawImage(source, 0, 0, size.width, size.height);
  const blob = await new Promise<Blob>((resolve, reject) => output.toBlob(value => value ? resolve(value) : reject(new Error("PNG encoding failed.")), "image/png"));
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url; link.download = filename;
  document.body.append(link); link.click(); link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  return size;
}
