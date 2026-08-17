import { type TextLayer } from "@mycanva/shared";
import { NumberField, type SectionProps, SliderField } from "./fields";
import { Panel } from "./Panel";

/** Line height, letter spacing, wrap width and the curve control. */
export function TextLayoutSection({ layer, patch, commit }: SectionProps<TextLayer>) {
  return (
    <Panel title="Layout">
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
    </Panel>
  );
}
