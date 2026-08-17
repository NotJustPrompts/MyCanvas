import type Konva from "konva";

export interface ExportImageOptions {
  mimeType: "image/png" | "image/jpeg";
  quality: number;
  pixelRatio: number;
  /** Composite onto a white background (for JPEG export of transparent designs). */
  flattenWhite: boolean;
}

interface CanvasBridge {
  exportImage: (options: ExportImageOptions) => string;
  makeThumbnail: () => string | null;
  getLayerNode: (id: string) => Konva.Node | null;
}

let bridge: CanvasBridge | null = null;

/** Registered by the canvas stage while the editor is mounted. */
export function setCanvasBridge(next: CanvasBridge | null): void {
  bridge = next;
}

export function exportDesignImage(options: ExportImageOptions): string {
  if (!bridge) {
    throw new Error("Canvas is not ready yet");
  }
  return bridge.exportImage(options);
}

export function makeDesignThumbnail(): string | null {
  return bridge ? bridge.makeThumbnail() : null;
}

/** Live Konva node for a layer id (for rendered-bounds math like alignment). */
export function getLayerNode(id: string): Konva.Node | null {
  return bridge ? bridge.getLayerNode(id) : null;
}
