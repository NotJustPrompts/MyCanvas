import { useEffect, useState } from "react";
import {
  type ImageLayer,
  type Layer,
  type LineLayer,
  type RectLayer,
  type ShadowEffect,
  type ShapeLayer,
  type StrokeEffect,
  type TextEffect,
  type TextLayer,
  defaultTextEffect,
} from "@mycanva/shared";
import { getCachedImageSize } from "../hooks/useImage";
import { type LayerPatch, useEditorStore } from "../store/editorStore";
import { removeLayerBackground } from "../utils/bg-removal";
import { ColorInput } from "./ColorInput";
import { FontPicker } from "./FontPicker";

interface NumberFieldProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  onCommit?: () => void;
  step?: number;
  min?: number;
  max?: number;
}

function NumberField({ label, value, onChange, onCommit, step = 1, min, max }: NumberFieldProps) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type="number"
        value={value}
        step={step}
        min={min}
        max={max}
        onChange={(e) => {
          const next = Number(e.target.value);
          if (Number.isFinite(next)) {
            onChange(next);
          }
        }}
        onBlur={onCommit}
      />
    </label>
  );
}

interface SliderFieldProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  onCommit?: () => void;
}

/**
 * Canva-style slider + synced numeric input. Dragging updates transiently and
 * commits on release; typing commits clamped on blur/Enter. One history entry
 * per gesture either way.
 */
function SliderField({ label, value, min, max, step, onChange, onCommit }: SliderFieldProps) {
  const [draft, setDraft] = useState(String(value));

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  const commitDraft = () => {
    const parsed = Number(draft);
    if (Number.isFinite(parsed)) {
      onChange(Math.min(max, Math.max(min, parsed)));
    }
    onCommit?.();
  };

  return (
    <label className="field field-wide">
      <span>{label}</span>
      <div className="slider-combo">
        <input
          type="range"
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={(e) => {
            onChange(Number(e.target.value));
          }}
          onPointerUp={onCommit}
          onBlur={onCommit}
        />
        <input
          type="number"
          className="slider-number"
          value={draft}
          min={min}
          max={max}
          step={step}
          onChange={(e) => {
            setDraft(e.target.value);
            const parsed = Number(e.target.value);
            if (Number.isFinite(parsed) && parsed >= min && parsed <= max) {
              onChange(parsed);
            }
          }}
          onBlur={commitDraft}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              commitDraft();
            }
          }}
        />
      </div>
    </label>
  );
}

interface ColorFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onCommit?: () => void;
}

function ColorField({ label, value, onChange, onCommit }: ColorFieldProps) {
  return <ColorInput label={label} value={value} onChange={onChange} onCommit={onCommit} />;
}

interface ShadowSectionProps {
  shadow: ShadowEffect;
  onPatch: (patch: Partial<ShadowEffect>, transient?: boolean) => void;
  onCommit: () => void;
}

function ShadowSection({ shadow, onPatch, onCommit }: ShadowSectionProps) {
  return (
    <details className="sub-section" open={shadow.enabled}>
      <summary>
        <label className="checkbox-label" onClick={(e) => { e.stopPropagation(); }}>
          <input
            type="checkbox"
            checked={shadow.enabled}
            onChange={(e) => {
              onPatch({ enabled: e.target.checked });
            }}
          />
          Shadow
        </label>
      </summary>
      {shadow.enabled && (
        <div className="field-grid">
          <ColorField
            label="Color"
            value={shadow.color}
            onChange={(color) => { onPatch({ color }, true); }}
            onCommit={onCommit}
          />
          <NumberField
            label="Blur"
            value={shadow.blur}
            min={0}
            onChange={(blur) => { onPatch({ blur }, true); }}
            onCommit={onCommit}
          />
          <NumberField
            label="Offset X"
            value={shadow.offsetX}
            onChange={(offsetX) => { onPatch({ offsetX }, true); }}
            onCommit={onCommit}
          />
          <NumberField
            label="Offset Y"
            value={shadow.offsetY}
            onChange={(offsetY) => { onPatch({ offsetY }, true); }}
            onCommit={onCommit}
          />
          <SliderField
            label="Opacity"
            value={shadow.opacity}
            min={0}
            max={1}
            step={0.05}
            onChange={(opacity) => { onPatch({ opacity }, true); }}
            onCommit={onCommit}
          />
        </div>
      )}
    </details>
  );
}

