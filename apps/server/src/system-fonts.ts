import { readdir } from "node:fs/promises";
import path from "node:path";

import { fontDirs } from "./storage";

const FONT_EXTENSIONS = new Set([".ttf", ".otf", ".ttc", ".dfont"]);

const STYLE_SUFFIXES = [
  "UltraLight", "ExtraLight", "ExtraBold", "SemiBold", "DemiBold",
  "Thin", "Light", "Medium", "Regular", "Bold", "Black", "Heavy",
  "Italic", "Oblique", "Roman", "Narrow", "Condensed", "Extended",
  "Display", "Text", "Mono", "Pro", "Std",
];

function familyFromFileName(fileName: string): string {
  let base = path.basename(fileName, path.extname(fileName));
  // Some fonts ship as "Family-Style" (Google Fonts style), others "Family Style".
  base = base.replace(/[-_]/g, " ");
  let changed = true;
  while (changed) {
    changed = false;
    for (const suffix of STYLE_SUFFIXES) {
      const tail = ` ${suffix}`;
      if (base.length > tail.length && base.endsWith(tail)) {
        base = base.slice(0, -tail.length).trimEnd();
        changed = true;
      }
    }
  }
  return base.trim();
}

let cache: string[] | null = null;

export async function listSystemFonts(): Promise<string[]> {
  if (cache) {
    return cache;
  }
  const families = new Set<string>();
  for (const dir of fontDirs) {
    let entries: string[];
    try {
      entries = await readdir(dir);
    } catch {
      continue; // Directory does not exist or is not readable.
    }
    for (const entry of entries) {
      if (!FONT_EXTENSIONS.has(path.extname(entry).toLowerCase())) {
        continue;
      }
      const family = familyFromFileName(entry);
      if (family.length > 0) {
        families.add(family);
      }
    }
  }
  cache = [...families].sort((a, b) => a.localeCompare(b));
  return cache;
}
