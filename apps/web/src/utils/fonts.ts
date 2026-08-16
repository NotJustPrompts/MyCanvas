import { GOOGLE_FONTS } from "@mycanva/shared";

const googleFamilies = new Set(GOOGLE_FONTS.map((font) => font.family));

const loaded = new Set<string>();
const pending = new Map<string, Promise<void>>();

export function isGoogleFont(family: string): boolean {
  return googleFamilies.has(family);
}

/**
 * Ensures a font family is usable for Konva text rendering. Google fonts get
 * a stylesheet injected (once per session); other names are assumed to be
 * installed locally and are just awaited through the Font Loading API.
 */
export function ensureFontLoaded(family: string): Promise<void> {
  const trimmed = family.trim();
  if (!trimmed) {
    return Promise.resolve();
  }
  if (loaded.has(trimmed)) {
    return Promise.resolve();
  }
  const existing = pending.get(trimmed);
  if (existing) {
    return existing;
  }
  if (isGoogleFont(trimmed)) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(trimmed)}:wght@400;700&display=swap`;
    document.head.appendChild(link);
  }
  const promise = Promise.all([
    document.fonts.load(`16px "${trimmed}"`),
    document.fonts.load(`bold 16px "${trimmed}"`),
  ])
    .then(() => {
      loaded.add(trimmed);
      pending.delete(trimmed);
    })
    .catch(() => {
      // Font failed to load (offline, unknown family, ...). Treat as resolved
      // so callers are never stuck waiting.
      loaded.add(trimmed);
      pending.delete(trimmed);
    });
  pending.set(trimmed, promise);
  return promise;
}

/** Loads every font in the given family names, in parallel. */
export function ensureFontsLoaded(families: Iterable<string>): Promise<void> {
  return Promise.all(Array.from(families, (family) => ensureFontLoaded(family))).then(() => undefined);
}