interface StrokeSectionProps {
  stroke: StrokeEffect;
  onPatch: (patch: Partial<StrokeEffect>, transient?: boolean) => void;
  onCommit: () => void;
}

function StrokeSection({ stroke, onPatch, onCommit }: StrokeSectionProps) {
  return (
    <details className="sub-section" open={stroke.enabled}>
      <summary>
        <label className="checkbox-label" onClick={(e) => { e.stopPropagation(); }}>
          <input
            type="checkbox"
            checked={stroke.enabled}
            onChange={(e) => {
              onPatch({ enabled: e.target.checked });
            }}
          />
          Stroke
        </label>
      </summary>
      {stroke.enabled && (
        <div className="field-grid">
          <ColorField
            label="Color"
            value={stroke.color}
            onChange={(color) => { onPatch({ color }, true); }}
            onCommit={onCommit}
          />
          <NumberField
            label="Width"
            value={stroke.width}
            min={0}
            onChange={(width) => { onPatch({ width }, true); }}
            onCommit={onCommit}
          />
        </div>
      )}
    </details>
  );
}

function TextInspector({ layer, patch, commit }: { layer: TextLayer; patch: (p: LayerPatch, t?: boolean) => void; commit: () => void }) {
  const bold = layer.fontStyle.includes("bold");
  const italic = layer.fontStyle.includes("italic");

  const setFontStyle = (nextBold: boolean, nextItalic: boolean) => {
    const parts = [nextBold ? "bold" : "", nextItalic ? "italic" : ""].filter((part) => part !== "");
    patch({ fontStyle: parts.length > 0 ? parts.join(" ") : "normal" });
  };

  return (
    <>
      <label className="field field-wide">
        <span>Content</span>
        <textarea
          rows={3}
          value={layer.text}
          onChange={(e) => {
            patch({ text: e.target.value }, true);
          }}
          onBlur={commit}
        />
      </label>
      <div className="field field-wide">
        <span>Font</span>
        <FontPicker
          value={layer.fontFamily}
          onApply={(fontFamily) => {
            patch({ fontFamily });
          }}
        />
      </div>
      <div className="field-grid">
        <NumberField
          label="Size"
          value={layer.fontSize}
          min={1}
          onChange={(fontSize) => {
            patch({ fontSize }, true);
          }}
          onCommit={commit}
        />
        <ColorField
          label="Fill"
          value={layer.fill}
          onChange={(fill) => {
            patch({ fill }, true);
          }}
          onCommit={commit}
        />
      </div>
      <div className="field field-wide">
        <span>Style</span>
        <div className="button-group">
          <button
            type="button"
            className={bold ? "toggle active" : "toggle"}
            onClick={() => {
              setFontStyle(!bold, italic);
            }}
          >
            <strong>B</strong>
          </button>
          <button
            type="button"
            className={italic ? "toggle active" : "toggle"}
            onClick={() => {
              setFontStyle(bold, !italic);
            }}
          >
            <em>I</em>
          </button>
          <span className="button-group-sep" />
          {(["left", "center", "right"] as const).map((align) => (
            <button
              key={align}
              type="button"
              className={layer.align === align ? "toggle active" : "toggle"}
              title={`Align ${align}`}
              onClick={() => {
                patch({ align });
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                {align === "left" && <path d="M4 6h16M4 12h10M4 18h14" />}
                {align === "center" && <path d="M4 6h16M7 12h10M5 18h14" />}
                {align === "right" && <path d="M4 6h16M10 12h10M6 18h14" />}
              </svg>
            </button>
          ))}
        </div>
      </div>
      <div className="field-grid">
        <NumberField
          label="Line height"
          value={layer.lineHeight}
          step={0.1}
          min={0.5}
          onChange={(lineHeight) => {
            patch({ lineHeight }, true);
          }}
          onCommit={commit}
        />
        <NumberField
          label="Letter spacing"
          value={layer.letterSpacing}
          step={0.5}
          onChange={(letterSpacing) => {
            patch({ letterSpacing }, true);
          }}
          onCommit={commit}
        />
        <NumberField
          label="Wrap width (0 = auto)"
          value={layer.wrapWidth}
          min={0}
          onChange={(wrapWidth) => {
            patch({ wrapWidth }, true);
          }}
          onCommit={commit}
        />
      </div>
      <SliderField
        label="Curve"
        value={layer.curve ?? 0}
        min={-100}
        max={100}
        step={1}
        onChange={(curve) => {
          patch({ curve }, true);
        }}
        onCommit={commit}
      />
      <TextEffectsSection layer={layer} patch={patch} commit={commit} />
    </>
  );
}

const EFFECT_TILES: { type: TextEffect["type"]; label: string; glyphClass: string }[] = [
  { type: "none", label: "None", glyphClass: "effect-none" },
  { type: "shadow", label: "Shadow", glyphClass: "effect-shadow" },
  { type: "outline", label: "Outline", glyphClass: "effect-outline" },
  { type: "echo", label: "Echo", glyphClass: "effect-echo" },
  { type: "background", label: "Background", glyphClass: "effect-background" },
  { type: "glitch", label: "Glitch", glyphClass: "effect-glitch" },
];

function TextEffectsSection({ layer, patch, commit }: { layer: TextLayer; patch: (p: LayerPatch, t?: boolean) => void; commit: () => void }) {
  const effect: TextEffect = layer.effect ?? { type: "none" };
  const setParam = (next: TextEffect, transient = true) => {
    patch({ effect: next }, transient);
  };

  return (
    <div className="field field-wide">
      <span>Effects</span>
      <div className="effects-grid">
        {EFFECT_TILES.map((tile) => (
          <button
            key={tile.type}
            type="button"
            className={effect.type === tile.type ? "effect-tile active" : "effect-tile"}
            onClick={() => {
              patch({ effect: tile.type === "none" ? { type: "none" } : defaultTextEffect(tile.type) });
            }}
          >
            <span className={`effect-glyph ${tile.glyphClass}`}>Ag</span>
            <span className="effect-label">{tile.label}</span>
          </button>
        ))}
      </div>
      {effect.type === "shadow" && (
        <div className="field-grid">
          <ColorField label="Color" value={effect.color} onChange={(color) => { setParam({ ...effect, color }); }} onCommit={commit} />
          <SliderField label="Distance" value={effect.distance} min={0} max={100} step={1} onChange={(distance) => { setParam({ ...effect, distance }); }} onCommit={commit} />
          <SliderField label="Angle" value={effect.angle} min={-180} max={180} step={1} onChange={(angle) => { setParam({ ...effect, angle }); }} onCommit={commit} />
          <SliderField label="Blur" value={effect.blur} min={0} max={60} step={1} onChange={(blur) => { setParam({ ...effect, blur }); }} onCommit={commit} />
          <SliderField label="Opacity" value={Math.round(effect.opacity * 100)} min={0} max={100} step={1} onChange={(v) => { setParam({ ...effect, opacity: v / 100 }); }} onCommit={commit} />
        </div>
      )}
      {effect.type === "outline" && (
        <div className="field-grid">
          <ColorField label="Color" value={effect.color} onChange={(color) => { setParam({ ...effect, color }); }} onCommit={commit} />
          <SliderField label="Thickness" value={effect.thickness} min={1} max={40} step={1} onChange={(thickness) => { setParam({ ...effect, thickness }); }} onCommit={commit} />
        </div>
      )}
      {effect.type === "echo" && (
        <div className="field-grid">
          <ColorField label="Color" value={effect.color} onChange={(color) => { setParam({ ...effect, color }); }} onCommit={commit} />
          <SliderField label="Distance" value={effect.distance} min={0} max={100} step={1} onChange={(distance) => { setParam({ ...effect, distance }); }} onCommit={commit} />
          <SliderField label="Angle" value={effect.angle} min={-180} max={180} step={1} onChange={(angle) => { setParam({ ...effect, angle }); }} onCommit={commit} />
        </div>
      )}
      {effect.type === "background" && (
        <div className="field-grid">
          <ColorField label="Color" value={effect.color} onChange={(color) => { setParam({ ...effect, color }); }} onCommit={commit} />
          <SliderField label="Spread" value={effect.spread} min={0} max={60} step={1} onChange={(spread) => { setParam({ ...effect, spread }); }} onCommit={commit} />
          <SliderField label="Roundness" value={effect.roundness} min={0} max={100} step={1} onChange={(roundness) => { setParam({ ...effect, roundness }); }} onCommit={commit} />
          <SliderField label="Opacity" value={Math.round(effect.opacity * 100)} min={0} max={100} step={1} onChange={(v) => { setParam({ ...effect, opacity: v / 100 }); }} onCommit={commit} />
        </div>
      )}
      {effect.type === "glitch" && (
        <div className="field-grid">
          <label className="field">
            <span>Colors</span>
            <select
              value={effect.colorPair}
              onChange={(e) => {
                setParam({ ...effect, colorPair: e.target.value === "red-blue" ? "red-blue" : "cyan-magenta" }, false);
              }}
            >
              <option value="cyan-magenta">Cyan / magenta</option>
              <option value="red-blue">Red / blue</option>
            </select>
          </label>
          <SliderField label="Distance" value={effect.distance} min={0} max={100} step={1} onChange={(distance) => { setParam({ ...effect, distance }); }} onCommit={commit} />
          <SliderField label="Angle" value={effect.angle} min={-180} max={180} step={1} onChange={(angle) => { setParam({ ...effect, angle }); }} onCommit={commit} />
        </div>
      )}
    </div>
  );
}

function ImageInspector({ layer, patch, commit }: { layer: ImageLayer; patch: (p: LayerPatch, t?: boolean) => void; commit: () => void }) {
  const natural = getCachedImageSize(`/assets/${layer.asset}`);
  const bgRemoval = useEditorStore((state) => state.bgRemoval);
  const running = bgRemoval?.layerId === layer.id;
  const busy = bgRemoval !== null;
  const label = running
    ? bgRemoval.progress === null
      ? "Removing background…"
      : `Downloading model… ${String(Math.round(bgRemoval.progress * 100))}%`
    : "Remove background";
  return (
    <>
      <button
        type="button"
        className="primary block"
        disabled={busy}
        onClick={() => {
          void removeLayerBackground(layer);
        }}
      >
        {label}
      </button>
      <div className="field-grid">
        <NumberField
          label="Width"
          value={layer.width}
          min={1}
          onChange={(width) => {
            patch({ width }, true);
          }}
          onCommit={commit}
        />
        <NumberField
          label="Height"
          value={layer.height}
          min={1}
          onChange={(height) => {
            patch({ height }, true);
          }}
          onCommit={commit}
        />
      </div>
      <button
        type="button"
        className="secondary"
        disabled={!natural}
        onClick={() => {
          if (natural) {
            patch({ width: natural.width, height: natural.height, crop: undefined });
          }
        }}
      >
        Reset to natural size
      </button>
      <ShadowSection
        shadow={layer.shadow}
        onPatch={(sub, transient) => {
          patch({ shadow: { ...layer.shadow, ...sub } }, transient);
        }}
        onCommit={commit}
      />
    </>
  );
}

function RectInspector({ layer, patch, commit }: { layer: RectLayer; patch: (p: LayerPatch, t?: boolean) => void; commit: () => void }) {
  return (
    <>
      <div className="field-grid">
        <NumberField
          label="Width"
          value={layer.width}
          min={1}
          onChange={(width) => {
            patch({ width }, true);
          }}
          onCommit={commit}
        />
        <NumberField
          label="Height"
          value={layer.height}
          min={1}
          onChange={(height) => {
            patch({ height }, true);
          }}
          onCommit={commit}
        />
        <ColorField
          label="Fill"
          value={layer.fill}
          onChange={(fill) => {
            patch({ fill }, true);
          }}
          onCommit={commit}
        />
        <NumberField
          label="Corner radius"
          value={layer.cornerRadius}
          min={0}
          onChange={(cornerRadius) => {
            patch({ cornerRadius }, true);
          }}
          onCommit={commit}
        />
      </div>
      <StrokeSection
        stroke={layer.stroke}
        onPatch={(sub, transient) => {
          patch({ stroke: { ...layer.stroke, ...sub } }, transient);
        }}
        onCommit={commit}
      />
      <ShadowSection
        shadow={layer.shadow}
        onPatch={(sub, transient) => {
          patch({ shadow: { ...layer.shadow, ...sub } }, transient);
        }}
        onCommit={commit}
      />
    </>
  );
}

function ShapeInspector({ layer, patch, commit }: { layer: ShapeLayer; patch: (p: LayerPatch, t?: boolean) => void; commit: () => void }) {
  return (
    <>
      <div className="field-grid">
        <NumberField
          label="Width"
          value={layer.width}
          min={1}
          onChange={(width) => {
            patch({ width }, true);
          }}
          onCommit={commit}
        />
        <NumberField
          label="Height"
          value={layer.height}
          min={1}
          onChange={(height) => {
            patch({ height }, true);
          }}
          onCommit={commit}
        />
        <ColorField
          label="Fill"
          value={layer.fill}
          onChange={(fill) => {
            patch({ fill }, true);
          }}
          onCommit={commit}
        />
      </div>
      <StrokeSection
        stroke={layer.stroke}
        onPatch={(sub, transient) => {
          patch({ stroke: { ...layer.stroke, ...sub } }, transient);
        }}
        onCommit={commit}
      />
      <ShadowSection
        shadow={layer.shadow}
        onPatch={(sub, transient) => {
          patch({ shadow: { ...layer.shadow, ...sub } }, transient);
        }}
        onCommit={commit}
      />
    </>
  );
}

function LineInspector({ layer, patch, commit }: { layer: LineLayer; patch: (p: LayerPatch, t?: boolean) => void; commit: () => void }) {
  return (
    <>
      <div className="field-grid">
        <ColorField
          label="Color"
          value={layer.strokeColor}
          onChange={(strokeColor) => {
            patch({ strokeColor }, true);
          }}
          onCommit={commit}
        />
        <NumberField
          label="Width"
          value={layer.strokeWidth}
          min={1}
          onChange={(strokeWidth) => {
            patch({ strokeWidth }, true);
          }}
          onCommit={commit}
        />
      </div>
      <label className="field field-wide">
        <span>Line cap</span>
        <select
          value={layer.lineCap}
          onChange={(e) => {
            patch({ lineCap: e.target.value as LineLayer["lineCap"] });
          }}
        >
          <option value="butt">Butt</option>
          <option value="round">Round</option>
          <option value="square">Square</option>
        </select>
      </label>
      <ShadowSection
        shadow={layer.shadow}
        onPatch={(sub, transient) => {
          patch({ shadow: { ...layer.shadow, ...sub } }, transient);
        }}
        onCommit={commit}
      />
    </>
  );
}

export function Inspector() {
  const design = useEditorStore((state) => state.design);
  const selectedLayerIds = useEditorStore((state) => state.selectedLayerIds);
  const updateLayer = useEditorStore((state) => state.updateLayer);
  const commitTransient = useEditorStore((state) => state.commitTransient);

  const layer: Layer | undefined = design?.layers.find(
    (entry) => entry.id === selectedLayerIds[selectedLayerIds.length - 1],
  );

  if (!layer) {
    return (
      <div className="panel-section inspector">
        <h3>Inspector</h3>
        <p className="muted">Select a layer to edit its properties.</p>
      </div>
    );
  }

  const patch = (p: LayerPatch, transient = false) => {
    updateLayer(layer.id, p, transient);
  };

  return (
    <div className="panel-section inspector">
      <h3>Inspector</h3>
      {selectedLayerIds.length > 1 && (
        <p className="muted multi-note">
          {selectedLayerIds.length}
          {" "}
          layers selected — showing the primary layer.
        </p>
      )}
      <div className="field-grid">
        <NumberField
          label="X"
          value={Math.round(layer.x)}
          onChange={(x) => {
            patch({ x }, true);
          }}
          onCommit={commitTransient}
        />
        <NumberField
          label="Y"
          value={Math.round(layer.y)}
          onChange={(y) => {
            patch({ y }, true);
          }}
          onCommit={commitTransient}
        />
        <NumberField
          label="Rotation"
          value={Math.round(layer.rotation)}
          onChange={(rotation) => {
            patch({ rotation }, true);
          }}
          onCommit={commitTransient}
        />
      </div>
      <SliderField
        label="Opacity"
        value={Math.round(layer.opacity * 100)}
        min={0}
        max={100}
        step={1}
        onChange={(percent) => {
          patch({ opacity: percent / 100 }, true);
        }}
        onCommit={commitTransient}
      />
      {layer.type === "text" && <TextInspector layer={layer} patch={patch} commit={commitTransient} />}
      {layer.type === "image" && <ImageInspector layer={layer} patch={patch} commit={commitTransient} />}
      {layer.type === "rect" && <RectInspector layer={layer} patch={patch} commit={commitTransient} />}
      {layer.type === "shape" && <ShapeInspector layer={layer} patch={patch} commit={commitTransient} />}
      {layer.type === "line" && <LineInspector layer={layer} patch={patch} commit={commitTransient} />}
    </div>
  );
}
