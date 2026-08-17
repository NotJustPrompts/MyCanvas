import { useEffect, useRef, useState } from "react";
import { type LayerPatch } from "../../store/editorStore";
import { ColorInput } from "../ColorInput";

/** Common props for every inspector section. */
export interface SectionProps<T> {
  layer: T;
  patch: (patch: LayerPatch, transient?: boolean) => void;
  commit: () => void;
}

interface NumberFieldProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  onCommit?: () => void;
  step?: number;
  min?: number;
  max?: number;
}

export function NumberField({ label, value, onChange, onCommit, step = 1, min, max }: NumberFieldProps) {
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
export function SliderField({ label, value, min, max, step, onChange, onCommit }: SliderFieldProps) {
  const [draft, setDraft] = useState(String(value));
  const lastCommitted = useRef(value);

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  const commitIfChanged = () => {
    if (value !== lastCommitted.current) {
      lastCommitted.current = value;
      onCommit?.();
    }
  };

  const commitDraft = () => {
    const parsed = Number(draft);
    if (!Number.isFinite(parsed)) {
      commitIfChanged();
      return;
    }
    const clamped = Math.min(max, Math.max(min, parsed));
    onChange(clamped);
    if (clamped !== lastCommitted.current) {
      lastCommitted.current = clamped;
      onCommit?.();
    }
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
          onPointerUp={commitIfChanged}
          onBlur={commitIfChanged}
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

export function ColorField({ label, value, onChange, onCommit }: ColorFieldProps) {
  return <ColorInput label={label} value={value} onChange={onChange} onCommit={onCommit} />;
}
