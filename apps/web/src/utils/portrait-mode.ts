import { type ImageCrop, type ImageLayer } from "@mycanvas/shared";
import { api } from "../api";
import { useEditorStore } from "../store/editorStore";
import { type DepthMap, estimateDepth, loadAssetPixels } from "./bg-removal";

/**
 * Portrait mode: depth-banded background blur. Depth inference runs once per
 * asset+crop (cached); the Strength slider only re-runs the cheap 2D composite
 * and always works from the ORIGINAL asset.
 */

interface PortraitInfo {
  sourceAsset: string;
  crop?: ImageCrop;
  strength: number;
}

const depthCache = new Map<string, DepthMap>();
const portraitAssets = new Map<string, PortraitInfo>();

export function getPortraitInfo(asset: string): PortraitInfo | null {
  return portraitAssets.get(asset) ?? null;
}

function cacheKeyOf(asset: string, crop?: ImageCrop): string {
  return `${asset}|${crop ? `${String(crop.x)},${String(crop.y)},${String(crop.width)},${String(crop.height)}` : "full"}`;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function blurImage(source: HTMLCanvasElement, radius: number): ImageData {
  const canvas = document.createElement("canvas");
  canvas.width = source.width;
  canvas.height = source.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("No 2d context");
  }
  if (radius > 0) {
    ctx.filter = `blur(${String(radius)}px)`;
  }
  ctx.drawImage(source, 0, 0);
  return ctx.getImageData(0, 0, source.width, source.height);
}

/** Blurs a grayscale depth map (feathers band transitions and kills noise). */
function featherDepth(depth: DepthMap, radius: number): Uint8ClampedArray {
  const canvas = document.createElement("canvas");
  canvas.width = depth.width;
  canvas.height = depth.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return depth.data;
  }
  const gray = new ImageData(depth.width, depth.height);
  for (let i = 0; i < depth.data.length; i += 1) {
    const value = depth.data[i] ?? 0;
    gray.data[i * 4] = value;
    gray.data[i * 4 + 1] = value;
    gray.data[i * 4 + 2] = value;
    gray.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(gray, 0, 0);
  const blurred = document.createElement("canvas");
  blurred.width = depth.width;
  blurred.height = depth.height;
  const blurCtx = blurred.getContext("2d");
  if (!blurCtx) {
    return depth.data;
  }
  blurCtx.filter = `blur(${String(radius)}px)`;
  blurCtx.drawImage(canvas, 0, 0);
  const data = blurCtx.getImageData(0, 0, depth.width, depth.height);
  const out = new Uint8ClampedArray(depth.data.length);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = data.data[i * 4] ?? 0;
  }
  return out;
}

/** Composites sharp/mid/far bands through the feathered depth map. */
function composite(source: HTMLCanvasElement, depth: DepthMap, strength: number): Promise<Blob> {
  const mid = blurImage(source, strength / 2);
  const far = blurImage(source, strength);
  const flat = blurImage(source, 0);
  const depthData = featherDepth(depth, 4);
  const { width, height } = source;
  const out = new ImageData(width, height);
  const pixels = out.data;
  const flatData = flat.data;
  const midData = mid.data;
  const farData = far.data;
  const t1 = 85;
  const t2 = 170;
  const feather = 40;
  for (let i = 0; i < width * height; i += 1) {
    // DepthAnything returns disparity: brighter = closer = sharper.
    const d = depthData[i] ?? 0;
    const sharpW = smoothstep(t2 - feather, t2 + feather, d);
    const farW = 1 - smoothstep(t1 - feather, t1 + feather, d);
    const midW = Math.max(0, 1 - sharpW - farW);
    const j = i * 4;
    pixels[j] = sharpW * (flatData[j] ?? 0) + midW * (midData[j] ?? 0) + farW * (farData[j] ?? 0);
    pixels[j + 1] = sharpW * (flatData[j + 1] ?? 0) + midW * (midData[j + 1] ?? 0) + farW * (farData[j + 1] ?? 0);
    pixels[j + 2] = sharpW * (flatData[j + 2] ?? 0) + midW * (midData[j + 2] ?? 0) + farW * (farData[j + 2] ?? 0);
    pixels[j + 3] = 255;
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("No 2d context");
  }
  ctx.putImageData(out, 0, 0);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error("toBlob failed"));
      }
    }, "image/png");
  });
}

export async function applyPortraitMode(layer: ImageLayer, strength: number): Promise<void> {
  const store = useEditorStore.getState();
  if (store.bgRemoval) {
    return;
  }
  // Always composite from the ORIGINAL asset, even when re-strengthening a
  // previously processed layer.
  const existing = portraitAssets.get(layer.asset);
  const sourceAsset = existing?.sourceAsset ?? layer.asset;
  const crop = existing ? existing.crop : layer.crop;
  const cacheKey = cacheKeyOf(sourceAsset, crop);

  store.setBgRemoval({ layerId: layer.id, progress: 0, kind: "portrait" });
  try {
    const { canvas, imageData } = await loadAssetPixels(sourceAsset, crop);
    let depth = depthCache.get(cacheKey);
    if (!depth) {
      depth = await estimateDepth(imageData, (progress) => {
        useEditorStore.getState().setBgRemoval({ layerId: layer.id, progress, kind: "portrait" });
      });
      depthCache.set(cacheKey, depth);
    }
    const blob = await composite(canvas, depth, strength);
    const uploaded = await api.uploadAsset(new File([blob], "portrait.png", { type: "image/png" }));
    portraitAssets.set(uploaded.asset, { sourceAsset, crop, strength });
    const current = useEditorStore.getState();
    current.bumpAssetsVersion();
    current.updateLayer(layer.id, { asset: uploaded.asset, crop: undefined });
  } catch (error) {
    console.error("portrait mode error", error);
    store.showToast("Portrait mode failed.");
  } finally {
    useEditorStore.getState().setBgRemoval(null);
  }
}
