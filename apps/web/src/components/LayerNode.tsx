import Konva from "konva";
import { useCallback, useEffect, useRef, useState } from "react";
import { Ellipse, Group, Image as KonvaImage, Line, Path, Rect, Text, TextPath } from "react-konva";
import {
  type ImageLayer,
  type Layer,
  type LineLayer,
  type RectLayer,
  type ShadowEffect,
  type ShapeLayer,
  type StrokeEffect,
  type TextLayer,
} from "@mycanva/shared";
import { useImage } from "../hooks/useImage";
import { useEditorStore } from "../store/editorStore";
import { ensureFontLoaded } from "../utils/fonts";
import { roundedPolygonPath, semicirclePoints } from "../utils/rounded-path";

interface LayerNodeProps {
  layer: Layer;
  registerRef: (id: string, node: Konva.Node | null) => void;
}

function shadowProps(shadow: ShadowEffect) {
  if (!shadow.enabled) {
    return { shadowEnabled: false };
  }
  return {
    shadowEnabled: true,
    shadowColor: shadow.color,
    shadowBlur: shadow.blur,
    shadowOffsetX: shadow.offsetX,
    shadowOffsetY: shadow.offsetY,
    shadowOpacity: shadow.opacity,
  };
}

function strokeProps(stroke: StrokeEffect) {
  return {
    strokeEnabled: stroke.enabled,
    stroke: stroke.color,
    strokeWidth: stroke.width,
  };
}

function useCommonNodeProps(layer: Layer, registerRef: (id: string, node: Konva.Node | null) => void) {
  const selectLayer = useEditorStore((state) => state.selectLayer);
  const toggleSelectLayer = useEditorStore((state) => state.toggleSelectLayer);
  const localRef = useRef<Konva.Node | null>(null);

  const setRefs = (node: Konva.Node | null) => {
    localRef.current = node;
    registerRef(layer.id, node);
  };

  const handlePress = (layerId: string, shiftKey: boolean) => {
    if (shiftKey) {
      toggleSelectLayer(layerId);
      return;
    }
    // Keep an existing multi-selection when the press lands on a member.
    if (!useEditorStore.getState().selectedLayerIds.includes(layerId)) {
      selectLayer(layerId);
    }
  };

  // Note: dragend and transformend persistence live in CanvasStage (group drags
  // and multi-transforms write back whole selection sets in one history entry).
  const common = {
    id: layer.id,
    x: layer.x,
    y: layer.y,
    scaleX: layer.scaleX,
    scaleY: layer.scaleY,
    rotation: layer.rotation,
    opacity: layer.opacity,
    visible: layer.visible,
    // Locked layers stay clickable (selection) but can't be dragged.
    draggable: !layer.locked,
    onMouseDown: (e: Konva.KonvaEventObject<MouseEvent>) => {
      handlePress(layer.id, e.evt.shiftKey);
    },
    onDblClick: () => {
      // Double-click a group member to enter the group for isolated editing.
      if (!layer.groupId) {
        return;
      }
      const state = useEditorStore.getState();
      if (state.editingGroupId !== layer.groupId) {
        state.setEditingGroup(layer.groupId);
        state.setSelectedLayers([layer.id]);
      }
    },
    // Drag write-back happens via node listeners in CanvasStage; this prop only
    // silences react-konva's draggable-without-drag-handler warning.
    onDragMove: () => undefined,
  };

  return { common, setRefs, localRef };
}

/**
 * SVG arc data for a text layer bent by `curve` (-100…100). W is the measured
 * flat text width; the text rides a circle of radius R = W/Θ with
 * Θ = (|C|/100)·2π. Positive C arches (circle below), negative C smiles
 * (circle above, sweep reversed so the text reads left-to-right).
 */
function curveArcData(textWidth: number, fontSize: number, curve: number): string {
  const theta = Math.min(1, Math.abs(curve) / 100) * 2 * Math.PI;
  const radius = textWidth / theta;
  const half = theta / 2;
  const sin = Math.sin(half);
  const cos = Math.cos(half);
  const largeArc = theta > Math.PI ? 1 : 0;
  const cx = textWidth / 2;
  // Anchor the glyph caps: arch peaks at y≈0, smile starts at y≈0 at the ends.
  const cy = curve > 0 ? radius + fontSize * 0.8 : fontSize * 0.8 - radius * cos;
  const startX = cx - radius * sin;
  const endX = cx + radius * sin;
  const startY = curve > 0 ? cy - radius * cos : cy + radius * cos;
  const endY = startY;
  const sweep = curve > 0 ? 1 : 0;
  return `M ${String(startX)} ${String(startY)} A ${String(radius)} ${String(radius)} 0 ${String(largeArc)} ${String(sweep)} ${String(endX)} ${String(endY)}`;
}

