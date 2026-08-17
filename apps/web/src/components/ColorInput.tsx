import { useEffect, useMemo, useRef, useState } from "react";
import { useEditorStore } from "../store/editorStore";
import { usePopoverPlacement } from "../hooks/usePopoverPlacement";
import { DEFAULT_PALETTE, collectDesignColors, normalizeColor } from "../utils/colors";
import { type RankedPhoto, extractPalette, paletteCacheKey, rankedPhotoLayers } from "../utils/photo-colors";

interface ColorInputProps {
  label?: string;
  value: string;
  /** Live updates (transient by convention of the caller's handler). */
  onChange: (value: string) => void;
  /** Gesture commit (pushes the pending history snapshot). */
  onCommit?: () => void;
  /** Bare round swatch without the chip frame + hex text (context bar). */
  compact?: boolean;
  disabled?: boolean;
}

/**
 * Unified color control: swatch chip opening a popover with the colors used
 * in the current design, a default palette, a free-form text input
 * (#rgb / #rrggbb / rgb(r,g,b)) and a native color well.
 */
export function ColorInput({ label, value, onChange, onCommit, compact = false, disabled = false }: ColorInputProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const [invalid, setInvalid] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const design = useEditorStore((state) => state.design);
  const photoPalettes = useEditorStore((state) => state.photoPalettes);
  const setPhotoPalette = useEditorStore((state) => state.setPhotoPalette);
  const popover = usePopoverPlacement(open);
  const extractingRef = useRef(new Set<string>());

  const photoLayers = useMemo(() => (design ? rankedPhotoLayers(design) : []), [design]);

  // Lazily extract palettes the first time a popover opens with images present.
  useEffect(() => {
    if (!open) {
      return;
    }
    for (const { layer } of photoLayers) {
      const key = paletteCacheKey(layer);
      if (photoPalettes[key] || extractingRef.current.has(key)) {
        continue;
      }
      extractingRef.current.add(key);
      void extractPalette(layer)
        .then((colors) => {
          setPhotoPalette(key, colors);
        })
        .catch(() => {
          setPhotoPalette(key, []);
        })
        .finally(() => {
          extractingRef.current.delete(key);
        });
    }
  }, [open, photoLayers, photoPalettes, setPhotoPalette]);

  useEffect(() => {
    setDraft(value);
    setInvalid(false);
  }, [value]);

  // Close on outside click; a pending gesture is committed on close.
  useEffect(() => {
    if (!open) {
      return;
    }
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && e.target instanceof Node && !rootRef.current.contains(e.target)) {
        setOpen(false);
        onCommit?.();
      }
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open, onCommit]);

  const designColors = design ? collectDesignColors(design) : [];
  const backgroundEntry = photoLayers.length > 0 && photoLayers[0]?.isBackground ? photoLayers[0] : null;
  const restEntries = backgroundEntry ? photoLayers.slice(1) : photoLayers;

  const renderPhotoRow = (entry: RankedPhoto) => {
    const { layer } = entry;
    const key = paletteCacheKey(layer);
    const colors = photoPalettes[key];
    return (
      <div className="photo-row" key={layer.id}>
        <img className="photo-thumb" src={`/assets/${layer.asset}`} alt={layer.name} />
        {colors
          ? (
              <div className="color-swatches">
                {colors.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className={color === value.toLowerCase() ? "popover-swatch active" : "popover-swatch"}
                    style={{ background: color }}
                    title={color}
                    onClick={() => {
                      onChange(color);
                      onCommit?.();
                    }}
                  />
                ))}
              </div>
            )
          : (
              <span className="muted photo-loading">Extracting…</span>
            )}
      </div>
    );
  };

  const applyDraft = (next: string) => {
    setDraft(next);
    const normalized = normalizeColor(next);
    if (normalized) {
      setInvalid(false);
      onChange(normalized);
    } else {
      setInvalid(true);
    }
  };

  const commitDraft = () => {
    const normalized = normalizeColor(draft);
    if (normalized) {
      if (normalized !== value) {
        onChange(normalized);
      }
      setInvalid(false);
    } else {
      setDraft(value);
      setInvalid(false);
    }
    onCommit?.();
  };

  const swatch = (
    <button
      type="button"
      className={compact ? "color-dot" : "color-swatch-button"}
      style={{ background: value }}
      title={label ?? value}
      disabled={disabled}
      onClick={() => {
        setOpen((prev) => !prev);
      }}
    />
  );

  return (
    <div className={compact ? "color-input compact" : "color-input"} ref={rootRef}>
      {compact
        ? (
            swatch
          )
        : (
            <div className="field">
              {label && <span>{label}</span>}
              <div className="color-chip">
                {swatch}
                <input
                  type="text"
                  className={invalid ? "color-hex invalid" : "color-hex"}
                  value={draft}
                  spellCheck={false}
                  disabled={disabled}
                  onChange={(e) => {
                    applyDraft(e.target.value);
                  }}
                  onBlur={commitDraft}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      commitDraft();
                    }
                  }}
                />
              </div>
            </div>
          )}
      {open && !disabled && (
        <div className="color-popover" ref={popover.ref} style={popover.style}>
          {designColors.length > 0 && (
            <div className="color-popover-section">
              <h5>In this design</h5>
              <div className="color-swatches">
                {designColors.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className={color === value.toLowerCase() ? "popover-swatch active" : "popover-swatch"}
                    style={{ background: color }}
                    title={color}
                    onClick={() => {
                      onChange(color);
                      onCommit?.();
                    }}
                  />
                ))}
              </div>
            </div>
          )}
          {photoLayers.length > 0 && (
            <div className="color-popover-section">
              {backgroundEntry && (
                <>
                  <h5>Background colors</h5>
                  {renderPhotoRow(backgroundEntry)}
                </>
              )}
              {restEntries.length > 0 && (
                <>
                  <h5>Photo colors</h5>
                  {restEntries.map(renderPhotoRow)}
                </>
              )}
            </div>
          )}
          <div className="color-popover-section">
            <h5>Palette</h5>
            <div className="color-swatches">
              {DEFAULT_PALETTE.map((color) => (
                <button
                  key={color}
                  type="button"
                  className={color === value.toLowerCase() ? "popover-swatch active" : "popover-swatch"}
                  style={{ background: color }}
                  title={color}
                  onClick={() => {
                    onChange(color);
                    onCommit?.();
                  }}
                />
              ))}
            </div>
          </div>
          <div className="color-popover-section color-custom">
            <input
              type="text"
              className={invalid ? "color-hex invalid" : "color-hex"}
              placeholder="#rrggbb or rgb(r, g, b)"
              value={draft}
              spellCheck={false}
              onChange={(e) => {
                applyDraft(e.target.value);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  commitDraft();
                  setOpen(false);
                }
              }}
            />
            <input
              type="color"
              className="color-well"
              value={normalizeColor(value) ?? "#000000"}
              onChange={(e) => {
                setDraft(e.target.value);
                setInvalid(false);
                onChange(e.target.value);
              }}
              onBlur={onCommit}
            />
          </div>
        </div>
      )}
    </div>
  );
}
