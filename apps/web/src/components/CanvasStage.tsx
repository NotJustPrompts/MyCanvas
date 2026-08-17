import Konva from "konva";
import { type DragEvent as ReactDragEvent, useCallback, useEffect, useRef, useState } from "react";
import { Arc, Group, Layer, Line, Rect, Stage, Transformer } from "react-konva";
import { type Design, type Layer as EditorLayer } from "@mycanva/shared";
import { api } from "../api";
import { useEditorStore, primarySelectedId } from "../store/editorStore";
import { getCachedImageSize, useImage } from "../hooks/useImage";
import { useTheme } from "../utils/theme";
import { setCanvasBridge } from "../utils/canvas-bridge";
import { LayerNode } from "./LayerNode";
import { TextEditorOverlay } from "./TextEditorOverlay";

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

const MIDDLE_X_ANCHORS = new Set(["middle-left", "middle-right"]);
const MIDDLE_Y_ANCHORS = new Set(["top-center", "bottom-center"]);

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/**
 * One incremental "resize, don't scale" bake for middle-anchor drags: folds the
 * transformer's per-frame scale DELTA into real geometry — image crop + box
 * size, text wrap width — so the user sees the actual crop growing or the text
 * re-wrapping live instead of a distorted stretch.
 *
 * The node's absolute scale is never touched: the delta is applied relative to
 * `baseScale` (captured at transformstart) and the node scale is restored to it
 * after each bake, so a layer carrying an earlier corner-scale (scaleX ≠ 1)
 * keeps its visual size — only the wrap/crop changes. (Resetting scale to 1
 * here made scaled text snap back to its stored font size mid-drag.)
 *
 * Runs on every `transform` frame (imperative node writes only — the store and
 * history are untouched mid-drag) and once more at `transformend` to absorb
 * the residual delta, so the committed patch is read straight from the node.
 * The transformer re-derives each frame's delta from the node's current rect
 * (it resets its cache after every move), so per-frame baking is safe.
 * Returns true when the bake applied.
 */
function bakeMiddleTransform(
  node: Konva.Node,
  layer: EditorLayer,
  anchor: string,
  baseScale: { x: number; y: number },
): boolean {
  if (
    layer.type === "image" &&
    node instanceof Konva.Image &&
    (MIDDLE_X_ANCHORS.has(anchor) || MIDDLE_Y_ANCHORS.has(anchor))
  ) {
    const natural = getCachedImageSize(`/assets/${layer.asset}`);
    const naturalW = natural?.width ?? layer.width;
    const naturalH = natural?.height ?? layer.height;
    const stored = node.crop();
    const crop =
      stored && stored.width > 0 && stored.height > 0
        ? stored
        : { x: 0, y: 0, width: naturalW, height: naturalH };
    if (MIDDLE_X_ANCHORS.has(anchor)) {
      const base = baseScale.x === 0 ? 1 : baseScale.x;
      const delta = node.scaleX() / base;
      const prevWidth = node.width();
      // Visual px per source px at the drag-start scale — invariant of the drag.
      const dispRatio = (prevWidth * base) / crop.width;
      let cropX = crop.x;
      let cropW: number;
      if (anchor === "middle-left") {
        const right = crop.x + crop.width;
        cropX = clampNumber(crop.x + crop.width * (1 - delta), 0, right - 1);
        cropW = right - cropX;
      } else {
        cropW = clampNumber(crop.width * delta, 1, naturalW - crop.x);
      }
      const width = Math.max(1, (cropW * dispRatio) / base);
      if (anchor === "middle-left") {
        // Keep the visible right edge pinned while the crop window slides.
        node.x(node.x() + prevWidth * node.scaleX() - width * base);
      }
      node.width(width);
      node.crop({ ...crop, x: cropX, width: cropW });
    } else {
      const base = baseScale.y === 0 ? 1 : baseScale.y;
      const delta = node.scaleY() / base;
      const prevHeight = node.height();
      const dispRatio = (prevHeight * base) / crop.height;
      let cropY = crop.y;
      let cropH: number;
      if (anchor === "top-center") {
        const bottom = crop.y + crop.height;
        cropY = clampNumber(crop.y + crop.height * (1 - delta), 0, bottom - 1);
        cropH = bottom - cropY;
      } else {
        cropH = clampNumber(crop.height * delta, 1, naturalH - crop.y);
      }
      const height = Math.max(1, (cropH * dispRatio) / base);
      if (anchor === "top-center") {
        node.y(node.y() + prevHeight * node.scaleY() - height * base);
      }
      node.height(height);
      node.crop({ ...crop, y: cropY, height: cropH });
    }
    node.scaleX(baseScale.x);
    node.scaleY(baseScale.y);
    return true;
  }
  if (layer.type === "text" && MIDDLE_X_ANCHORS.has(anchor)) {
    // The transformer is attached to the (possibly grouped) node; resize the
    // text child so effect margins don't leak into the wrap width.
    const measureNode =
      node instanceof Konva.Container
        ? (node.findOne("Text") ?? node.findOne("TextPath") ?? node)
        : node;
    const base = baseScale.x === 0 ? 1 : baseScale.x;
    const sx = node.scaleX();
    const prevWidth = measureNode.width();
    // wrapWidth lives in unscaled units: visual width ÷ drag-start scale.
    const wrapWidth = Math.max(20, (prevWidth * sx) / base);
    if (anchor === "middle-left") {
      // Pin the text box's right edge (the group origin is the text origin).
      node.x(node.x() + prevWidth * sx - wrapWidth * base);
    }
    measureNode.width(wrapWidth);
    node.scaleX(baseScale.x);
    node.scaleY(baseScale.y);
    return true;
  }
  return false;
}