const GLITCH_COLORS: Record<string, [string, string]> = {
  "cyan-magenta": ["#00e5ff", "#ff00c8"],
  "red-blue": ["#ff2d2d", "#2d6bff"],
};

interface TextContentProps {
  fill?: string;
  strokeEnabled?: boolean;
  strokeColor?: string;
  strokeThickness?: number;
  shadow?: ShadowEffect;
  x?: number;
  y?: number;
  listening?: boolean;
  refCallback?: (node: Konva.Text | Konva.TextPath | null) => void;
}

/**
 * Measures text width exactly the way Konva.TextPath lays it out (per-glyph
 * advance sum + letterSpacing), so the generated arc is long enough and no
 * trailing glyphs get clipped.
 */
function measurePathTextWidth(text: string, layer: TextLayer): number {
  const scratch = new Konva.TextPath({
    text,
    fontFamily: layer.fontFamily,
    fontSize: layer.fontSize,
    fontStyle: layer.fontStyle,
    letterSpacing: layer.letterSpacing,
    data: "M0 0 L10 0",
  });
  const width = scratch.getTextWidth() + Math.max(0, text.length - 1) * layer.letterSpacing;
  scratch.destroy();
  return width;
}

function TextNode({ layer, registerRef }: { layer: TextLayer } & LayerNodeProps) {
  const { common, setRefs, localRef } = useCommonNodeProps(layer, registerRef);
  const setEditingTextLayer = useEditorStore((state) => state.setEditingTextLayer);
  const curve = layer.curve ?? 0;
  const effect = layer.effect ?? { type: "none" as const };
  const [lineWidths, setLineWidths] = useState<number[]>([]);
  const mainTextRef = useRef<Konva.Text | Konva.TextPath | null>(null);

  const setMainRef = (node: Konva.Text | Konva.TextPath | null) => {
    mainTextRef.current = node;
    localRef.current = node;
  };

  const measureLines = useCallback(() => {
    const node = mainTextRef.current;
    if (node instanceof Konva.Text) {
      setLineWidths(node.textArr.map((line) => line.width));
    }
  }, []);

  useEffect(() => {
    void ensureFontLoaded(layer.fontFamily).then(() => {
      localRef.current?.getLayer()?.batchDraw();
      measureLines();
    });
  }, [layer.fontFamily, localRef, measureLines]);

  useEffect(() => {
    measureLines();
  }, [measureLines, layer.text, layer.fontSize, layer.fontStyle, layer.letterSpacing, layer.wrapWidth, layer.lineHeight, curve]);

  const openEditor = () => {
    // Grouped text: first double-click enters the group, second edits the text.
    const state = useEditorStore.getState();
    if (layer.groupId && state.editingGroupId !== layer.groupId) {
      state.setEditingGroup(layer.groupId);
      state.setSelectedLayers([layer.id]);
      return;
    }
    setEditingTextLayer(layer.id);
  };

  const flatText = curve !== 0 ? layer.text.replace(/\s*\n\s*/g, " ") : layer.text;
  const arcData =
    curve !== 0
      ? curveArcData(Math.max(1, measurePathTextWidth(flatText, layer)), layer.fontSize, curve)
      : null;

  /** The text node itself (TextPath when curved), without the common layer props. */
  const content = (key: string, props: TextContentProps) => {
    const shared = {
      text: flatText,
      fontFamily: layer.fontFamily,
      fontSize: layer.fontSize,
      fontStyle: layer.fontStyle,
      letterSpacing: layer.letterSpacing,
      fill: props.fill ?? layer.fill,
      x: props.x ?? 0,
      y: props.y ?? 0,
      listening: props.listening,
      fillEnabled: props.fill !== undefined ? true : undefined,
      strokeEnabled: props.strokeEnabled,
      stroke: props.strokeColor,
      strokeWidth: props.strokeThickness,
      ...shadowProps(props.shadow ?? { enabled: false, color: "#000000", blur: 0, offsetX: 0, offsetY: 0, opacity: 0 }),
    };
    if (arcData) {
      return <TextPath key={key} ref={props.refCallback} data={arcData} {...shared} />;
    }
    return (
      <Text
        key={key}
        ref={props.refCallback}
        align={layer.align}
        lineHeight={layer.lineHeight}
        width={layer.wrapWidth > 0 ? layer.wrapWidth : undefined}
        {...shared}
      />
    );
  };

  if (effect.type === "none") {
    return (
      <Group
        ref={setRefs}
        {...common}
        onDblClick={openEditor}
        onDblTap={openEditor}
      >
        {content("main", { refCallback: setMainRef })}
      </Group>
    );
  }

  const effectAngle = "angle" in effect ? effect.angle : 0;
  const effectDistance = "distance" in effect ? effect.distance : 0;
  const rad = (effectAngle * Math.PI) / 180;
  const dx = effectDistance * Math.cos(rad);
  const dy = effectDistance * Math.sin(rad);

  const children = [];
  if (effect.type === "shadow") {
    children.push(
      content("main", {
        refCallback: setMainRef,
        shadow: {
          enabled: true,
          color: effect.color,
          blur: effect.blur,
          offsetX: dx,
          offsetY: dy,
          opacity: effect.opacity,
        },
      }),
    );
  } else if (effect.type === "outline") {
    // Stroke-only copy at 2x thickness behind the fill copy — the fill paints
    // over the inner half of the stroke, so the outline never swallows it.
    children.push(
      content("outline", { fill: effect.color, strokeEnabled: true, strokeColor: effect.color, strokeThickness: effect.thickness * 2, listening: false }),
      content("main", { refCallback: setMainRef }),
    );
  } else if (effect.type === "echo") {
    children.push(
      content("echo-2", { fill: effect.color, x: dx * 2, y: dy * 2, listening: false }),
      content("echo-1", { fill: effect.color, x: dx, y: dy, listening: false }),
      content("main", { refCallback: setMainRef }),
    );
  } else if (effect.type === "glitch") {
    const [colorA, colorB] = GLITCH_COLORS[effect.colorPair] ?? GLITCH_COLORS["cyan-magenta"] ?? ["#00e5ff", "#ff00c8"];
    children.push(
      content("glitch-a", { fill: colorA, x: dx, y: dy, listening: false }),
      content("glitch-b", { fill: colorB, x: -dx, y: -dy, listening: false }),
      content("main", { refCallback: setMainRef }),
    );
  } else if (effect.type === "background") {
    const bandWidth = layer.fontSize * layer.lineHeight + effect.spread;
    const cap = effect.roundness >= 50 ? "round" : effect.roundness >= 20 ? "square" : "butt";
    if (arcData) {
      children.push(
        <Path
          key="band"
          data={arcData}
          stroke={effect.color}
          strokeWidth={layer.fontSize + effect.spread}
          lineCap={cap}
          lineJoin={effect.roundness >= 50 ? "round" : "miter"}
          opacity={effect.opacity}
          listening={false}
          fillEnabled={false}
        />,
      );
    } else {
      const totalWidth = layer.wrapWidth > 0 ? layer.wrapWidth : Math.max(...lineWidths, 0);
      const lineHeightPx = layer.fontSize * layer.lineHeight;
      lineWidths.forEach((lineWidth, index) => {
        const x0 = layer.align === "center" ? (totalWidth - lineWidth) / 2 : layer.align === "right" ? totalWidth - lineWidth : 0;
        const y = index * lineHeightPx + lineHeightPx / 2;
        children.push(
          <Line
            key={`band-${String(index)}`}
            points={[x0, y, x0 + lineWidth, y]}
            stroke={effect.color}
            strokeWidth={bandWidth}
            lineCap={cap}
            opacity={effect.opacity}
            listening={false}
          />,
        );
      });
    }
    children.push(content("main", { refCallback: setMainRef }));
  }

  return (
    <Group
      ref={setRefs}
      {...common}
      onDblClick={openEditor}
      onDblTap={openEditor}
    >
      {children}
    </Group>
  );
}

