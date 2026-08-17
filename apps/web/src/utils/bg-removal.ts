import { type ImageCrop, type ImageLayer, defaultShadow } from "@mycanva/shared";
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

const cutoutCache = new Map<string, string>();

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

/**
 * Runs the worker cutout flow for a layer: respects the crop, caches per
 * asset+crop, uploads the result as a NEW asset. Returns the cutout asset id,
 * or null after showing a toast on failure.
 */
async function produceCutout(layer: ImageLayer): Promise<string | null> {
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

    const file = new File([blob], "cutout.png", { type: "image/png" });
    const uploaded = await api.uploadAsset(file);
    cutoutCache.set(cacheKey, uploaded.asset);
    useEditorStore.getState().bumpAssetsVersion();
    return uploaded.asset;
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
  const asset = await produceCutout(layer);
  if (asset) {
    useEditorStore.getState().updateLayer(layer.id, { asset, crop: undefined });
  }
}

/**
 * "Text behind subject": inserts the subject cutout as a new image layer at
 * the source's exact frame, directly above the topmost text layer sitting
 * above the source (top of stack when there is none). The layer insertion is
 * a single history entry; the async cutout work happens before it.
 */
export async function textBehindSubject(layer: ImageLayer): Promise<void> {
  if (useEditorStore.getState().bgRemoval) {
    return;
  }
  const asset = await produceCutout(layer);
  if (!asset) {
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
  const cutout: ImageLayer = {
    id: newLayerId(),
    type: "image",
    name: "Subject cutout",
    x: layer.x,
    y: layer.y,
    scaleX: layer.scaleX,
    scaleY: layer.scaleY,
    rotation: layer.rotation,
    opacity: layer.opacity,
    visible: true,
    asset,
    width: layer.width,
    height: layer.height,
    shadow: defaultShadow(),
  };
  store.addLayerAt(cutout, insertAt);
}
