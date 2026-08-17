import { type ImageLayer } from "@mycanva/shared";
import { api } from "../api";
import { useEditorStore } from "../store/editorStore";

/**
 * Client side of the background-removal flow: prepares the displayed pixels
 * (respecting the layer crop), hands them to the worker, uploads the cutout
 * as a NEW asset and swaps the layer's asset through the store (so undo/redo
 * and autosave behave like any other edit). A session cache makes re-apply
 * after undo instant.
 */

class NoSubjectError extends Error {}

interface JobHandlers {
  resolve: (blob: Blob) => void;
  reject: (error: Error) => void;
  onProgress: (progress: number | null) => void;
}

interface WorkerReply {
  jobId: number;
  type: "progress" | "done" | "error";
  progress?: number | null;
  blob?: Blob;
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
    jobs.set(jobId, { resolve, reject, onProgress });
    const buffer = imageData.data.buffer;
    getWorker().postMessage(
      { jobId, width: imageData.width, height: imageData.height, buffer },
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

export async function removeLayerBackground(layer: ImageLayer): Promise<void> {
  const store = useEditorStore.getState();
  if (store.bgRemoval) {
    return;
  }
  const crop = layer.crop;
  const cacheKey = `${layer.asset}|${crop ? `${String(crop.x)},${String(crop.y)},${String(crop.width)},${String(crop.height)}` : "full"}`;

  const cached = cutoutCache.get(cacheKey);
  if (cached) {
    store.updateLayer(layer.id, { asset: cached, crop: undefined });
    return;
  }

  store.setBgRemoval({ layerId: layer.id, progress: 0 });
  try {
    const img = await loadImage(`/assets/${layer.asset}`);
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
    const imageData = ctx.getImageData(0, 0, width, height);

    const blob = await runWorker(imageData, (progress) => {
      useEditorStore.getState().setBgRemoval({ layerId: layer.id, progress });
    });

    const file = new File([blob], "cutout.png", { type: "image/png" });
    const uploaded = await api.uploadAsset(file);
    cutoutCache.set(cacheKey, uploaded.asset);
    const current = useEditorStore.getState();
    current.bumpAssetsVersion();
    current.updateLayer(layer.id, { asset: uploaded.asset, crop: undefined });
  } catch (error) {
    console.error("background removal error", error);
    if (error instanceof NoSubjectError) {
      store.showToast("Could not detect a clear subject in this image.");
    } else {
      store.showToast("Background removal failed.");
    }
  } finally {
    useEditorStore.getState().setBgRemoval(null);
  }
}
