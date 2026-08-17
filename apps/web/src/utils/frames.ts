import { type FrameContent, type FrameShape } from "@mycanvas/shared";
import { getCachedImageSize } from "../hooks/useImage";
import { useEditorStore } from "../store/editorStore";
import { roundedPolygonPath, shapePoints, traceRoundedPolygon } from "./rounded-path";

/**
 * Frame (image container) helpers: cover-fit math for content placement and
 * the shared geometry (clip path, drawer thumbnails). Shapes reuse the
 * rounded-polygon helper so corner radius works on frames too.
 */

/** dataTransfer MIME for Uploads-panel asset drags (drop = fill a frame). */
export const ASSET_DRAG_MIME = "application/x-mycanvas-asset";

/**
 * The asset id of the in-flight Uploads drag. dataTransfer.getData() is
 * unreadable during dragover (only types), so the frame/background drop
 * previews learn WHICH bitmap is dragged through this stash instead. Set on
 * dragstart, cleared on dragend.
 */
let currentAssetDrag: string | null = null;

export function setCurrentAssetDrag(asset: string | null): void {
  currentAssetDrag = asset;
}

export function getCurrentAssetDrag(): string | null {
  return currentAssetDrag;
}

/** Cover-fit scale: the smallest scale at which the image covers the frame. */
export function coverScale(imgW: number, imgH: number, frameW: number, frameH: number): number {
  return Math.max(frameW / imgW, frameH / imgH);
}

/** Clamp offsets so the image always covers the frame (no empty edges). */
export function clampContent(
  content: FrameContent,
  imgW: number,
  imgH: number,
  frameW: number,
  frameH: number,
): FrameContent {
  const scale = Math.max(content.scale, coverScale(imgW, imgH, frameW, frameH));
  return {
    ...content,
    scale,
    offsetX: Math.min(0, Math.max(frameW - imgW * scale, content.offsetX)),
    offsetY: Math.min(0, Math.max(frameH - imgH * scale, content.offsetY)),
  };
}

/** Initial content placement: cover-fit, centered. */
export function coverContent(asset: string, imgW: number, imgH: number, frameW: number, frameH: number): FrameContent {
  const scale = coverScale(imgW, imgH, frameW, frameH);
  return {
    asset,
    scale,
    offsetX: (frameW - imgW * scale) / 2,
    offsetY: (frameH - imgH * scale) / 2,
  };
}

/**
 * Re-cover after the frame box changed (middle-anchor resize): keeps the
 * user's zoom ratio over cover and the visible center, then clamps.
 */
export function recoverContent(
  content: FrameContent,
  imgW: number,
  imgH: number,
  oldW: number,
  oldH: number,
  newW: number,
  newH: number,
): FrameContent {
  const zoomRatio = content.scale / coverScale(imgW, imgH, oldW, oldH);
  const scale = Math.max(coverScale(imgW, imgH, newW, newH) * zoomRatio, coverScale(imgW, imgH, newW, newH));
  // Content-image coordinate currently at the frame center stays centered.
  const centerX = (oldW / 2 - content.offsetX) / content.scale;
  const centerY = (oldH / 2 - content.offsetY) / content.scale;
  return clampContent(
    { asset: content.asset, scale, offsetX: newW / 2 - centerX * scale, offsetY: newH / 2 - centerY * scale },
    imgW,
    imgH,
    newW,
    newH,
  );
}

/**
 * Traces the frame's shape path onto a canvas context (Konva clipFunc). Reads
 * like the shape renderers: rect (+corner radius), circle, or the polygonal
 * set via the rounded-polygon tracer.
 */
export function traceFramePath(
  ctx: Pick<
    CanvasRenderingContext2D,
    "beginPath" | "moveTo" | "lineTo" | "quadraticCurveTo" | "closePath" | "ellipse" | "rect"
  >,
  shape: FrameShape,
  width: number,
  height: number,
  cornerRadius: number,
): void {
  if (shape === "circle") {
    ctx.beginPath();
    ctx.ellipse(width / 2, height / 2, width / 2, height / 2, 0, 0, Math.PI * 2);
    ctx.closePath();
    return;
  }
  if (shape === "rect") {
    if (cornerRadius <= 0) {
      ctx.beginPath();
      ctx.rect(0, 0, width, height);
      ctx.closePath();
      return;
    }
    traceRoundedPolygon(ctx, [0, 0, width, 0, width, height, 0, height], cornerRadius);
    return;
  }
  traceRoundedPolygon(ctx, shapePoints(shape, width, height), cornerRadius);
}

/** SVG path data for the frame shape — drawer thumbnails. */
export function framePathData(shape: FrameShape, width: number, height: number, cornerRadius: number): string {
  if (shape === "circle") {
    // Two-arc ellipse.
    return `M 0 ${String(height / 2)} A ${String(width / 2)} ${String(height / 2)} 0 0 1 ${String(width)} ${String(height / 2)} A ${String(width / 2)} ${String(height / 2)} 0 0 1 0 ${String(height / 2)} Z`;
  }
  if (shape === "rect") {
    return roundedPolygonPath([0, 0, width, 0, width, height, 0, height], cornerRadius);
  }
  return roundedPolygonPath(shapePoints(shape, width, height), cornerRadius);
}

function loadImageSize(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth || 1, height: img.naturalHeight || 1 });
    };
    img.onerror = () => {
      reject(new Error(`Failed to load ${url}`));
    };
    img.src = url;
  });
}

/**
 * Fills a frame with an asset (cover-fit, centered) — one history entry.
 * Used by all three fill paths: Uploads drag, filesystem drop, inspector
 * picker. Locked/non-frame layers are rejected by the store guard / type check.
 */
export async function fillFrame(layerId: string, asset: string): Promise<void> {
  const store = useEditorStore.getState();
  const layer = store.design?.layers.find((entry) => entry.id === layerId);
  if (layer?.type !== "frame") {
    return;
  }
  const size = getCachedImageSize(`/assets/${asset}`) ?? (await loadImageSize(`/assets/${asset}`));
  store.updateLayer(layerId, {
    content: coverContent(asset, size.width, size.height, layer.width, layer.height),
  });
}
