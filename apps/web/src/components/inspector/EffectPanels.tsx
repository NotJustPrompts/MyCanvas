import { type ShadowEffect, type StrokeEffect } from "@mycanva/shared";
import { ColorField, NumberField, SliderField } from "./fields";
import { Panel } from "./Panel";

interface ShadowPanelProps {
  shadow: ShadowEffect;
  onPatch: (patch: Partial<ShadowEffect>, transient?: boolean) => void;
  onCommit: () => void;
}

export function ShadowPanel({ shadow, onPatch, onCommit }: ShadowPanelProps) {
  return (
    <Panel
      key={String(shadow.enabled)}
      title="Shadow"
      defaultOpen={shadow.enabled}
      headerRight={(
        <input
          type="checkbox"
          checked={shadow.enabled}
          title="Enable shadow"
          onChange={(e) => {
            onPatch({ enabled: e.target.checked });
          }}
        />
      )}
    >
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
    </Panel>
  );
}

interface StrokePanelProps {
  stroke: StrokeEffect;
  onPatch: (patch: Partial<StrokeEffect>, transient?: boolean) => void;
  onCommit: () => void;
}

export function StrokePanel({ stroke, onPatch, onCommit }: StrokePanelProps) {
  return (
    <Panel
      key={String(stroke.enabled)}
      title="Stroke"
      defaultOpen={stroke.enabled}
      headerRight={(
        <input
          type="checkbox"
          checked={stroke.enabled}
          title="Enable stroke"
          onChange={(e) => {
            onPatch({ enabled: e.target.checked });
          }}
        />
      )}
    >
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
    </Panel>
  );
}
