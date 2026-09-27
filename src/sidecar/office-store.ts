import fs from "node:fs";
import path from "node:path";
import { validateOffice, type Office } from "../shared/office-schema.js";

export interface OfficeStore {
  dir: string;
  office: Office;
  occupants: Map<string, string>;
}

export function officeFile(dir: string): string {
  return path.join(dir, "office.json");
}

export function loadOffice(workspaceDir: string): OfficeStore {
  const dir = path.join(workspaceDir, ".officecode");
  fs.mkdirSync(dir, { recursive: true });
  const file = officeFile(dir);
  if (!fs.existsSync(file)) {
    const sample = fs.readFileSync(
      path.join(workspaceDir, ".officecode.sample", "office.json"),
      "utf8",
    );
    fs.writeFileSync(file, sample, "utf8");
  }
  const doc = JSON.parse(fs.readFileSync(file, "utf8") as string) as unknown;
  const res = validateOffice(doc);
  if (res.ok === false) throw new Error(`invalid office.json: ${res.error}`);
  return { dir, office: doc as Office, occupants: new Map() };
}
