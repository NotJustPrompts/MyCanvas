import { type LineLayer, type RectLayer, type ShapeLayer } from "@mycanva/shared";
import { ColorField, NumberField, type SectionProps } from "./fields";
import { Panel } from "./Panel";

/** Rectangle: size, fill, corner radius. */
export function RectSection({ layer, patch, commit }: SectionProps<RectLayer>) {
  return (
    <Panel title="Rectangle">
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
    </Panel>
  );
}

/** Shape (triangle/hexagon/circle/semicircle/star): size + fill. */
export function ShapeSection({ layer, patch, commit }: SectionProps<ShapeLayer>) {
  return (
    <Panel title="Shape">
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
    </Panel>
  );
}

/** Line: color, width, cap. */
export function LineSection({ layer, patch, commit }: SectionProps<LineLayer>) {
  return (
    <Panel title="Line">
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
    </Panel>
  );
}
