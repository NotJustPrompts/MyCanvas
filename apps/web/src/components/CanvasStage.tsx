import Konva from "konva";
import { type DragEvent as ReactDragEvent, useCallback, useEffect, useRef, useState } from "react";
import { Arc, Group, Image as KonvaImage, Layer, Line, Path, Rect, Stage, Transformer } from "react-konva";
import { type Design, type FrameContent, type Layer as EditorLayer } from "@mycanvas/shared";
import { api } from "../api";
import { useEditorStore, primarySelectedId } from "../store/editorStore";
import { getCachedImageSize, useImage } from "../hooks/useImage";
import { useTheme } from "../utils/theme";
import { setCanvasBridge } from "../utils/canvas-bridge";
import {
  clampContent,
  coverContent,
  coverScale,
  ASSET_DRAG_MIME,
  fillFrame,
  framePathData,
  getCurrentAssetDrag,
  recoverContent,
  traceFramePath,
} from "../utils/frames";
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

/** Distance from an inner page edge that means "drop = set as background". */
const EDGE_ZONE_PX = 48;

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
  if (layer.type === "frame" && node instanceof Konva.Container && (MIDDLE_X_ANCHORS.has(anchor) || MIDDLE_Y_ANCHORS.has(anchor))) {
    // Middle drags resize the frame box (delta-based, drag-start scale kept)
    // and re-cover the content for the new box — zoom ratio and visible
    // center preserved, like Canva.
    const baseX = baseScale.x === 0 ? 1 : baseScale.x;
    const baseY = baseScale.y === 0 ? 1 : baseScale.y;
    const prevW = node.width();
    const prevH = node.height();
    const newW = Math.max(20, (prevW * node.scaleX()) / baseX);
    const newH = Math.max(20, (prevH * node.scaleY()) / baseY);
    node.width(newW);
    node.height(newH);
    node.scaleX(baseScale.x);
    node.scaleY(baseScale.y);
    const imageNode = node.findOne("Image");
    if (layer.content && imageNode instanceof Konva.Image) {
      const natural = getCachedImageSize(`/assets/${layer.content.asset}`);
      if (natural) {
        const next = recoverContent(
          { asset: layer.content.asset, offsetX: imageNode.x(), offsetY: imageNode.y(), scale: imageNode.scaleX() },
          natural.width,
          natural.height,
          prevW,
          prevH,
          newW,
          newH,
        );
        imageNode.x(next.offsetX);
        imageNode.y(next.offsetY);
        imageNode.scaleX(next.scale);
        imageNode.scaleY(next.scale);
      }
    }
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
  const addImageLayerAsBackground = useEditorStore((state) => state.addImageLayerAsBackground);
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
  const [dropState, setDropState] = useState<"reject" | null>(null);
  /** Live drop-target cues during dragover: hovered frame / edge-zone / bitmap. */
  const [dropFrameId, setDropFrameId] = useState<string | null>(null);
  const [dropEdge, setDropEdge] = useState(false);
  const [dropAsset, setDropAsset] = useState<string | null>(null);
  /** Hover preview box (design coords); null while suppressed/nothing hovered. */
  const [hoverBox, setHoverBox] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  /** >0 suppresses the hover box: dragging, marquee-ing, or transforming. */
  const hoverSuppressRef = useRef(0);
  /** Canva-style multi-select boundaries: one accent hairline per member. */
  const [memberBoxes, setMemberBoxes] = useState<{ id: string; x: number; y: number; width: number; height: number }[]>([]);

  // Recompute the multi-select member boxes. Members of a non-entered group
  // collapse into one group box (a click selects the group as a whole).
  // Locked members keep their box — they are in the selection, just inert.
  const recomputeMemberBoxes = useCallback(() => {
    const state = useEditorStore.getState();
    const ids = state.selectedLayerIds;
    const design = state.design;
    if (!design || ids.length <= 1 || state.editingTextLayerId || state.editingFrameId) {
      setMemberBoxes([]);
      return;
    }
    interface Accum {
      minX: number;
      minY: number;
      maxX: number;
      maxY: number;
    }
    const boxes: { id: string; x: number; y: number; width: number; height: number }[] = [];
    const groupAcc = new Map<string, Accum>();
    for (const id of ids) {
      const layer = design.layers.find((entry) => entry.id === id);
      const node = layer ? nodesRef.current.get(id) : undefined;
      if (!layer?.visible || !node) {
        continue;
      }
      const rect = node.getClientRect({ skipShadow: true });
      const groupId = layer.groupId && layer.groupId !== state.editingGroupId ? layer.groupId : null;
      if (groupId) {
        const acc = groupAcc.get(groupId);
        if (acc) {
          acc.minX = Math.min(acc.minX, rect.x);
          acc.minY = Math.min(acc.minY, rect.y);
          acc.maxX = Math.max(acc.maxX, rect.x + rect.width);
          acc.maxY = Math.max(acc.maxY, rect.y + rect.height);
        } else {
          groupAcc.set(groupId, { minX: rect.x, minY: rect.y, maxX: rect.x + rect.width, maxY: rect.y + rect.height });
        }
      } else {
        boxes.push({ id, x: rect.x, y: rect.y, width: rect.width, height: rect.height });
      }
    }
    for (const [groupId, acc] of groupAcc) {
      boxes.push({ id: groupId, x: acc.minX, y: acc.minY, width: acc.maxX - acc.minX, height: acc.maxY - acc.minY });
    }
    setMemberBoxes(boxes);
  }, []);

  const transparent = design.background === "transparent";
  const checkerImage = useImage(transparent ? getCheckerDataUrl() : undefined);
  const theme = useTheme();
  // Mirrors the --accent token so the selection frame reads on-brand.
  const accentColor = theme === "dark" ? "#a78bfa" : "#7c3aed";
  // Neutral gray for the unified multi-select boundary (distinct from accent).
  const neutralLine = theme === "dark" ? "#9a9aa5" : "#6e6e7a";
  const editingTextLayerId = useEditorStore((state) => state.editingTextLayerId);
  const editingFrameId = useEditorStore((state) => state.editingFrameId);
  /** Accent outline rect for the frame content-edit mode (no anchors). */
  const [contentEditBox, setContentEditBox] = useState<{ x: number; y: number; width: number; height: number } | null>(null);

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
      // Keep multi-select member boxes tracking during group drags.
      node.on("dragmove.boundaries", recomputeMemberBoxes);

      // Hover preview box: outline the layer under the pointer (or its whole
      // group — that's what a click would select; inside an entered group, the
      // member). Suppressed while dragging/marquee-ing/transforming and for
      // selected layers (they have the real transformer frame).
      node.on("mouseenter.hover", () => {
        if (hoverSuppressRef.current > 0) {
          return;
        }
        const state = useEditorStore.getState();
        if (state.selectedLayerIds.includes(id) || state.editingTextLayerId || state.editingFrameId) {
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
    [design.width, design.height, hideGuides, recomputeMemberBoxes],
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
    recomputeMemberBoxes();
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
    if ((isMiddleX || isMiddleY) && layer.type === "frame" && node instanceof Konva.Container) {
      // The live bake resized + re-covered; absorb the residual delta, round
      // the box, clamp the content against it, and commit one entry.
      bakeMiddleTransform(node, layer, anchor, transformBaseScaleRef.current);
      const width = Math.max(20, Math.round(node.width()));
      const height = Math.max(20, Math.round(node.height()));
      node.width(width);
      node.height(height);
      const prev = layer.content;
      let content: FrameContent | undefined;
      const imageNode = node.findOne("Image");
      if (prev && imageNode instanceof Konva.Image) {
        const natural = getCachedImageSize(`/assets/${prev.asset}`);
        if (natural) {
          content = clampContent(
            { asset: prev.asset, offsetX: imageNode.x(), offsetY: imageNode.y(), scale: imageNode.scaleX() },
            natural.width,
            natural.height,
            width,
            height,
          );
          imageNode.x(content.offsetX);
          imageNode.y(content.offsetY);
          imageNode.scaleX(content.scale);
          imageNode.scaleY(content.scale);
        }
      }
      updateLayer(layer.id, {
        ...pos,
        width,
        height,
        scaleX: node.scaleX(),
        scaleY: node.scaleY(),
        ...(content ? { content } : {}),
      });
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
  // in place or panning frame content, so the frame doesn't fight the edit).
  // Locked layers keep their selection but never get the transformer — no
  // anchors, no rotate.
  useEffect(() => {
    const transformer = transformerRef.current;
    if (!transformer) {
      return;
    }
    const nodes = editingTextLayerId || editingFrameId
      ? []
      : selectedLayerIds
          .map((id) => {
            const layer = design.layers.find((entry) => entry.id === id);
            return layer?.visible && !layer.locked ? nodesRef.current.get(id) : undefined;
          })
          .filter((node): node is Konva.Node => Boolean(node));
    transformer.nodes(nodes);
    transformer.getLayer()?.batchDraw();
  }, [selectedLayerIds, design.layers, editingTextLayerId, editingFrameId]);

  // Frame content-edit mode (double-click a filled frame): drag pans the
  // image (clamped to cover), wheel zooms (clamped ≥ cover scale, anchored at
  // the pointer), Enter/Escape/click-away commits as ONE history entry. All
  // intermediate states are imperative node writes only.
  useEffect(() => {
    setContentEditBox(null);
    if (!editingFrameId) {
      return;
    }
    const state = useEditorStore.getState();
    const node = nodesRef.current.get(editingFrameId);
    const layer = state.design?.layers.find((entry) => entry.id === editingFrameId);
    if (!node || !(node instanceof Konva.Container) || layer?.type !== "frame" || !layer.content) {
      return;
    }
    const imageNode = node.findOne("Image");
    const natural = getCachedImageSize(`/assets/${layer.content.asset}`);
    if (!(imageNode instanceof Konva.Image) || !natural) {
      return;
    }
    const stage = node.getStage();
    if (!stage) {
      return;
    }

    const draft = { ...layer.content };
    const applyDraft = () => {
      imageNode.x(draft.offsetX);
      imageNode.y(draft.offsetY);
      imageNode.scaleX(draft.scale);
      imageNode.scaleY(draft.scale);
      node.getLayer()?.batchDraw();
    };
    const rect = node.getClientRect({ skipShadow: true });
    setContentEditBox({ x: rect.x, y: rect.y, width: rect.width, height: rect.height });

    const clampDraft = () => {
      const next = clampContent(draft, natural.width, natural.height, node.width(), node.height());
      draft.offsetX = next.offsetX;
      draft.offsetY = next.offsetY;
      draft.scale = next.scale;
    };

    // Pan: mousedown on the frame tracks pointer deltas. Convert screen deltas
    // to frame-local units (derotate, unscale) so rotated/scaled frames pan
    // true to the cursor.
    let panning = false;
    let lastX = 0;
    let lastY = 0;
    const onMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
      e.cancelBubble = true;
      panning = true;
      lastX = e.evt.clientX;
      lastY = e.evt.clientY;
    };
    const onMove = (ev: MouseEvent) => {
      if (!panning) {
        return;
      }
      const dx = ev.clientX - lastX;
      const dy = ev.clientY - lastY;
      lastX = ev.clientX;
      lastY = ev.clientY;
      const theta = (node.rotation() * Math.PI) / 180;
      const gs = Math.abs(node.scaleX()) || 1;
      draft.offsetX += ((dx * Math.cos(theta) + dy * Math.sin(theta)) / gs) * (1 / scaleRef.current);
      draft.offsetY += ((-dx * Math.sin(theta) + dy * Math.cos(theta)) / gs) * (1 / scaleRef.current);
      clampDraft();
      applyDraft();
    };
    const onUp = () => {
      panning = false;
    };

    // Wheel zoom anchored at the pointer (frame-local point stays fixed).
    const onWheel = (ev: WheelEvent) => {
      const containerRect = naturalRef.current?.getBoundingClientRect();
      if (!containerRect) {
        return;
      }
      const point = {
        x: (ev.clientX - containerRect.left) / scaleRef.current,
        y: (ev.clientY - containerRect.top) / scaleRef.current,
      };
      const local = node.getAbsoluteTransform().copy().invert().point(point);
      if (local.x < 0 || local.y < 0 || local.x > node.width() || local.y > node.height()) {
        return; // wheel outside the frame — leave to the page
      }
      ev.preventDefault();
      const minScale = coverScale(natural.width, natural.height, node.width(), node.height());
      const next = Math.min(minScale * 16, Math.max(minScale, draft.scale * Math.exp(-ev.deltaY * 0.0015)));
      draft.offsetX = local.x - ((local.x - draft.offsetX) / draft.scale) * next;
      draft.offsetY = local.y - ((local.y - draft.offsetY) / draft.scale) * next;
      draft.scale = next;
      clampDraft();
      applyDraft();
    };

    const commit = () => {
      const store = useEditorStore.getState();
      store.setEditingFrame(null);
      const current = store.design?.layers.find((entry) => entry.id === editingFrameId);
      if (
        current?.type === "frame" &&
        current.content &&
        (current.content.offsetX !== draft.offsetX ||
          current.content.offsetY !== draft.offsetY ||
          current.content.scale !== draft.scale)
      ) {
        store.updateLayer(editingFrameId, { content: { ...draft } });
      }
    };
    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key === "Enter" || ev.key === "Escape") {
        ev.stopPropagation();
        commit();
      }
    };
    const onStageMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
      let cursor: Konva.Node | null = e.target;
      while (cursor && cursor !== stage) {
        if (cursor.id() === editingFrameId) {
          return; // click on the frame itself — pan territory
        }
        cursor = cursor.getParent();
      }
      commit(); // click-away
    };

    node.on("mousedown.contentedit", onMouseDown);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    stage.container().addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("keydown", onKeyDown, { capture: true });
    stage.on("mousedown.contentedit", onStageMouseDown);
    return () => {
      node.off("mousedown.contentedit");
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      stage.container().removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onKeyDown, { capture: true });
      stage.off("mousedown.contentedit");
      setContentEditBox(null);
    };
    // The mode owns the node imperatively until exit; deps intentionally stop
    // at the id (layer/natural are captured at entry).
  }, [editingFrameId]);

  // The hover box is a transient pointer aid: drop it on zoom and whenever the
  // selection changes (a freshly clicked layer shows the real transformer).
  useEffect(() => {
    setHoverBox(null);
  }, [scale, selectedLayerIds]);

  // Multi-select member boxes follow selection/content changes; live tracking
  // during drags/transforms comes from the node/transformer event hooks.
  useEffect(() => {
    recomputeMemberBoxes();
  }, [recomputeMemberBoxes, selectedLayerIds, design.layers, editingTextLayerId, editingFrameId]);

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
    // Walk up from the hit child (frame hit plate, text glyph nodes) to the
    // node carrying the layer id.
    let target: Konva.Node | null = e.target;
    let targetId = target.id();
    while (!targetId && target) {
      target = target.getParent();
      targetId = target?.id() ?? "";
    }
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

  // Drag-and-drop: no global overlay. Valid drags show contextual cues on the
  // canvas (frame target highlight + image preview, edge-zone background
  // preview); only non-image drags get a small reject pill.
  const onDragEnter = (e: ReactDragEvent) => {
    const isAssetDrag = e.dataTransfer.types.includes(ASSET_DRAG_MIME);
    if (!isAssetDrag && !e.dataTransfer.types.includes("Files")) {
      return;
    }
    e.preventDefault();
    dragDepth.current += 1;
    const items = Array.from(e.dataTransfer.items);
    setDropState(isAssetDrag || (items.length > 0 && items.every((item) => item.type.startsWith("image/"))) ? null : "reject");
  };

  const onDragLeave = () => {
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) {
      setDropState(null);
      clearDropCues();
    }
  };

  const clearDropCues = () => {
    setDropFrameId(null);
    setDropEdge(false);
    setDropAsset(null);
  };

  /** Loads an asset's natural size (cached when possible) and inserts it as the cover-fit background layer. */
  const addBackgroundFromAsset = (asset: string) => {
    const cached = getCachedImageSize(`/assets/${asset}`);
    if (cached) {
      addImageLayerAsBackground(asset, cached.width, cached.height);
      return;
    }
    const img = new window.Image();
    img.onload = () => {
      addImageLayerAsBackground(asset, img.naturalWidth || 1, img.naturalHeight || 1);
    };
    img.src = `/assets/${asset}`;
  }; ;

  /** Pointer inside the page but within EDGE_ZONE_PX screen px of an inner edge. */
  const isInEdgeZone = (clientX: number, clientY: number): boolean => {
    const rect = naturalRef.current?.getBoundingClientRect();
    if (!rect) {
      return false;
    }
    if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) {
      return false;
    }
    return (
      clientX - rect.left < EDGE_ZONE_PX ||
      rect.right - clientX < EDGE_ZONE_PX ||
      clientY - rect.top < EDGE_ZONE_PX ||
      rect.bottom - clientY < EDGE_ZONE_PX
    );
  };

  const onDragOver = (e: ReactDragEvent) => {
    e.preventDefault();
    const isAsset = e.dataTransfer.types.includes(ASSET_DRAG_MIME);
    if (!isAsset && !e.dataTransfer.types.includes("Files")) {
      return;
    }
    if (!isAsset) {
      // Non-image file drag: reject pill only, no drop-target cues.
      const items = Array.from(e.dataTransfer.items);
      if (items.length > 0 && !items.every((item) => item.type.startsWith("image/"))) {
        setDropFrameId(null);
        setDropEdge(false);
        setDropAsset(null);
        return;
      }
    }
    // Precedence: frame hit > edge zone (background) > plain add-at-point.
    const frameId = frameLayerIdAt(e.clientX, e.clientY);
    setDropFrameId(frameId);
    setDropEdge(!frameId && isInEdgeZone(e.clientX, e.clientY));
    // The bitmap is only known for Uploads drags (module stash — getData is
    // unreadable during dragover); filesystem drags get highlight-only cues.
    setDropAsset(isAsset ? getCurrentAssetDrag() : null);
  };

  /**
   * The topmost FRAME layer under a client point, or null. Hit-tests the
   * content layer only (overlay chrome like the transformer never interferes)
   * and walks up from the hit child to its layer node.
   */
  const frameLayerIdAt = (clientX: number, clientY: number): string | null => {
    const layer = contentLayerRef.current;
    const rect = naturalRef.current?.getBoundingClientRect();
    if (!layer || !rect) {
      return null;
    }
    const point = {
      x: (clientX - rect.left) / scaleRef.current,
      y: (clientY - rect.top) / scaleRef.current,
    };
    let hit: Konva.Node | null = layer.getIntersection(point);
    while (hit && hit !== layer) {
      const id = hit.id();
      if (id) {
        const found = useEditorStore.getState().design?.layers.find((entry) => entry.id === id);
        return found?.type === "frame" ? id : null;
      }
      hit = hit.getParent();
    }
    return null;
  };

  const onDrop = (e: ReactDragEvent) => {
    e.preventDefault();
    dragDepth.current = 0;
    setDropState(null);
    const rect = naturalRef.current?.getBoundingClientRect();
    if (!rect) {
      clearDropCues();
      return;
    }
    // Post-transform bounding rect + current zoom factor → natural canvas coords.
    const dropX = (e.clientX - rect.left) / scale;
    const dropY = (e.clientY - rect.top) / scale;
    // Drop logic mirrors the dragover previews: same hit tests, same precedence.
    const frameId = frameLayerIdAt(e.clientX, e.clientY);
    const edge = !frameId && isInEdgeZone(e.clientX, e.clientY);
    clearDropCues();

    const assetDrag = e.dataTransfer.getData(ASSET_DRAG_MIME);
    if (assetDrag) {
      if (frameId) {
        void fillFrame(frameId, assetDrag);
        return;
      }
      if (edge) {
        addBackgroundFromAsset(assetDrag);
        return;
      }
      const img = new window.Image();
      img.onload = () => {
        addImageLayerAt(assetDrag, img.naturalWidth || 1, img.naturalHeight || 1, dropX, dropY);
      };
      img.src = `/assets/${assetDrag}`;
      return;
    }

    const files = Array.from(e.dataTransfer.files).filter((file) => file.type.startsWith("image/"));
    if (files.length === 0) {
      return;
    }
    files.forEach((file, index) => {
      const centerX = Math.min(design.width, Math.max(0, dropX + 16 * index));
      const centerY = Math.min(design.height, Math.max(0, dropY + 16 * index));
      void api
        .uploadAsset(file)
        .then(({ asset }) => {
          bumpAssetsVersion();
          // First file claims the targeted mode (frame fill / edge background);
          // the rest land at the drop point as usual.
          if (index === 0 && frameId) {
            void fillFrame(frameId, asset);
            return;
          }
          if (index === 0 && edge) {
            addBackgroundFromAsset(asset);
            return;
          }
          const img = new window.Image();
          img.onload = () => {
            addImageLayerAt(asset, img.naturalWidth || 1, img.naturalHeight || 1, centerX, centerY);
          };
          img.src = `/assets/${asset}`;
        })
        .catch(() => undefined);
    });
  };

  // Drop-target cue data (dragover previews; the bitmap is only known for
  // Uploads drags — filesystem drags get highlight-only cues).
  const dropCueCandidate = dropFrameId ? design.layers.find((entry) => entry.id === dropFrameId) : undefined;
  const dropFrameCue = dropCueCandidate?.type === "frame" ? dropCueCandidate : undefined;
  const dropPreviewImage = useImage(dropAsset ? `/assets/${dropAsset}` : undefined);
  const dropFrameCover =
    dropPreviewImage && dropFrameCue
      ? coverContent("", dropPreviewImage.naturalWidth, dropPreviewImage.naturalHeight, dropFrameCue.width, dropFrameCue.height)
      : null;
  const dropBgCover = dropPreviewImage
    ? coverContent("", dropPreviewImage.naturalWidth, dropPreviewImage.naturalHeight, design.width, design.height)
    : null;

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
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      {dropState === "reject" && (
        <div className="content-edit-hint drop-hint drop-reject-hint">Only image files can be dropped</div>
      )}
      {dropEdge && <div className="content-edit-hint drop-hint">Drop to set as background</div>}
      {editingFrameId && (
        <div className="content-edit-hint">Editing image — drag to pan, scroll to zoom · Enter to commit</div>
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
              {memberBoxes.length > 0 && (
                <>
                  {memberBoxes.length > 1 && (
                    <Rect
                      x={Math.min(...memberBoxes.map((box) => box.x))}
                      y={Math.min(...memberBoxes.map((box) => box.y))}
                      width={Math.max(...memberBoxes.map((box) => box.x + box.width)) - Math.min(...memberBoxes.map((box) => box.x))}
                      height={Math.max(...memberBoxes.map((box) => box.y + box.height)) - Math.min(...memberBoxes.map((box) => box.y))}
                      stroke={neutralLine}
                      strokeWidth={1 / scale}
                      dash={[6 / scale, 4 / scale]}
                      listening={false}
                    />
                  )}
                  {memberBoxes.map((box) => (
                    <Rect
                      key={box.id}
                      x={box.x}
                      y={box.y}
                      width={box.width}
                      height={box.height}
                      stroke={accentColor}
                      strokeWidth={1 / scale}
                      listening={false}
                    />
                  ))}
                </>
              )}
              {dropFrameCue && (
                <Group
                  x={dropFrameCue.x}
                  y={dropFrameCue.y}
                  rotation={dropFrameCue.rotation}
                  scaleX={dropFrameCue.scaleX}
                  scaleY={dropFrameCue.scaleY}
                  listening={false}
                >
                  <Group
                    clipFunc={(ctx) => {
                      traceFramePath(
                        ctx,
                        dropFrameCue.shape,
                        dropFrameCue.width,
                        dropFrameCue.height,
                        dropFrameCue.cornerRadius ?? 0,
                      );
                    }}
                    listening={false}
                  >
                    <Rect width={dropFrameCue.width} height={dropFrameCue.height} fill={accentColor} opacity={0.18} />
                    {dropPreviewImage && dropFrameCover && (
                      <KonvaImage
                        image={dropPreviewImage}
                        x={dropFrameCover.offsetX}
                        y={dropFrameCover.offsetY}
                        scaleX={dropFrameCover.scale}
                        scaleY={dropFrameCover.scale}
                        opacity={0.6}
                      />
                    )}
                  </Group>
                  <Path
                    data={framePathData(
                      dropFrameCue.shape,
                      dropFrameCue.width,
                      dropFrameCue.height,
                      dropFrameCue.cornerRadius ?? 0,
                    )}
                    stroke={accentColor}
                    strokeWidth={1.5 / (scale * (Math.abs(dropFrameCue.scaleX) || 1))}
                  />
                </Group>
              )}
              {dropEdge &&
                (dropPreviewImage && dropBgCover
                  ? (
                      <KonvaImage
                        image={dropPreviewImage}
                        x={dropBgCover.offsetX}
                        y={dropBgCover.offsetY}
                        scaleX={dropBgCover.scale}
                        scaleY={dropBgCover.scale}
                        opacity={0.5}
                        listening={false}
                      />
                    )
                  : (
                      <Rect
                        x={0}
                        y={0}
                        width={design.width}
                        height={design.height}
                        fill={accentColor}
                        opacity={0.12}
                        stroke={accentColor}
                        strokeWidth={2 / scale}
                        listening={false}
                      />
                    ))}
              {contentEditBox && (
                <Rect
                  x={contentEditBox.x}
                  y={contentEditBox.y}
                  width={contentEditBox.width}
                  height={contentEditBox.height}
                  stroke={accentColor}
                  strokeWidth={1.5 / scale}
                  dash={[6 / scale, 4 / scale]}
                  listening={false}
                />
              )}
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
                borderEnabled={selectedLayerIds.length <= 1}
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
