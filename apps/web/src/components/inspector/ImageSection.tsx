import { type ImageLayer } from "@mycanvas/shared";
import { getCachedImageSize } from "../../hooks/useImage";
import { NumberField, type SectionProps } from "./fields";
import { Panel } from "./Panel";

/** Width/height + reset-to-natural. */
export function ImageSection({ layer, patch, commit }: SectionProps<ImageLayer>) {
  const natural = getCachedImageSize(`/assets/${layer.asset}`);
  return (
    <Panel title="Image">
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
    </Panel>
  );
}
