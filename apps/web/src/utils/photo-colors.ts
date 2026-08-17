import { Vibrant } from "node-vibrant/browser";
import { type Design, type ImageLayer } from "@mycanvas/shared";

export function paletteCacheKey(layer: ImageLayer): string {
  const crop = layer.crop;
  return `${layer.asset}|${crop ? `${String(crop.x)},${String(crop.y)},${String(crop.width)},${String(crop.height)}` : "full"}`;
}

export interface RankedPhoto {
  layer: ImageLayer;
  /** Top-ranked image whose box covers >95% of the canvas. */
  isBackground: boolean;
}

/**
 * Ranks visible image layers for palette prominence: dominant background
 * coverage, then area, z-order and centrality.
 */
export function rankedPhotoLayers(design: Design): RankedPhoto[] {
  const images = design.layers.filter((layer): layer is ImageLayer => layer.type === "image" && layer.visible);
  const canvasArea = design.width * design.height;
  const maxDist = Math.hypot(design.width / 2, design.height / 2);
  const scored = images.map((layer) => {
    const boxWidth = layer.width * layer.scaleX;
    const boxHeight = layer.height * layer.scaleY;
    const areaFraction = (boxWidth * boxHeight) / canvasArea;
    let score = areaFraction > 0.95 ? 50 : 0;
    score += Math.min(1, areaFraction) * 30;
    score += (design.layers.length > 1 ? design.layers.indexOf(layer) / (design.layers.length - 1) : 0) * 10;
    const dist = Math.hypot(
      layer.x + boxWidth / 2 - design.width / 2,
      layer.y + boxHeight / 2 - design.height / 2,
    );
    score += (1 - Math.min(1, dist / maxDist)) * 10;
    return { layer, score, covers: areaFraction > 0.95 };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.map((entry, index) => ({ layer: entry.layer, isBackground: index === 0 && entry.covers }));
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => {
      resolve(img);
    };
    img.onerror = () => {
      reject(new Error(`Failed to load ${url}`));
    };
    img.src = url;
  });
}

const MAX_SAMPLE_PX = 200;

/** Extracts 5 colors from the displayed region of an image layer (crop-aware). */
export async function extractPalette(layer: ImageLayer): Promise<string[]> {
  const img = await loadImage(`/assets/${layer.asset}`);
  const crop = layer.crop;
  const sourceW = crop ? crop.width : img.naturalWidth;
  const sourceH = crop ? crop.height : img.naturalHeight;
  const sourceX = crop ? crop.x : 0;
  const sourceY = crop ? crop.y : 0;
  const scale = Math.min(1, MAX_SAMPLE_PX / Math.max(sourceW, sourceH));
  const width = Math.max(1, Math.round(sourceW * scale));
  const height = Math.max(1, Math.round(sourceH * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return [];
  }
  ctx.drawImage(img, sourceX, sourceY, sourceW, sourceH, 0, 0, width, height);
  const palette = await Vibrant.from(canvas.toDataURL("image/png")).getPalette();
  const ordered = [palette.Vibrant, palette.Muted, palette.LightVibrant, palette.DarkVibrant, palette.DarkMuted];
  const seen = new Set<string>();
  return ordered
    .filter((swatch): swatch is NonNullable<typeof swatch> => Boolean(swatch))
    .map((swatch) => swatch.hex.toLowerCase())
    .filter((hex) => {
      if (seen.has(hex)) {
        return false;
      }
      seen.add(hex);
      return true;
    });
}
