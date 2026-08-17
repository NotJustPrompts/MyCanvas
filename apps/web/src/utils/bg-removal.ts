import { type ImageCrop, type ImageLayer, defaultShadow } from "@mycanvas/shared";
import { api } from "../api";
import { newLayerId, useEditorStore } from "../store/editorStore";

export interface DepthMap {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

class NoSubjectError extends Error {}

interface JobHandlers {
  resolve: (result: Blob | DepthMap) => void;
  reject: (error: Error) => void;
  onProgress: (progress: number | null) => void;
}

interface WorkerReply {
  jobId: number;
  type: "progress" | "done" | "depth-done" | "error";
  progress?: number | null;
  blob?: Blob;
  width?: number;
  height?: number;
  buffer?: ArrayBuffer;
  code?: string;
  message?: string;
}

let worker: Worker | null = null;
let nextJobId = 1;
const jobs = new Map<number, JobHandlers>();

const cutoutCache = new Map<string, CutoutResult>();

interface CutoutResult {
  asset: string;
  /** Content bounding box within the full cutout frame (cutout pixel space). */
  bbox: { x: number; y: number; width: number; height: number };
  /** Full (untrimmed) cutout frame size — the space `bbox` is expressed in. */
  frameWidth: number;
  frameHeight: number;
}

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL("../workers/bg-removal.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event: MessageEvent<WorkerReply>) => {
      const reply = event.data;
      const handlers = jobs.get(reply.jobId);
      if (!handlers) {
        return;
      }
      if (reply.type === "progress") {
        handlers.onProgress(reply.progress ?? null);
      } else if (reply.type === "done" && reply.blob) {
        jobs.delete(reply.jobId);
        handlers.resolve(reply.blob);
      } else if (reply.type === "depth-done" && reply.buffer) {
        jobs.delete(reply.jobId);
        handlers.resolve({
          width: reply.width ?? 0,
          height: reply.height ?? 0,
          data: new Uint8ClampedArray(reply.buffer),
        });
      } else {
        jobs.delete(reply.jobId);
        handlers.reject(
          reply.code === "no-subject"
            ? new NoSubjectError()
            : new Error(reply.message ?? "Background removal failed"),
        );
      }
    };
    worker.onerror = () => {
      const error = new Error("Background removal worker crashed");
      jobs.forEach((handlers) => {
        handlers.reject(error);
      });
      jobs.clear();
    };
  }
  return worker;
}

function runWorker(imageData: ImageData, onProgress: (progress: number | null) => void): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const jobId = nextJobId;
    nextJobId += 1;
    jobs.set(jobId, { resolve: (result) => { resolve(result as Blob); }, reject, onProgress });
    const buffer = imageData.data.buffer;
    getWorker().postMessage(
      { jobId, kind: "cutout", width: imageData.width, height: imageData.height, buffer },
      [buffer],
    );
  });
}