export function CanvasStage({ design, scale, onFitScale }: CanvasStageProps) {
  const selectedLayerIds = useEditorStore((state) => state.selectedLayerIds);
  const selectLayer = useEditorStore((state) => state.selectLayer);
  const setSelectedLayers = useEditorStore((state) => state.setSelectedLayers);
  const updateLayer = useEditorStore((state) => state.updateLayer);
  const updateLayers = useEditorStore((state) => state.updateLayers);
  const addImageLayerAt = useEditorStore((state) => state.addImageLayerAt);
  const bumpAssetsVersion = useEditorStore((state) => state.bumpAssetsVersion);
  const openContextMenu = useEditorStore((state) => state.openContextMenu);
  const closeContextMenu = useEditorStore((state) => state.closeContextMenu);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const contentLayerRef = useRef<Konva.Layer | null>(null);
  const transformerRef = useRef<Konva.Transformer | null>(null);
  const nodesRef = useRef(new Map<string, Konva.Node>());
  const naturalRef = useRef<HTMLDivElement | null>(null);
  const dragDepth = useRef(0);
  const activeAnchorRef = useRef<string | null>(null);
  const transformBaseScaleRef = useRef({ x: 1, y: 1 });
  const lastDragWriteRef = useRef(0);
  const marqueeRectRef = useRef<Konva.Rect | null>(null);
  const [dropState, setDropState] = useState<"ready" | "reject" | null>(null);
  /** Hover preview box (design coords); null while suppressed/nothing hovered. */
  const [hoverBox, setHoverBox] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  /** >0 suppresses the hover box: dragging, marquee-ing, or transforming. */
  const hoverSuppressRef = useRef(0);

  const transparent = design.background === "transparent";
  const checkerImage = useImage(transparent ? getCheckerDataUrl() : undefined);
  const theme = useTheme();
  // Mirrors the --accent token so the selection frame reads on-brand.
  const accentColor = theme === "dark" ? "#a78bfa" : "#7c3aed";
  const editingTextLayerId = useEditorStore((state) => state.editingTextLayerId);

  // Live values for imperative Konva callbacks (registerRef is memoized).
  const scaleRef = useRef(scale);
  scaleRef.current = scale;

  const guideTargetsRef = useRef<{ vertical: number[]; horizontal: number[] }>({
    vertical: [],
    horizontal: [],
  });
  const verticalGuideRef = useRef<Konva.Line | null>(null);
  const horizontalGuideRef = useRef<Konva.Line | null>(null);

  const hideGuides = useCallback(() => {
    verticalGuideRef.current?.visible(false);
    horizontalGuideRef.current?.visible(false);
    verticalGuideRef.current?.getLayer()?.batchDraw();
  }, []);

  /**
   * Canva-style anchors: circles on corners and the rotater, pills on the
   * side middles. Called by the transformer on every update.
   */
  const anchorStyleFunc = useCallback(
    (anchor: Konva.Rect) => {
      const name = anchor.name().replace(" _anchor", "");
      const isCorner =
        name === "top-left" || name === "top-right" || name === "bottom-left" || name === "bottom-right";
      const isRotater = name === "rotater";
      const isMiddleX = name === "middle-left" || name === "middle-right";
      const width = isCorner ? 10 : isRotater ? 12 : isMiddleX ? 6 : 14;
      const height = isCorner ? 10 : isRotater ? 12 : isMiddleX ? 14 : 6;
      anchor.setAttrs({
        width,
        height,
        cornerRadius: isCorner || isRotater ? width / 2 : 3,
        offsetX: width / 2,
        offsetY: height / 2,
        fill: "#ffffff",
        stroke: accentColor,
        strokeWidth: 1.5,
        shadowColor: "#000000",
        shadowBlur: 3,
        shadowOffset: { x: 0, y: 1 },
        shadowOpacity: 0.25,
        hitStrokeWidth: 12,
      });
    },
    [accentColor],
  );

  const registerRef = useCallback(
    (id: string, node: Konva.Node | null) => {
      if (!node) {
        nodesRef.current.delete(id);
        return;
      }
      nodesRef.current.set(id, node);

      // Smart guides: snap the dragged node to other layers' edges/centers
      // and to the canvas center/edges. Targets are computed once per drag.
      node.on("dragstart.guides", () => {
        const vertical = [0, design.width / 2, design.width];
        const horizontal = [0, design.height / 2, design.height];
        nodesRef.current.forEach((other, otherId) => {
          if (otherId === id || !other.isVisible()) {
            return;
          }
          const rect = other.getClientRect({ skipShadow: true });
          vertical.push(rect.x, rect.x + rect.width / 2, rect.x + rect.width);
          horizontal.push(rect.y, rect.y + rect.height / 2, rect.y + rect.height);
        });
        guideTargetsRef.current = { vertical, horizontal };
      });
      node.on("dragmove.guides", () => {
        const threshold = 5 / scaleRef.current;
        const rect = node.getClientRect({ skipShadow: true });
        const xs = [rect.x, rect.x + rect.width / 2, rect.x + rect.width];
        const ys = [rect.y, rect.y + rect.height / 2, rect.y + rect.height];
        let bestV: { delta: number; line: number } | null = null;
        let bestH: { delta: number; line: number } | null = null;
        for (const target of guideTargetsRef.current.vertical) {
          for (const x of xs) {
            const delta = target - x;
            if (Math.abs(delta) < threshold && (!bestV || Math.abs(delta) < Math.abs(bestV.delta))) {
              bestV = { delta, line: target };
            }
          }
        }
        for (const target of guideTargetsRef.current.horizontal) {
          for (const y of ys) {
            const delta = target - y;
            if (Math.abs(delta) < threshold && (!bestH || Math.abs(delta) < Math.abs(bestH.delta))) {
              bestH = { delta, line: target };
            }
          }
        }
        if (bestV) {
          node.x(node.x() + bestV.delta);
          verticalGuideRef.current?.setAttrs({
            points: [bestV.line, 0, bestV.line, design.height],
            visible: true,
          });
        } else {
          verticalGuideRef.current?.visible(false);
        }
        if (bestH) {
          node.y(node.y() + bestH.delta);
          horizontalGuideRef.current?.setAttrs({
            points: [0, bestH.line, design.width, bestH.line],
            visible: true,
          });
        } else {
          horizontalGuideRef.current?.visible(false);
        }
        verticalGuideRef.current?.getLayer()?.batchDraw();
      });
      node.on("dragend.guides", hideGuides);

      // Hover preview box: outline the layer under the pointer (or its whole
      // group — that's what a click would select; inside an entered group, the
      // member). Suppressed while dragging/marquee-ing/transforming and for
      // selected layers (they have the real transformer frame).
      node.on("mouseenter.hover", () => {
        if (hoverSuppressRef.current > 0) {
          return;
        }
        const state = useEditorStore.getState();
        if (state.selectedLayerIds.includes(id) || state.editingTextLayerId) {
          return;
        }
        const layer = state.design?.layers.find((entry) => entry.id === id);
        if (!layer?.visible) {
          return;
        }
        const groupId = layer.groupId && layer.groupId !== state.editingGroupId ? layer.groupId : null;
        const members = groupId
          ? (state.design?.layers.filter((entry) => entry.groupId === groupId) ?? [])
          : [layer];
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        for (const member of members) {
          const memberNode = nodesRef.current.get(member.id);
          if (!memberNode || !member.visible) {
            continue;
          }
          const rect = memberNode.getClientRect({ skipShadow: true });
          minX = Math.min(minX, rect.x);
          minY = Math.min(minY, rect.y);
          maxX = Math.max(maxX, rect.x + rect.width);
          maxY = Math.max(maxY, rect.y + rect.height);
        }
        if (Number.isFinite(minX)) {
          setHoverBox({ x: minX, y: minY, width: maxX - minX, height: maxY - minY });
        }
      });
      node.on("mouseleave.hover", () => {
        setHoverBox(null);
      });
      node.on("dragstart.hover", () => {
        hoverSuppressRef.current += 1;
        setHoverBox(null);
      });
      node.on("dragend.hover", () => {
        hoverSuppressRef.current = Math.max(0, hoverSuppressRef.current - 1);
      });

      // Multi-drag: the transformer proxies drags to all attached nodes (and
      // startDrag()s them, so sibling dragends fire too) — write back every
      // attached node once per gesture, guarded by a tick window.
      node.on("dragend.group", () => {
        const now = Date.now();
        if (now - lastDragWriteRef.current < 50) {
          return;
        }
        lastDragWriteRef.current = now;
        const attached = transformerRef.current?.nodes() ?? [];
        const targets = attached.length > 1 ? attached : [node];
        useEditorStore.getState().updateLayers(
          targets.map((entry) => ({ id: entry.id(), patch: { x: entry.x(), y: entry.y() } })),
        );
      });
    },
    [design.width, design.height, hideGuides],
  );

  const selectedLayer =
    selectedLayerIds.length === 1
      ? design.layers.find((layer) => layer.id === selectedLayerIds[0])
      : undefined;

  const editingLayer = editingTextLayerId
    ? design.layers.find((layer) => layer.id === editingTextLayerId)
    : undefined;

  /**
   * Canva-style anchors per layer type: corners always scale (keepRatio),
   * middle anchors resize the box. Text hides top/bottom middles (its height
   * is content-driven); lines keep corners only.
   */
  const enabledAnchors =
    selectedLayerIds.length > 1
      ? ["top-left", "top-right", "bottom-left", "bottom-right"]
      : !selectedLayer
          ? undefined
          : selectedLayer.type === "text"
            ? (selectedLayer.curve ?? 0) !== 0
                ? ["top-left", "top-right", "bottom-left", "bottom-right"]
                : ["top-left", "top-right", "bottom-left", "bottom-right", "middle-left", "middle-right"]
            : selectedLayer.type === "line"
              ? ["top-left", "top-right", "bottom-left", "bottom-right"]
              : undefined;

  const onTransformStart = () => {
    activeAnchorRef.current = transformerRef.current?.getActiveAnchor() ?? null;
    hoverSuppressRef.current += 1;
    setHoverBox(null);
    // Middle-anchor bakes apply per-frame deltas relative to this scale so a
    // layer carrying an earlier corner-scale keeps its visual size.
    const node = transformerRef.current?.nodes()[0];
    transformBaseScaleRef.current = { x: node?.scaleX() ?? 1, y: node?.scaleY() ?? 1 };
  };

  // Live middle-anchor preview: fold the scale delta into crop/wrap width on
  // every frame (node attrs only — no store writes, so history stays clean).
  const onTransform = () => {
    const transformer = transformerRef.current;
    const nodes = transformer?.nodes() ?? [];
    if (!transformer || nodes.length !== 1) {
      return;
    }
    const anchor = transformer.getActiveAnchor();
    const node = nodes[0];
    if (!anchor || !node) {
      return;
    }
    const layer = useEditorStore.getState().design?.layers.find((entry) => entry.id === node.id());
    if (layer && bakeMiddleTransform(node, layer, anchor, transformBaseScaleRef.current)) {
      node.getLayer()?.batchDraw();
    }
  };

  const onTransformEnd = () => {
    hoverSuppressRef.current = Math.max(0, hoverSuppressRef.current - 1);
    const transformer = transformerRef.current;
    const anchor = activeAnchorRef.current;
    activeAnchorRef.current = null;
    const state = useEditorStore.getState();

    // Multi-select: corners-only uniform scale — write every node back.
    const transformedNodes = transformer?.nodes() ?? [];
    if (transformedNodes.length > 1) {
      updateLayers(
        transformedNodes.map((entry) => ({
          id: entry.id(),
          patch: {
            x: entry.x(),
            y: entry.y(),
            scaleX: entry.scaleX(),
            scaleY: entry.scaleY(),
            rotation: entry.rotation(),
          },
        })),
      );
      return;
    }

    const node = transformedNodes[0];
    const layer = state.design?.layers.find((entry) => entry.id === primarySelectedId(state));
    if (!node || !layer) {
      return;
    }
    const sx = node.scaleX();
    const sy = node.scaleY();
    const pos = { x: node.x(), y: node.y(), rotation: node.rotation() };
    const isMiddleX = anchor === "middle-left" || anchor === "middle-right";
    const isMiddleY = anchor === "top-center" || anchor === "bottom-center";

    // Middle drags resize the box, not the content. The live bake works in
    // unscaled units and restores the node's drag-start scale, so the commit
    // reads everything back from the node — scale included — unchanged.
    if (isMiddleX && layer.type === "text") {
      // Absorb any residual delta, then read the live-baked wrap width back.
      bakeMiddleTransform(node, layer, anchor, transformBaseScaleRef.current);
      const measureNode =
        node instanceof Konva.Container
          ? (node.findOne("Text") ?? node.findOne("TextPath") ?? node)
          : node;
      const wrapWidth = Math.max(20, Math.round(measureNode.width()));
      updateLayer(layer.id, { ...pos, wrapWidth, scaleX: node.scaleX(), scaleY: node.scaleY() });
      return;
    }
    if ((isMiddleX || isMiddleY) && (layer.type === "rect" || layer.type === "shape")) {
      // Rects/shapes have no scale-dependent content (uniform fill), so the
      // total scale is baked into the dimensions and normalized to 1 — the
      // inspector then shows true visual sizes. (Audit note: a stroked shape's
      // stroke renormalizes to full strength here — pre-existing semantics.)
      const width = Math.max(1, Math.round(node.width() * sx));
      const height = Math.max(1, Math.round(node.height() * sy));
      node.scaleX(1);
      node.scaleY(1);
      node.width(width);
      node.height(height);
      updateLayer(layer.id, { ...pos, width, height, scaleX: 1, scaleY: 1 });
      return;
    }
    if ((isMiddleX || isMiddleY) && layer.type === "image" && node instanceof Konva.Image) {
      // Middle drags crop: the visible window into the source image changes,
      // the content is never distorted. The live preview already baked the
      // geometry into the node — absorb the residual delta and commit it.
      bakeMiddleTransform(node, layer, anchor, transformBaseScaleRef.current);
      const crop = node.crop();
      updateLayer(layer.id, {
        x: node.x(),
        y: node.y(),
        rotation: node.rotation(),
        ...(isMiddleX
          ? { width: Math.max(1, Math.round(node.width())) }
          : { height: Math.max(1, Math.round(node.height())) }),
        crop,
        scaleX: node.scaleX(),
        scaleY: node.scaleY(),
      });
      return;
    }

    // Corner drags (all types): scale the whole layer, ratio kept by the
    // transformer itself.
    updateLayer(layer.id, { ...pos, scaleX: sx, scaleY: sy });
  };

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

  // Attach the transformer to the selected nodes (detached while editing text
  // in place so the frame doesn't fight the textarea overlay). Locked layers
  // keep their selection but never get the transformer — no anchors, no rotate.
  useEffect(() => {
    const transformer = transformerRef.current;
    if (!transformer) {
      return;
    }
    const nodes = editingTextLayerId
      ? []
      : selectedLayerIds
          .map((id) => {
            const layer = design.layers.find((entry) => entry.id === id);
            return layer?.visible && !layer.locked ? nodesRef.current.get(id) : undefined;
          })
          .filter((node): node is Konva.Node => Boolean(node));
    transformer.nodes(nodes);
    transformer.getLayer()?.batchDraw();
  }, [selectedLayerIds, design.layers, editingTextLayerId]);

  // The hover box is a transient pointer aid: drop it on zoom and whenever the
  // selection changes (a freshly clicked layer shows the real transformer).
  useEffect(() => {
    setHoverBox(null);
  }, [scale, selectedLayerIds]);

  // Padlock badge for a single locked selection: an accent selection frame
  // (no anchors) plus an unlock button pinned to its top-right corner
  // (overlay layer — never exported). Constant screen size at any zoom.
  const [lockBadge, setLockBadge] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  useEffect(() => {
    const layer =
      selectedLayerIds.length === 1 && !editingTextLayerId
        ? design.layers.find((entry) => entry.id === selectedLayerIds[0])
        : undefined;
    const node = layer?.locked ? nodesRef.current.get(layer.id) : undefined;
    if (!layer || !node) {
      setLockBadge(null);
      return;
    }
    const rect = node.getClientRect({ skipShadow: true });
    setLockBadge({ x: rect.x, y: rect.y, width: rect.width, height: rect.height });
  }, [selectedLayerIds, design.layers, editingTextLayerId, scale]);

  // While a text layer is being edited in place, hide its Konva node (the
  // textarea overlay takes over) and restore it afterwards. Curved text stays
  // visible ghosted at low opacity instead, so the bend is visible while typing.
  useEffect(() => {
    if (!editingTextLayerId) {
      return;
    }
    const node = nodesRef.current.get(editingTextLayerId);
    if (!node) {
      return;
    }
    const layer = design.layers.find((entry) => entry.id === editingTextLayerId);
    const ghost =
      layer?.type === "text" &&
      ((layer.curve ?? 0) !== 0 || (layer.effect !== undefined && layer.effect.type !== "none"));
    const previousOpacity = node.opacity();
    if (ghost) {
      node.opacity(0.25);
    } else {
      node.visible(false);
    }
    node.getLayer()?.batchDraw();
    return () => {
      node.visible(true);
      node.opacity(previousOpacity);
      node.getLayer()?.batchDraw();
    };
  }, [editingTextLayerId, design.layers]);

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
      getLayerNode: (id) => nodesRef.current.get(id) ?? null,
    });
    return () => {
      setCanvasBridge(null);
    };
  }, [design.width, design.height, design.background]);

  const onStageMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
    const target = e.target;
    closeContextMenu();
    if (target !== target.getStage() && target.name() !== "canvas-background") {
      return;
    }
    // Empty canvas: deselect and start a marquee selection.
    const stage = target.getStage();
    const pointer = stage?.getPointerPosition();
    if (!stage || !pointer) {
      selectLayer(null);
      return;
    }
    const additive = e.evt.shiftKey;
    if (!additive) {
      selectLayer(null);
    }
    const start = { x: pointer.x, y: pointer.y };
    hoverSuppressRef.current += 1;
    setHoverBox(null);

    const onMove = (ev: MouseEvent) => {
      const containerRect = stage.container().getBoundingClientRect();
      const pos = {
        x: (ev.clientX - containerRect.left) / scaleRef.current,
        y: (ev.clientY - containerRect.top) / scaleRef.current,
      };
      marqueeRectRef.current?.setAttrs({
        x: Math.min(start.x, pos.x),
        y: Math.min(start.y, pos.y),
        width: Math.abs(pos.x - start.x),
        height: Math.abs(pos.y - start.y),
        visible: true,
      });
      marqueeRectRef.current?.getLayer()?.batchDraw();
    };
    const onUp = (ev: MouseEvent) => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      hoverSuppressRef.current = Math.max(0, hoverSuppressRef.current - 1);
      const marquee = marqueeRectRef.current;
      if (!marquee) {
        return;
      }
      marquee.visible(false);
      marquee.getLayer()?.batchDraw();
      const containerRect = stage.container().getBoundingClientRect();
      const end = {
        x: (ev.clientX - containerRect.left) / scaleRef.current,
        y: (ev.clientY - containerRect.top) / scaleRef.current,
      };
      const rect = {
        x: Math.min(start.x, end.x),
        y: Math.min(start.y, end.y),
        width: Math.abs(end.x - start.x),
        height: Math.abs(end.y - start.y),
      };
      if (rect.width < 3 && rect.height < 3) {
        return; // plain click — already deselected above
      }
      const hit = design.layers
        .filter((layer) => layer.visible && !layer.locked)
        .filter((layer) => {
          const node = nodesRef.current.get(layer.id);
          if (!node) {
            return false;
          }
          const bounds = node.getClientRect({ skipShadow: true });
          return (
            bounds.x < rect.x + rect.width &&
            bounds.x + bounds.width > rect.x &&
            bounds.y < rect.y + rect.height &&
            bounds.y + bounds.height > rect.y
          );
        })
        .map((layer) => layer.id);
      setSelectedLayers(additive ? [...useEditorStore.getState().selectedLayerIds, ...hit.filter((id) => !useEditorStore.getState().selectedLayerIds.includes(id))] : hit);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const onStageContextMenu = (e: Konva.KonvaEventObject<MouseEvent>) => {
    e.evt.preventDefault();
    const targetId = e.target.id();
    const layer = design.layers.find((entry) => entry.id === targetId);
    if (layer) {
      if (!selectedLayerIds.includes(layer.id)) {
        selectLayer(layer.id);
      }
      openContextMenu({ x: e.evt.clientX, y: e.evt.clientY, layerId: layer.id });
    } else {
      closeContextMenu();
    }
  };

  // Drag-and-drop image upload: files dropped anywhere over the canvas area
  // are uploaded as assets and added as layers centered on the drop point.
  const onDragEnter = (e: ReactDragEvent) => {
    if (!e.dataTransfer.types.includes("Files")) {
      return;
    }
    e.preventDefault();
    dragDepth.current += 1;
    const items = Array.from(e.dataTransfer.items);
    setDropState(items.length > 0 && items.every((item) => item.type.startsWith("image/")) ? "ready" : "reject");
  };

  const onDragLeave = () => {
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) {
      setDropState(null);
    }
  };

  const onDrop = (e: ReactDragEvent) => {
    e.preventDefault();
    dragDepth.current = 0;
    setDropState(null);
    const files = Array.from(e.dataTransfer.files).filter((file) => file.type.startsWith("image/"));
    if (files.length === 0) {
      return;
    }
    const rect = naturalRef.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }
    // Post-transform bounding rect + current zoom factor → natural canvas coords.
    const dropX = (e.clientX - rect.left) / scale;
    const dropY = (e.clientY - rect.top) / scale;
    files.forEach((file, index) => {
      const centerX = Math.min(design.width, Math.max(0, dropX + 16 * index));
      const centerY = Math.min(design.height, Math.max(0, dropY + 16 * index));
      void api
        .uploadAsset(file)
        .then(({ asset }) => {
          bumpAssetsVersion();
          const img = new window.Image();
          img.onload = () => {
            addImageLayerAt(asset, img.naturalWidth || 1, img.naturalHeight || 1, centerX, centerY);
          };
          img.src = `/assets/${asset}`;
        })
        .catch(() => undefined);
    });
  };

  return (
    <div
      className="canvas-viewport"
      ref={containerRef}
      onPointerDown={(e) => {
        // Clicking the canvas releases focus from any inspector control so
        // keyboard shortcuts (copy/paste, nudge, delete) always work after
        // interacting with the canvas. Blurring also commits transient edits.
        const active = document.activeElement;
        const target = e.target;
        if (
          active instanceof HTMLElement &&
          (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.tagName === "SELECT") &&
          !(target instanceof HTMLElement && target.closest("input, textarea, select"))
        ) {
          active.blur();
        }
      }}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={(e) => {
        e.preventDefault();
      }}
      onDrop={onDrop}
    >
      {dropState && (
        <div className={dropState === "reject" ? "drop-overlay reject" : "drop-overlay"}>
          <span>{dropState === "reject" ? "Only image files can be dropped" : "Drop image to add it"}</span>
        </div>
      )}
      <div
        className="canvas-scale-box"
        style={{ width: design.width * scale, height: design.height * scale }}
      >
        <div
          className="canvas-natural"
          ref={naturalRef}
          style={{
            width: design.width,
            height: design.height,
            transform: `scale(${String(scale)})`,
          }}
        >
          <Stage
            width={design.width}
            height={design.height}
            onMouseDown={onStageMouseDown}
            onContextMenu={onStageContextMenu}
          >
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
              {hoverBox && (
                <Rect
                  x={hoverBox.x}
                  y={hoverBox.y}
                  width={hoverBox.width}
                  height={hoverBox.height}
                  stroke={accentColor}
                  strokeWidth={1 / scale}
                  listening={false}
                />
              )}
              {lockBadge && (
                <>
                  <Rect
                    x={lockBadge.x}
                    y={lockBadge.y}
                    width={lockBadge.width}
                    height={lockBadge.height}
                    stroke={accentColor}
                    strokeWidth={1.5 / scale}
                    listening={false}
                  />
                  <Group
                    x={lockBadge.x + lockBadge.width + 8 / scale}
                    y={lockBadge.y - 8 / scale}
                    onClick={(e) => {
                      e.cancelBubble = true;
                      useEditorStore.getState().toggleLockSelected();
                    }}
                    onTap={(e) => {
                      e.cancelBubble = true;
                      useEditorStore.getState().toggleLockSelected();
                    }}
                    onMouseEnter={(e) => {
                      const container = e.target.getStage()?.container();
                      if (container) {
                        container.style.cursor = "pointer";
                      }
                    }}
                    onMouseLeave={(e) => {
                      const container = e.target.getStage()?.container();
                      if (container) {
                        container.style.cursor = "";
                      }
                    }}
                  >
                    <Rect
                      width={26 / scale}
                      height={26 / scale}
                      offsetX={13 / scale}
                      offsetY={13 / scale}
                      cornerRadius={7 / scale}
                      fill={accentColor}
                      shadowColor="#000000"
                      shadowBlur={3 / scale}
                      shadowOffsetY={1 / scale}
                      shadowOpacity={0.3}
                    />
                    <Rect
                      x={-5 / scale}
                      y={-1 / scale}
                      width={10 / scale}
                      height={8 / scale}
                      cornerRadius={2 / scale}
                      fill="#ffffff"
                      listening={false}
                    />
                    <Arc
                      y={-1 / scale}
                      innerRadius={3.5 / scale}
                      outerRadius={3.5 / scale}
                      angle={180}
                      rotation={180}
                      stroke="#ffffff"
                      strokeWidth={2.2 / scale}
                      listening={false}
                    />
                  </Group>
                </>
              )}
              <Rect
                ref={marqueeRectRef}
                visible={false}
                listening={false}
                stroke={accentColor}
                strokeWidth={1 / scale}
                dash={[4, 4]}
                fill={`${accentColor}14`}
              />
              <Line
                ref={verticalGuideRef}
                visible={false}
                listening={false}
                stroke="#d946ef"
                strokeWidth={1 / scale}
              />
              <Line
                ref={horizontalGuideRef}
                visible={false}
                listening={false}
                stroke="#d946ef"
                strokeWidth={1 / scale}
              />
              <Transformer
                ref={transformerRef}
                rotateEnabled
                rotateAnchorAngle={180}
                rotateAnchorOffset={20}
                rotationSnaps={[0, 45, 90, 135, 180, 225, 270, 315]}
                rotationSnapTolerance={6}
                flipEnabled={false}
                keepRatio
                ignoreStroke
                enabledAnchors={enabledAnchors}
                anchorStyleFunc={anchorStyleFunc}
                onTransformStart={onTransformStart}
                onTransform={onTransform}
                onTransformEnd={onTransformEnd}
                anchorSize={8}
                anchorStroke={accentColor}
                borderStroke={accentColor}
              />
            </Layer>
          </Stage>
          {editingLayer?.type === "text" && (
            <TextEditorOverlay key={editingLayer.id} layer={editingLayer} nodesRef={nodesRef} />
          )}
        </div>
      </div>
    </div>
  );
}
