import { type Layer } from "@mycanva/shared";
import { NumberField, type SectionProps, SliderField } from "./fields";
import { Panel } from "./Panel";

/** X / Y / rotation / opacity — shared by every layer type. */
export function PositionSection({ layer, patch, commit }: SectionProps<Layer>) {
  return (
    <Panel title="Position">
      <div className="field-grid">
        <NumberField
          label="X"
          value={Math.round(layer.x)}
          onChange={(x) => {
            patch({ x }, true);
          }}
          onCommit={commit}
        />
        <NumberField
          label="Y"
          value={Math.round(layer.y)}
          onChange={(y) => {
            patch({ y }, true);
          }}
          onCommit={commit}
        />
        <NumberField
          label="Rotation"
          value={Math.round(layer.rotation)}
          onChange={(rotation) => {
            patch({ rotation }, true);
          }}
          onCommit={commit}
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
        onCommit={commit}
      />
    </Panel>
  );
}
