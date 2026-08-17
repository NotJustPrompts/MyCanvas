import { type TextEffect, type TextLayer, defaultTextEffect } from "@mycanvas/shared";
import { ColorField, type SectionProps, SliderField } from "./fields";
import { Panel } from "./Panel";

const EFFECT_TILES: { type: TextEffect["type"]; label: string; glyphClass: string }[] = [
  { type: "none", label: "None", glyphClass: "effect-none" },
  { type: "shadow", label: "Shadow", glyphClass: "effect-shadow" },
  { type: "outline", label: "Outline", glyphClass: "effect-outline" },
  { type: "echo", label: "Echo", glyphClass: "effect-echo" },
  { type: "background", label: "Background", glyphClass: "effect-background" },
  { type: "glitch", label: "Glitch", glyphClass: "effect-glitch" },
];

/** Mutually-exclusive text effects grid + per-effect params. */
export function TextEffectsSection({ layer, patch, commit }: SectionProps<TextLayer>) {
  const effect: TextEffect = layer.effect ?? { type: "none" };
  const setParam = (next: TextEffect, transient = true) => {
    patch({ effect: next }, transient);
  };

  return (
    <Panel title="Effects" defaultOpen={effect.type !== "none"}>
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
    </Panel>
  );
}
