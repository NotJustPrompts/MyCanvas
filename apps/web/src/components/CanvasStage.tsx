import Konva from "konva";
import { useCallback, useEffect, useRef } from "react";
import { Layer, Rect, Stage, Transformer } from "react-konva";
import { type Design } from "@mycanva/shared";
import { useEditorStore } from "../store/editorStore";
import { useImage } from "../hooks/useImage";
import { setCanvasBridge } from "../utils/canvas-bridge";
import { LayerNode } from "./LayerNode";

interface CanvasStageProps {
  design: Design;
  scale: number;
  onFitScale: (fit: number) => void;
}

let checkerDataUrl: string | null = null;

function getCheckerDataUrl(): string {
  if (checkerDataUrl) {
    return checkerDataUrl;
  }
  const size = 16;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "#3f3f46";
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = "#52525b";
    ctx.fillRect(0, 0, size / 2, size / 2);
    ctx.fillRect(size / 2, size / 2, size / 2, size / 2);
  }
  checkerDataUrl = canvas.toDataURL();
  return checkerDataUrl;
}

export function CanvasStage({ design, scale, onFitScale }: CanvasStageProps) {
  const selectedLayerId = useEditorStore((state) => state.selectedLayerId);
  const selectLayer = useEditorStore((state) => state.selectLayer);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const contentLayerRef = useRef<Konva.Layer | null>(null);
  const transformerRef = useRef<Konva.Transformer | null>(null);
  const nodesRef = useRef(new Map<string, Konva.Node>());

  const transparent = design.background === "transparent";
  const checkerImage = useImage(transparent ? getCheckerDataUrl() : undefined);

  const registerRef = useCallback((id: string, node: Konva.Node | null) => {
    if (node) {
      nodesRef.current.set(id, node);
    } else {
      nodesRef.current.delete(id);
    }
  }, []);

  // Measure the available space and report the "fit" zoom level upwards.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) {
      return;
    }
    const observer = new ResizeObserver(() => {
      const rect = el.getBoundingClientRect();
      const fit = Math.min((rect.width - 48) / design.width, (rect.height - 48) / design.height);
      if (Number.isFinite(fit) && fit > 0) {
        onFitScale(Math.min(4, Math.round(fit * 1000) / 1000));
      }
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
    };
  }, [design.width, design.height, onFitScale]);

  // Attach the transformer to the selected node.
  useEffect(() => {
    const transformer = transformerRef.current;
    if (!transformer) {
      return;
    }
    const selected = selectedLayerId ? design.layers.find((layer) => layer.id === selectedLayerId) : undefined;
    const node = selected?.visible ? nodesRef.current.get(selected.id) : undefined;
    transformer.nodes(node ? [node] : []);
    transformer.getLayer()?.batchDraw();
  }, [selectedLayerId, design.layers]);

  // Register export/thumbnail hooks for the autosave flow and export dialog.
  useEffect(() => {
    setCanvasBridge({
      exportImage: (options) => {
        const layer = contentLayerRef.current;
        if (!layer) {
          throw new Error("Canvas is not ready yet");
        }
        let flatten: Konva.Rect | null = null;
        if (options.flattenWhite) {
          flatten = new Konva.Rect({
            x: 0,
            y: 0,
            width: design.width,
            height: design.height,
            fill: "#ffffff",
            listening: false,
          });
          layer.add(flatten);
          flatten.moveToBottom();
        }
        try {
          return layer.toDataURL({
            mimeType: options.mimeType,
            quality: options.quality,
            pixelRatio: options.pixelRatio,
          });
        } finally {
          flatten?.destroy();
        }
      },
      makeThumbnail: () => {
        const layer = contentLayerRef.current;
        if (!layer) {
          return null;
        }
        let flatten: Konva.Rect | null = null;
        if (design.background === "transparent") {
          flatten = new Konva.Rect({
            x: 0,
            y: 0,
            width: design.width,
            height: design.height,
            fill: "#ffffff",
            listening: false,
          });
          layer.add(flatten);
          flatten.moveToBottom();
        }
        try {
          return layer.toDataURL({ mimeType: "image/jpeg", quality: 0.6, pixelRatio: 0.15 });
        } catch {
          return null;
        } finally {
          flatten?.destroy();
        }
      },
    });
    return () => {
      setCanvasBridge(null);
    };
  }, [design.width, design.height, design.background]);

  const onStageMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
    const target = e.target;
    if (target === target.getStage() || target.name() === "canvas-background") {
      selectLayer(null);
    }
  };

  return (
    <div className="canvas-viewport" ref={containerRef}>
      <div
        className="canvas-scale-box"
        style={{ width: design.width * scale, height: design.height * scale }}
      >
        <div
          className="canvas-natural"
          style={{
            width: design.width,
            height: design.height,
            transform: `scale(${String(scale)})`,
          }}
        >
          <Stage width={design.width} height={design.height} onMouseDown={onStageMouseDown}>
            {transparent && (
              <Layer listening={false}>
                <Rect
                  x={0}
                  y={0}
                  width={design.width}
                  height={design.height}
                  fillPatternImage={checkerImage}
                />
              </Layer>
            )}
            <Layer ref={contentLayerRef}>
              {!transparent && (
                <Rect
                  name="canvas-background"
                  x={0}
                  y={0}
                  width={design.width}
                  height={design.height}
                  fill={design.background}
                />
              )}
              {design.layers.map((layer) => (
                <LayerNode key={layer.id} layer={layer} registerRef={registerRef} />
              ))}
            </Layer>
            <Layer>
              <Transformer
                ref={transformerRef}
                rotateEnabled
                flipEnabled={false}
                ignoreStroke
                anchorSize={8}
                anchorCornerRadius={2}
                anchorStroke="#60a5fa"
                borderStroke="#60a5fa"
              />
            </Layer>
          </Stage>
        </div>
      </div>
    </div>
  );
}