function ImageNode({ layer, registerRef }: { layer: ImageLayer } & LayerNodeProps) {
  const { common, setRefs } = useCommonNodeProps(layer, registerRef);
  const image = useImage(`/assets/${layer.asset}`);
  return (
    <KonvaImage
      ref={setRefs}
      image={image}
      width={layer.width}
      height={layer.height}
      crop={layer.crop}
      {...shadowProps(layer.shadow)}
      {...common}
    />
  );
}

function RectNode({ layer, registerRef }: { layer: RectLayer } & LayerNodeProps) {
  const { common, setRefs } = useCommonNodeProps(layer, registerRef);
  return (
    <Rect
      ref={setRefs}
      width={layer.width}
      height={layer.height}
      fill={layer.fill}
      cornerRadius={layer.cornerRadius}
      {...strokeProps(layer.stroke)}
      {...shadowProps(layer.shadow)}
      {...common}
    />
  );
}

function LineNode({ layer, registerRef }: { layer: LineLayer } & LayerNodeProps) {
  const { common, setRefs } = useCommonNodeProps(layer, registerRef);
  return (
    <Line
      ref={setRefs}
      points={layer.points}
      stroke={layer.strokeColor}
      strokeWidth={layer.strokeWidth}
      lineCap={layer.lineCap}
      hitStrokeWidth={Math.max(12, layer.strokeWidth)}
      {...shadowProps(layer.shadow)}
      {...common}
    />
  );
}

