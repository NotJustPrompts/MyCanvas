import type Konva from "konva";
import { useEffect, useRef } from "react";
import { Image as KonvaImage, Line, Rect, Text } from "react-konva";
import {
  type ImageLayer,
  type Layer,
  type LineLayer,
  type RectLayer,
  type ShadowEffect,
  type StrokeEffect,
  type TextLayer,
} from "@mycanva/shared";
import { useImage } from "../hooks/useImage";
import { useEditorStore } from "../store/editorStore";
import { ensureFontLoaded } from "../utils/fonts";

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
  const updateLayer = useEditorStore((state) => state.updateLayer);
  const selectLayer = useEditorStore((state) => state.selectLayer);
  const localRef = useRef<Konva.Node | null>(null);

  const setRefs = (node: Konva.Node | null) => {
    localRef.current = node;
    registerRef(layer.id, node);
  };

  const common = {
    x: layer.x,
    y: layer.y,
    scaleX: layer.scaleX,
    scaleY: layer.scaleY,
    rotation: layer.rotation,
    opacity: layer.opacity,
    visible: layer.visible,
    draggable: true,
    onMouseDown: () => {
      selectLayer(layer.id);
    },
    onTap: () => {
      selectLayer(layer.id);
    },
    onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) => {
      updateLayer(layer.id, { x: e.target.x(), y: e.target.y() });
    },
    onTransformEnd: (e: Konva.KonvaEventObject<Event>) => {
      const node = e.target;
      updateLayer(layer.id, {
        x: node.x(),
        y: node.y(),
        scaleX: node.scaleX(),
        scaleY: node.scaleY(),
        rotation: node.rotation(),
      });
    },
  };

  return { common, setRefs, localRef };
}

function TextNode({ layer, registerRef }: { layer: TextLayer } & LayerNodeProps) {
  const { common, setRefs, localRef } = useCommonNodeProps(layer, registerRef);

  useEffect(() => {
    void ensureFontLoaded(layer.fontFamily).then(() => {
      localRef.current?.getLayer()?.batchDraw();
    });
  }, [layer.fontFamily, localRef]);

  return (
    <Text
      ref={setRefs}
      text={layer.text}
      fontFamily={layer.fontFamily}
      fontSize={layer.fontSize}
      fontStyle={layer.fontStyle}
      fill={layer.fill}
      align={layer.align}
      lineHeight={layer.lineHeight}
      letterSpacing={layer.letterSpacing}
      width={layer.wrapWidth > 0 ? layer.wrapWidth : undefined}
      {...strokeProps(layer.stroke)}
      {...shadowProps(layer.shadow)}
      {...common}
    />
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
  }
}
