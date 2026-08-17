import { type Design } from "@mycanvas/shared";

/**
 * Normalizes "#rgb", "#rrggbb" and "rgb(r, g, b)" to lowercase "#rrggbb".
 * Returns null for anything else.
 */
export function normalizeColor(input: string): string | null {
  const value = input.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(value)) {
    return value;
  }
  if (/^#[0-9a-f]{3}$/.test(value)) {
    return `#${value
      .slice(1)
      .split("")
      .map((char) => char + char)
      .join("")}`;
  }
  const rgb = /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/.exec(value);
  if (rgb) {
    const parts = [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
    if (parts.every((part) => part <= 255)) {
      return `#${parts.map((part) => part.toString(16).padStart(2, "0")).join("")}`;
    }
  }
  return null;
}

/** Colors used anywhere in the open design, deduped case-insensitively, first-use order. */
export function collectDesignColors(design: Design): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (color: string | undefined) => {
    if (!color) {
      return;
    }
    const normalized = color.toLowerCase();
    if (!seen.has(normalized)) {
      seen.add(normalized);
      out.push(normalized);
    }
  };
  add(design.background === "transparent" ? undefined : design.background);
  for (const layer of design.layers) {
    if (layer.type === "text" || layer.type === "rect") {
      add(layer.fill);
      add(layer.stroke.enabled ? layer.stroke.color : undefined);
    }
    if (layer.type === "line") {
      add(layer.strokeColor);
    }
    if (layer.type !== "frame") {
      add(layer.shadow.enabled ? layer.shadow.color : undefined);
    }
  }
  return out;
}

export const DEFAULT_PALETTE = [
  "#1a1a22",
  "#6b6b76",
  "#ffffff",
  "#dc2626",
  "#ea580c",
  "#d97706",
  "#16a34a",
  "#14b8a6",
  "#2563eb",
  "#7c3aed",
];
