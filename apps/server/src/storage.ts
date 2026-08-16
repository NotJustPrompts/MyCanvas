import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

const serverRoot = path.resolve(import.meta.dirname, "..");

export const dataDir = path.join(serverRoot, "data");
export const designsDir = path.join(dataDir, "designs");
export const assetsDir = path.join(dataDir, "assets");
export const settingsFile = path.join(dataDir, "settings.json");

export const fontDirs = [
  "/System/Library/Fonts",
  "/System/Library/Fonts/Supplemental",
  "/Library/Fonts",
  path.join(homedir(), "Library/Fonts"),
];

export function newId(): string {
  return randomBytes(8).toString("hex");
}

export async function ensureDataDirs(): Promise<void> {
  await mkdir(designsDir, { recursive: true });
  await mkdir(assetsDir, { recursive: true });
}

export function isSafeId(id: string): boolean {
  return /^[a-z0-9-]+$/.test(id);
}

export async function readJsonFile<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as T;
  } catch {
    return null;
  }
}

export async function writeJsonFile(file: string, value: unknown): Promise<void> {
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
