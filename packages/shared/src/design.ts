export interface ShadowEffect {
  enabled: boolean;
  color: string;
  blur: number;
  offsetX: number;
  offsetY: number;
  /** Shadow opacity, 0-1. */
  opacity: number;
}

export interface StrokeEffect {
  enabled: boolean;
  color: string;
  width: number;
}

interface LayerBase {
  id: string;
  name: string;
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  opacity: number;
  visible: boolean;
}

export interface TextLayer extends LayerBase {
  type: "text";
  text: string;
  fontFamily: string;
  fontSize: number;
  /** Konva-style font style string: any combination of "bold" and "italic" separated by spaces, or "normal". */
  fontStyle: string;
  fill: string;
  align: "left" | "center" | "right";
  lineHeight: number;
  letterSpacing: number;
  /** Fixed wrap width in px; 0 means auto (no wrapping). */
  wrapWidth: number;
  shadow: ShadowEffect;
  stroke: StrokeEffect;
}

export interface ImageLayer extends LayerBase {
  type: "image";
  /** Asset file name served by the backend (e.g. "abc123.png"). */
  asset: string;
  width: number;
  height: number;
  shadow: ShadowEffect;
}

export interface RectLayer extends LayerBase {
  type: "rect";
  width: number;
  height: number;
  fill: string;
  cornerRadius: number;
  stroke: StrokeEffect;
  shadow: ShadowEffect;
}

export interface LineLayer extends LayerBase {
  type: "line";
  points: [number, number, number, number];
  strokeColor: string;
  strokeWidth: number;
  lineCap: "butt" | "round" | "square";
  shadow: ShadowEffect;
}

export type Layer = TextLayer | ImageLayer | RectLayer | LineLayer;
export type LayerType = Layer["type"];

export interface Design {
  id: string;
  name: string;
  width: number;
  height: number;
  /** Canvas background color, or "transparent". */
  background: string;
  /** Layers in z-order: index 0 is the bottom-most layer. */
  layers: Layer[];
  /** Small data-URL preview rendered by the editor on save. */
  thumbnail?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DesignSummary {
  id: string;
  name: string;
  width: number;
  height: number;
  thumbnail?: string;
  createdAt: string;
  updatedAt: string;
}

export function defaultShadow(): ShadowEffect {
  return { enabled: false, color: "#000000", blur: 12, offsetX: 0, offsetY: 4, opacity: 0.8 };
}

export function defaultStroke(): StrokeEffect {
  return { enabled: false, color: "#000000", width: 2 };
}
