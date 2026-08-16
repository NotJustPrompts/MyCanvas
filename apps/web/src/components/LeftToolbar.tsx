import { useEffect, useRef, useState } from "react";
import {
  type LineLayer,
  type RectLayer,
  type TextLayer,
  defaultShadow,
  defaultStroke,
} from "@mycanva/shared";
import { api } from "../api";
import { getCachedImageSize } from "../hooks/useImage";
import { newLayerId, useEditorStore } from "../store/editorStore";

export function LeftToolbar() {
  const design = useEditorStore((state) => state.design);
  const addLayer = useEditorStore((state) => state.addLayer);
  const addImageLayer = useEditorStore((state) => state.addImageLayer);
  const setBackground = useEditorStore((state) => state.setBackground);
  const commitTransient = useEditorStore((state) => state.commitTransient);

  const [assets, setAssets] = useState<string[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [lastBgColor, setLastBgColor] = useState("#ffffff");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    void api
      .listAssets()
      .then(setAssets)
      .catch(() => undefined);
  }, []);

  if (!design) {
    return null;
  }

  const transparent = design.background === "transparent";

  const addText = () => {
    const layer: TextLayer = {
      id: newLayerId(),
      type: "text",
      name: "Text",
      x: Math.round(design.width / 2),
      y: Math.round(design.height / 2),
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      opacity: 1,
      visible: true,
      text: "Your text here",
      fontFamily: "Inter",
      fontSize: 64,
      fontStyle: "normal",
      fill: "#ffffff",
      align: "left",
      lineHeight: 1.2,
      letterSpacing: 0,
      wrapWidth: 0,
      shadow: defaultShadow(),
      stroke: defaultStroke(),
    };
    addLayer(layer);
  };

  const addRect = () => {
    const width = Math.round(design.width / 3);
    const height = Math.round(design.height / 3);
    const layer: RectLayer = {
      id: newLayerId(),
      type: "rect",
      name: "Rectangle",
      x: Math.round((design.width - width) / 2),
      y: Math.round((design.height - height) / 2),
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      opacity: 1,
      visible: true,
      width,
      height,
      fill: "#6366f1",
      cornerRadius: 0,
      stroke: defaultStroke(),
      shadow: defaultShadow(),
    };
    addLayer(layer);
  };

  const addLine = () => {
    const length = Math.round(design.width / 3);
    const layer: LineLayer = {
      id: newLayerId(),
      type: "line",
      name: "Line",
      x: Math.round((design.width - length) / 2),
      y: Math.round(design.height / 2),
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      opacity: 1,
      visible: true,
      points: [0, 0, length, 0],
      strokeColor: "#fafafa",
      strokeWidth: 4,
      lineCap: "round",
      shadow: defaultShadow(),
    };
    addLayer(layer);
  };

  const addAssetToCanvas = (asset: string) => {
    const url = `/assets/${asset}`;
    const cached = getCachedImageSize(url);
    if (cached) {
      addImageLayer(asset, cached.width, cached.height);
      return;
    }
    const img = new window.Image();
    img.onload = () => {
      addImageLayer(asset, img.naturalWidth || 1, img.naturalHeight || 1);
    };
    img.src = url;
  };

  const onFileChosen = (file: File | undefined) => {
    if (!file) {
      return;
    }
    setUploadError(null);
    void api
      .uploadAsset(file)
      .then(({ asset }) => {
        setAssets((prev) => [...prev, asset]);
        addAssetToCanvas(asset);
      })
      .catch((error: unknown) => {
        setUploadError(error instanceof Error ? error.message : "Upload failed");
      });
  };

  return (
    <aside className="editor-left">
      <div className="panel-section">
        <h3>Add</h3>
        <div className="toolbar-buttons">
          <button type="button" onClick={addText}>
            Text
          </button>
          <button type="button" onClick={addRect}>
            Rectangle
          </button>
          <button type="button" onClick={addLine}>
            Line
          </button>
          <button type="button" onClick={() => fileInputRef.current?.click()}>
            Image…
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml"
            hidden
            onChange={(e) => {
              onFileChosen(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </div>
        {uploadError && <p className="form-error">{uploadError}</p>}
      </div>

      <div className="panel-section">
        <h3>Background</h3>
        <div className="field-row">
          <input
            type="color"
            value={transparent ? lastBgColor : design.background}
            disabled={transparent}
            onChange={(e) => {
              setLastBgColor(e.target.value);
              setBackground(e.target.value, true);
            }}
            onBlur={commitTransient}
          />
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={transparent}
              onChange={(e) => {
                setBackground(e.target.checked ? "transparent" : lastBgColor);
              }}
            />
            Transparent
          </label>
        </div>
      </div>

      <div className="panel-section">
        <h3>Assets</h3>
        {assets.length === 0
          ? (
              <p className="muted">No uploads yet.</p>
            )
          : (
              <div className="asset-grid">
                {assets.map((asset) => (
                  <button
                    key={asset}
                    type="button"
                    className="asset-thumb"
                    title={asset}
                    onClick={() => {
                      addAssetToCanvas(asset);
                    }}
                  >
                    <img src={`/assets/${asset}`} alt={asset} loading="lazy" />
                  </button>
                ))}
              </div>
            )}
      </div>
    </aside>
  );
}