function starPoints(width: number, height: number): number[] {
  const raw: number[] = [];
  for (let i = 0; i < 10; i += 1) {
    const outer = i % 2 === 0;
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    const radius = outer ? 1 : 0.42;
    raw.push(radius * Math.cos(angle), radius * Math.sin(angle));
  }
  // Normalize so the star's bounding box spans the full layer box — Konva
  // derives a Line's width/height from its points, and the resize math
  // depends on node dimensions matching the layer's declared box.
  const xs = raw.filter((_, index) => index % 2 === 0);
  const ys = raw.filter((_, index) => index % 2 === 1);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const points: number[] = [];
  for (let i = 0; i < raw.length; i += 2) {
    const px = raw[i] ?? 0;
    const py = raw[i + 1] ?? 0;
    points.push(((px - minX) / (maxX - minX)) * width, ((py - minY) / (maxY - minY)) * height);
  }
  return points;
}

function ShapeNode({ layer, registerRef }: { layer: ShapeLayer } & LayerNodeProps) {
  const { common, setRefs } = useCommonNodeProps(layer, registerRef);
  const shared = {
    ref: setRefs,
    fill: layer.fill,
    ...strokeProps(layer.stroke),
    ...shadowProps(layer.shadow),
    ...common,
  };
  const w = layer.width;
  const h = layer.height;
  const radius = layer.cornerRadius ?? 0;
  switch (layer.shape) {
    case "circle":
      // Grouped so the node origin stays the layer box's top-left (Ellipse
      // x/y is its center; an explicit x after the spread would override the
      // layer position).
      return (
        <Group ref={setRefs} {...common}>
          <Ellipse
            x={w / 2}
            y={h / 2}
            radiusX={w / 2}
            radiusY={h / 2}
            fill={layer.fill}
            {...strokeProps(layer.stroke)}
            {...shadowProps(layer.shadow)}
          />
        </Group>
      );
    case "triangle":
      return <Path data={roundedPolygonPath([w / 2, 0, w, h, 0, h], radius)} {...shared} />;
    case "hexagon":
      return (
        <Path
          data={roundedPolygonPath([w * 0.25, 0, w * 0.75, 0, w, h / 2, w * 0.75, h, w * 0.25, h, 0, h / 2], radius)}
          {...shared}
        />
      );
    case "star":
      return <Path data={roundedPolygonPath(starPoints(w, h), radius)} {...shared} />;
    case "semicircle":
      return <Path data={roundedPolygonPath(semicirclePoints(w, h), radius)} {...shared} />;
  }
}

export function LayerNode({ layer, registerRef }: LayerNodeProps) {
  switch (layer.type) {
    case "text":
      return <TextNode layer={layer} registerRef={registerRef} />;
    case "image":
      return <ImageNode layer={layer} registerRef={registerRef} />;
    case "rect":
      return <RectNode layer={layer} registerRef={registerRef} />;
    case "line":
      return <LineNode layer={layer} registerRef={registerRef} />;
    case "shape":
      return <ShapeNode layer={layer} registerRef={registerRef} />;
  }
}
