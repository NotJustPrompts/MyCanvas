import { useEffect, useState } from "react";
import { type FrameLayer } from "@mycanvas/shared";
import { api, type AssetInfo } from "../../api";
import { fillFrame } from "../../utils/frames";
import { useEditorStore } from "../../store/editorStore";
import { NumberField, type SectionProps } from "./fields";
import { Panel } from "./Panel";

/** Frame: size, corner radius (not circle), image content picker. */
export function FrameSection({ layer, patch, commit }: SectionProps<FrameLayer>) {
  const updateLayer = useEditorStore((state) => state.updateLayer);
  const assetsVersion = useEditorStore((state) => state.assetsVersion);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [assets, setAssets] = useState<AssetInfo[]>([]);

  useEffect(() => {
    if (!pickerOpen) {
      return;
    }
    void api
      .listAssets()
      .then(setAssets)
      .catch(() => undefined);
  }, [pickerOpen, assetsVersion]);

  return (
    <Panel title="Frame">
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
        {layer.shape !== "circle" && (
          <NumberField
            label="Corner radius"
            value={layer.cornerRadius ?? 0}
            min={0}
            onChange={(cornerRadius) => {
              patch({ cornerRadius }, true);
            }}
            onCommit={commit}
          />
        )}
      </div>
      <button
        type="button"
        className="secondary block"
        onClick={() => {
          setPickerOpen((open) => !open);
        }}
      >
        {layer.content ? "Replace image" : "Choose image"}
      </button>
      {layer.content && (
        <button
          type="button"
          className="secondary block"
          onClick={() => {
            updateLayer(layer.id, { content: undefined });
          }}
        >
          Remove image
        </button>
      )}
      {layer.content && <p className="muted field-note">Double-click the frame to pan &amp; zoom the image.</p>}
      {pickerOpen && (
        <div className="asset-grid frame-asset-picker">
          {assets.length === 0 && <p className="muted">No uploads yet — drop or upload an image first.</p>}
          {assets.map((info) => (
            <button
              key={info.asset}
              type="button"
              className="asset-thumb"
              title={info.name}
              onClick={() => {
                setPickerOpen(false);
                void fillFrame(layer.id, info.asset);
              }}
            >
              <img src={`/assets/${info.asset}`} alt={info.name} loading="lazy" draggable={false} />
              <span className="asset-name">{info.name}</span>
            </button>
          ))}
        </div>
      )}
    </Panel>
  );
}
