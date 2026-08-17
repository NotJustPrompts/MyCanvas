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
  /** Group membership; layers sharing a groupId form a contiguous run. */
  groupId?: string;
}

/** Mutually-exclusive text effects (Canva model: one effect or none). */
export type TextEffect =
  | { type: "none" }
  | { type: "shadow"; color: string; distance: number; angle: number; blur: number; opacity: number }
  | { type: "outline"; color: string; thickness: number }
  | { type: "echo"; color: string; distance: number; angle: number }
  | { type: "background"; color: string; spread: number; roundness: number; opacity: number }
  | { type: "glitch"; colorPair: "cyan-magenta" | "red-blue"; distance: number; angle: number };

/** Curated defaults that look good on a 1280×720 thumbnail. */
export function defaultTextEffect(type: Exclude<TextEffect["type"], "none">): TextEffect {
  switch (type) {
    case "shadow":
      return { type: "shadow", color: "#000000", distance: 8, angle: 45, blur: 12, opacity: 0.6 };
    case "outline":
      return { type: "outline", color: "#ffffff", thickness: 4 };
    case "echo":
      return { type: "echo", color: "#6b6b76", distance: 6, angle: 45 };
    case "background":
      return { type: "background", color: "#ffe600", spread: 12, roundness: 40, opacity: 1 };
    case "glitch":
      return { type: "glitch", colorPair: "cyan-magenta", distance: 6, angle: 0 };
  }
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
  /** Fixed wrap width in px; 0 means auto (no wrapping). Ignored while curved. */
  wrapWidth: number;
  /** Bend amount, -100 (smile) … 100 (arch); 0/absent = straight. Curved text is single-line. */
  curve?: number;
  /** The single active text effect; absent on legacy layers (migrated on load). */
  effect?: TextEffect;
  /** Legacy storage for the shadow/outline effect params; kept in sync by migration. */
  shadow: ShadowEffect;
  stroke: StrokeEffect;
}

export interface ImageCrop {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ImageLayer extends LayerBase {
  type: "image";
  /** Asset file name served by the backend (e.g. "abc123.png"). */
  asset: string;
  width: number;
  height: number;
  /** Source-space crop rect (px in the original image). Absent = full image. */
  crop?: ImageCrop;
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

export type ShapeKind = "triangle" | "hexagon" | "circle" | "semicircle" | "star";

export interface ShapeLayer extends LayerBase {
  type: "shape";
  shape: ShapeKind;
  width: number;
  height: number;
  fill: string;
  stroke: StrokeEffect;
  shadow: ShadowEffect;
}

export type Layer = TextLayer | ImageLayer | RectLayer | LineLayer | ShapeLayer;
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
