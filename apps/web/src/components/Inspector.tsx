import {
  type ImageLayer,
  type Layer,
  type LineLayer,
  type RectLayer,
  type ShadowEffect,
  type StrokeEffect,
  type TextLayer,
} from "@mycanva/shared";
import { getCachedImageSize } from "../hooks/useImage";
import { type LayerPatch, useEditorStore } from "../store/editorStore";
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

function SliderField({ label, value, min, max, step, onChange, onCommit }: SliderFieldProps) {
  return (
    <label className="field field-wide">
      <span>
        {label}
        <em>{value.toFixed(2)}</em>
      </span>
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
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type="color"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
        }}
        onBlur={onCommit}
      />
    </label>
  );
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
  const glow = layer.shadow.enabled && layer.shadow.offsetX === 0 && layer.shadow.offsetY === 0;

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
              {align === "left" ? "⇤" : align === "center" ? "≡" : "⇥"}
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
      <div className="field field-wide">
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={glow}
            onChange={(e) => {
              patch({ shadow: { ...layer.shadow, enabled: e.target.checked, offsetX: 0, offsetY: 0 } });
            }}
          />
          Glow (centered shadow)
        </label>
      </div>
      <ShadowSection
        shadow={layer.shadow}
        onPatch={(sub, transient) => {
          patch({ shadow: { ...layer.shadow, ...sub } }, transient);
        }}
        onCommit={commit}
      />
      <StrokeSection
        stroke={layer.stroke}
        onPatch={(sub, transient) => {
          patch({ stroke: { ...layer.stroke, ...sub } }, transient);
        }}
        onCommit={commit}
      />
    </>
  );
}

function ImageInspector({ layer, patch, commit }: { layer: ImageLayer; patch: (p: LayerPatch, t?: boolean) => void; commit: () => void }) {
  const natural = getCachedImageSize(`/assets/${layer.asset}`);
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
      </div>
      <button
        type="button"
        className="secondary"
        disabled={!natural}
        onClick={() => {
          if (natural) {
            patch({ width: natural.width, height: natural.height });
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
  const selectedLayerId = useEditorStore((state) => state.selectedLayerId);
  const updateLayer = useEditorStore((state) => state.updateLayer);
  const commitTransient = useEditorStore((state) => state.commitTransient);

  const layer: Layer | undefined = design?.layers.find((entry) => entry.id === selectedLayerId);

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
        value={layer.opacity}
        min={0}
        max={1}
        step={0.05}
        onChange={(opacity) => {
          patch({ opacity }, true);
        }}
        onCommit={commitTransient}
      />
      {layer.type === "text" && <TextInspector layer={layer} patch={patch} commit={commitTransient} />}
      {layer.type === "image" && <ImageInspector layer={layer} patch={patch} commit={commitTransient} />}
      {layer.type === "rect" && <RectInspector layer={layer} patch={patch} commit={commitTransient} />}
      {layer.type === "line" && <LineInspector layer={layer} patch={patch} commit={commitTransient} />}
    </div>
  );
}