/** Depth-estimation job (portrait mode): returns a grayscale disparity map. */
export function estimateDepth(
  imageData: ImageData,
  onProgress: (progress: number | null) => void,
): Promise<DepthMap> {
  return new Promise((resolve, reject) => {
    const jobId = nextJobId;
    nextJobId += 1;
    jobs.set(jobId, { resolve: (result) => { resolve(result as DepthMap); }, reject, onProgress });
    const buffer = imageData.data.buffer;
    getWorker().postMessage(
      { jobId, kind: "depth", width: imageData.width, height: imageData.height, buffer },
      [buffer],
    );
  });
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

const MAX_INPUT_PX = 1600;

/** Loads an asset and returns its displayed (crop-respecting, capped) pixels. */
export async function loadAssetPixels(
  asset: string,
  crop?: ImageCrop,
): Promise<{ canvas: HTMLCanvasElement; imageData: ImageData }> {
  const img = await loadImage(`/assets/${asset}`);
  const sourceW = Math.round(crop ? crop.width : img.naturalWidth);
  const sourceH = Math.round(crop ? crop.height : img.naturalHeight);
  const sourceX = crop ? crop.x : 0;
  const sourceY = crop ? crop.y : 0;
  const downscale = Math.min(1, MAX_INPUT_PX / Math.max(sourceW, sourceH));
  const width = Math.max(1, Math.round(sourceW * downscale));
  const height = Math.max(1, Math.round(sourceH * downscale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("No 2d context");
  }
  ctx.drawImage(img, sourceX, sourceY, sourceW, sourceH, 0, 0, width, height);
  return { canvas, imageData: ctx.getImageData(0, 0, width, height) };
}

const TRIM_PADDING = 2;
/** Faint mask residue (alpha 1–8) can smear all the way to the frame edges —
 *  treat it as empty; real content (incl. wispy hair) sits well above it. */
const TRIM_ALPHA_THRESHOLD = 8;
/** A column/row only counts as content with at least this many opaque-ish
 *  pixels — guards against isolated stray pixels above the threshold. */
const TRIM_MIN_MASS = 2;

/**
 * Scans the cutout's alpha channel for its content bounds and crops the PNG to
 * them (plus a tiny padding), so the uploaded asset has no large transparent
 * margins — a full-frame transparent layer would swallow pointer hits meant
 * for layers underneath. Returns null when the mask is empty.
 */
async function trimCutout(blob: Blob): Promise<{
  blob: Blob;
  bbox: { x: number; y: number; width: number; height: number };
  frameWidth: number;
  frameHeight: number;
} | null> {
  const bitmap = await createImageBitmap(blob);
  const frameWidth = bitmap.width;
  const frameHeight = bitmap.height;
  const canvas = document.createElement("canvas");
  canvas.width = frameWidth;
  canvas.height = frameHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return null;
  }
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  const { data } = ctx.getImageData(0, 0, frameWidth, frameHeight);
  const colMass = new Uint32Array(frameWidth);
  const rowMass = new Uint32Array(frameHeight);
  for (let y = 0; y < frameHeight; y += 1) {
    for (let x = 0; x < frameWidth; x += 1) {
      if ((data[(y * frameWidth + x) * 4 + 3] ?? 0) > TRIM_ALPHA_THRESHOLD) {
        colMass[x] = (colMass[x] ?? 0) + 1;
        rowMass[y] = (rowMass[y] ?? 0) + 1;
      }
    }
  }
  let minX = -1;
  let maxX = -1;
  let minY = -1;
  let maxY = -1;
  for (let x = 0; x < frameWidth; x += 1) {
    if ((colMass[x] ?? 0) >= TRIM_MIN_MASS) {
      if (minX < 0) {
        minX = x;
      }
      maxX = x;
    }
  }
  for (let y = 0; y < frameHeight; y += 1) {
    if ((rowMass[y] ?? 0) >= TRIM_MIN_MASS) {
      if (minY < 0) {
        minY = y;
      }
      maxY = y;
    }
  }
  if (maxX < 0 || maxY < 0) {
    return null;
  }
  const bx = Math.max(0, minX - TRIM_PADDING);
  const by = Math.max(0, minY - TRIM_PADDING);
  const bw = Math.min(frameWidth, maxX + 1 + TRIM_PADDING) - bx;
  const bh = Math.min(frameHeight, maxY + 1 + TRIM_PADDING) - by;
  const trimmed = document.createElement("canvas");
  trimmed.width = bw;
  trimmed.height = bh;
  const trimmedCtx = trimmed.getContext("2d");
  if (!trimmedCtx) {
    return null;
  }
  trimmedCtx.drawImage(canvas, bx, by, bw, bh, 0, 0, bw, bh);
  const trimmedBlob = await new Promise<Blob | null>((resolve) => {
    trimmed.toBlob(resolve, "image/png");
  });
  if (!trimmedBlob) {
    return null;
  }
  return { blob: trimmedBlob, bbox: { x: bx, y: by, width: bw, height: bh }, frameWidth, frameHeight };
}

/**
 * Maps a trimmed cutout back onto the source layer: the bbox (in cutout
 * pixels) is scaled into the layer's local frame, then pushed through the
 * layer's scale/rotation so the trimmed content lands exactly where it was.
 */
function cutoutFrame(layer: ImageLayer, result: CutoutResult) {
  const localX = (result.bbox.x / result.frameWidth) * layer.width;
  const localY = (result.bbox.y / result.frameHeight) * layer.height;
  const rad = (layer.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return {
    x: layer.x + layer.scaleX * localX * cos - layer.scaleY * localY * sin,
    y: layer.y + layer.scaleX * localX * sin + layer.scaleY * localY * cos,
    width: (result.bbox.width / result.frameWidth) * layer.width,
    height: (result.bbox.height / result.frameHeight) * layer.height,
  };
}

/**
 * Runs the worker cutout flow for a layer: respects the crop, trims the result
 * to its content bounds, caches per asset+crop, uploads the trimmed PNG as a
 * NEW asset. Returns the cutout asset plus its content bbox, or null after
 * showing a toast on failure.
 */
async function produceCutout(layer: ImageLayer): Promise<CutoutResult | null> {
  const store = useEditorStore.getState();
  const crop = layer.crop;
  const cacheKey = `${layer.asset}|${crop ? `${String(crop.x)},${String(crop.y)},${String(crop.width)},${String(crop.height)}` : "full"}`;

  const cached = cutoutCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  store.setBgRemoval({ layerId: layer.id, progress: 0, kind: "cutout" });
  try {
    const { imageData } = await loadAssetPixels(layer.asset, layer.crop);

    const blob = await runWorker(imageData, (progress) => {
      useEditorStore.getState().setBgRemoval({ layerId: layer.id, progress, kind: "cutout" });
    });

    const trimmed = await trimCutout(blob);
    if (!trimmed) {
      store.showToast("Could not detect a clear subject in this image.");
      return null;
    }

    const file = new File([trimmed.blob], "cutout.png", { type: "image/png" });
    const uploaded = await api.uploadAsset(file);
    const result: CutoutResult = {
      asset: uploaded.asset,
      bbox: trimmed.bbox,
      frameWidth: trimmed.frameWidth,
      frameHeight: trimmed.frameHeight,
    };
    cutoutCache.set(cacheKey, result);
    useEditorStore.getState().bumpAssetsVersion();
    return result;
  } catch (error) {
    console.error("background removal error", error);
    if (error instanceof NoSubjectError) {
      store.showToast("Could not detect a clear subject in this image.");
    } else {
      store.showToast("Background removal failed.");
    }
    return null;
  } finally {
    useEditorStore.getState().setBgRemoval(null);
  }
}

export async function removeLayerBackground(layer: ImageLayer): Promise<void> {
  if (useEditorStore.getState().bgRemoval) {
    return;
  }
  const result = await produceCutout(layer);
  if (result) {
    useEditorStore.getState().updateLayer(layer.id, {
      asset: result.asset,
      crop: undefined,
      // The layer is now an isolated subject — flag it so subject-extraction
      // actions (text behind subject) are no longer offered on it.
      cutout: true,
      ...cutoutFrame(layer, result),
    });
  }
}

/**
 * "Text behind subject": inserts the subject cutout — trimmed to its content
 * bounds so its empty areas don't block selecting layers underneath — as a new
 * image layer exactly over the subject, directly above the topmost text layer
 * sitting above the source (top of stack when there is none). The layer
 * insertion is a single history entry; the async cutout work happens before it.
 */
export async function textBehindSubject(layer: ImageLayer): Promise<void> {
  // Meaningless on an already-isolated subject (also hidden in the UI then).
  if (layer.cutout || useEditorStore.getState().bgRemoval) {
    return;
  }
  const result = await produceCutout(layer);
  if (!result) {
    return;
  }
  const store = useEditorStore.getState();
  const design = store.design;
  if (!design) {
    return;
  }
  const sourceIndex = design.layers.findIndex((entry) => entry.id === layer.id);
  let insertAt = design.layers.length;
  for (let i = design.layers.length - 1; i > sourceIndex; i -= 1) {
    if (design.layers[i]?.type === "text") {
      insertAt = i + 1;
      break;
    }
  }
  const frame = cutoutFrame(layer, result);
  const cutout: ImageLayer = {
    id: newLayerId(),
    type: "image",
    name: "Subject cutout",
    x: frame.x,
    y: frame.y,
    scaleX: layer.scaleX,
    scaleY: layer.scaleY,
    rotation: layer.rotation,
    opacity: layer.opacity,
    visible: true,
    asset: result.asset,
    width: frame.width,
    height: frame.height,
    cutout: true,
    shadow: defaultShadow(),
  };
  store.addLayerAt(cutout, insertAt);
}
