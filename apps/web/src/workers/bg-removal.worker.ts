import { AutoConfig, RawImage, pipeline } from "@huggingface/transformers";

/**
 * Background-removal worker: receives raw RGBA pixels, loads briaai/RMBG-1.4
 * (WebGPU, WASM fallback) on first use, runs image segmentation, composites
 * the mask onto the alpha channel and posts back the cutout PNG. Model
 * download progress is forwarded so the UI can show a percentage on first run.
 */

interface JobMessage {
  jobId: number;
  width: number;
  height: number;
  buffer: ArrayBuffer;
}

interface ProgressInfo {
  status?: string;
  file?: string;
  progress?: number;
}

// The DOM lib types `self` as Window; this is a module worker scope.
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<JobMessage>) => void) | null;
  postMessage: (message: unknown, transfer?: Transferable[]) => void;
};

function reply(message: unknown, transfer?: Transferable[]): void {
  if (transfer) {
    scope.postMessage(message, transfer);
  } else {
    scope.postMessage(message);
  }
}

interface SegmentationResult {
  mask: RawImage;
}

type Segmenter = (image: RawImage) => Promise<SegmentationResult[]>;

let segmenterPromise: Promise<Segmenter> | null = null;

function getSegmenter(jobId: number): Promise<Segmenter> {
  segmenterPromise ??= (async () => {
    const progressCallback = (info: ProgressInfo) => {
      if (info.status === "download" || info.status === "progress") {
        reply({
          jobId,
          type: "progress",
          progress: typeof info.progress === "number" ? info.progress / 100 : 0,
        });
      }
    };
    // RMBG-1.4's config declares model_type "SegformerForSemanticSegmentation"
    // verbatim, which transformers.js v4 looks up as "segformer" — patch the
    // config so model-class resolution succeeds (this is how the v3 example ran it).
    const config = await AutoConfig.from_pretrained("briaai/RMBG-1.4");
    config.model_type = "segformer";
    try {
      return await pipeline("image-segmentation", "briaai/RMBG-1.4", {
        config,
        device: "webgpu",
        progress_callback: progressCallback,
      });
    } catch {
      // WebGPU unavailable or failed to initialize — WASM fallback.
      return await pipeline("image-segmentation", "briaai/RMBG-1.4", {
        config,
        device: "wasm",
        progress_callback: progressCallback,
      });
    }
  })();
  return segmenterPromise;
}

/** Mask at arbitrary resolution → grayscale bytes at the target resolution. */
function resizeMask(mask: RawImage, width: number, height: number): Uint8Array | Uint8ClampedArray {
  if (mask.width === width && mask.height === height) {
    return mask.data;
  }
  const source = new OffscreenCanvas(mask.width, mask.height);
  const sourceCtx = source.getContext("2d");
  if (!sourceCtx) {
    throw new Error("No 2d context");
  }
  const gray = new ImageData(mask.width, mask.height);
  for (let i = 0; i < mask.data.length; i += 1) {
    const value = mask.data[i] ?? 0;
    gray.data[i * 4] = value;
    gray.data[i * 4 + 1] = value;
    gray.data[i * 4 + 2] = value;
    gray.data[i * 4 + 3] = 255;
  }
  sourceCtx.putImageData(gray, 0, 0);
  const target = new OffscreenCanvas(width, height);
  const targetCtx = target.getContext("2d");
  if (!targetCtx) {
    throw new Error("No 2d context");
  }
  targetCtx.imageSmoothingEnabled = true;
  targetCtx.imageSmoothingQuality = "high";
  targetCtx.drawImage(source, 0, 0, width, height);
  const scaled = targetCtx.getImageData(0, 0, width, height);
  const out = new Uint8ClampedArray(width * height);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = scaled.data[i * 4] ?? 0;
  }
  return out;
}

scope.onmessage = (event) => {
  const { jobId, width, height, buffer } = event.data;
  void (async () => {
    try {
      const segmenter = await getSegmenter(jobId);
      // Model ready — switch the UI to the indeterminate inference state.
      reply({ jobId, type: "progress", progress: null });
      const input = new RawImage(new Uint8ClampedArray(buffer), width, height, 4);
      const [result] = await segmenter(input);
      if (!result) {
        throw new Error("Empty segmentation result");
      }
      const mask = resizeMask(result.mask, width, height);

      let alphaSum = 0;
      for (const value of mask) {
        alphaSum += value;
      }
      // No clear subject: the mask is (near-)empty.
      if (alphaSum / mask.length < 5) {
        reply({ jobId, type: "error", code: "no-subject" });
        return;
      }

      const out = new ImageData(width, height);
      const pixels = new Uint8ClampedArray(buffer);
      for (let i = 0; i < mask.length; i += 1) {
        out.data[i * 4] = pixels[i * 4] ?? 0;
        out.data[i * 4 + 1] = pixels[i * 4 + 1] ?? 0;
        out.data[i * 4 + 2] = pixels[i * 4 + 2] ?? 0;
        out.data[i * 4 + 3] = mask[i] ?? 0;
      }
      const canvas = new OffscreenCanvas(width, height);
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        throw new Error("No 2d context");
      }
      ctx.putImageData(out, 0, 0);
      const blob = await canvas.convertToBlob({ type: "image/png" });
      reply({ jobId, type: "done", blob });
    } catch (error) {
      reply({
        jobId,
        type: "error",
        code: "failed",
        message: error instanceof Error ? error.message : "unknown error",
      });
    }
  })();
};
