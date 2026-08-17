import { type ReactNode, useEffect, useRef, useState } from "react";
import {
  type LineLayer,
  type RectLayer,
  type ShapeKind,
  type ShapeLayer,
  type TextLayer,
  defaultShadow,
  defaultStroke,
} from "@mycanva/shared";
import { api, type AssetInfo } from "../api";
import { getCachedImageSize } from "../hooks/useImage";
import { newLayerId, primarySelectedId, useEditorStore } from "../store/editorStore";
import { ensureFontLoaded } from "../utils/fonts";
import { ColorInput } from "./ColorInput";

type RailTab = "text" | "shapes" | "uploads";

export function LeftToolbar() {
  const design = useEditorStore((state) => state.design);
  const selectedLayer = useEditorStore((state) =>
    state.design?.layers.find((layer) => layer.id === primarySelectedId(state)));
  const addLayer = useEditorStore((state) => state.addLayer);
  const addImageLayer = useEditorStore((state) => state.addImageLayer);
  const updateLayer = useEditorStore((state) => state.updateLayer);
  const setBackground = useEditorStore((state) => state.setBackground);
  const commitTransient = useEditorStore((state) => state.commitTransient);

  const assetsVersion = useEditorStore((state) => state.assetsVersion);

  const [tab, setTab] = useState<RailTab>("text");
  const [assets, setAssets] = useState<AssetInfo[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [lastBgColor, setLastBgColor] = useState("#ffffff");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Refetch the asset list on mount and whenever an upload lands (including
  // drag-and-drop uploads onto the canvas).
  useEffect(() => {
    void api
      .listAssets()
      .then(setAssets)
      .catch(() => undefined);
  }, [assetsVersion]);

  useEffect(() => {
    void api
      .getFontFavorites()
      .then((res) => {
        setFavorites(res.googleFontFavorites);
      })
      .catch(() => undefined);
  }, []);

  if (!design) {
    return null;
  }

  const transparent = design.background === "transparent";

  const addText = (fontFamily = "Inter") => {
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
      fontFamily,
      fontSize: 64,
      fontStyle: "normal",
      fill: "#ffffff",
      align: "left",
      lineHeight: 1.2,
      letterSpacing: 0,
      wrapWidth: 0,
      curve: 0,
      effect: { type: "none" },
      shadow: defaultShadow(),
      stroke: defaultStroke(),
    };
    addLayer(layer);
  };

  /** Applies the font to the selected text layer, or adds a new text layer in that font. */
  const applyFavoriteFont = (fontFamily: string) => {
    void ensureFontLoaded(fontFamily);
    if (selectedLayer?.type === "text") {
      updateLayer(selectedLayer.id, { fontFamily });
    } else {
      addText(fontFamily);
    }
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
      fill: "#7c3aed",
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
      strokeColor: "#7c3aed",
      strokeWidth: 4,
      lineCap: "round",
      shadow: defaultShadow(),
    };
    addLayer(layer);
  };

  const addShape = (shape: ShapeKind, name: string) => {
    const width = Math.round(design.width / 4);
    const height = Math.round(design.height / 4);
    const layer: ShapeLayer = {
      id: newLayerId(),
      type: "shape",
      shape,
      name,
      x: Math.round((design.width - width) / 2),
      y: Math.round((design.height - height) / 2),
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      opacity: 1,
      visible: true,
      width,
      height,
      fill: "#7c3aed",
      stroke: defaultStroke(),
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
      .then((info) => {
        setAssets((prev) => [...prev, info]);
        addAssetToCanvas(info.asset);
      })
      .catch((error: unknown) => {
        setUploadError(error instanceof Error ? error.message : "Upload failed");
      });
  };

  const railTabs: { id: RailTab; label: string; icon: ReactNode }[] = [
    {
      id: "text",
      label: "Text",
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 6h14M12 6v13" />
        </svg>
      ),
    },
    {
      id: "shapes",
      label: "Shapes",
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="10" height="10" rx="1.5" />
          <circle cx="16" cy="16" r="5" />
        </svg>
      ),
    },
    {
      id: "uploads",
      label: "Uploads",
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M16 16l-4-4-4 4M12 12v9" />
          <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
        </svg>
      ),
    },
  ];

  return (
    <aside className="editor-left">
      <nav className="rail" aria-label="Add elements">
        {railTabs.map((railTab) => (
          <button
            key={railTab.id}
            type="button"
            className={tab === railTab.id ? "rail-tab active" : "rail-tab"}
            onClick={() => {
              setTab(railTab.id);
            }}
          >
            {railTab.icon}
            <span>{railTab.label}</span>
          </button>
        ))}
      </nav>

      <div className="rail-panel">
        <div className="panel-scroll">
          {tab === "text" && (
            <>
              <button
                type="button"
                className="primary block"
                onClick={() => {
                  addText();
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 6h14M12 6v13" />
                </svg>
                Add a text box
              </button>
              {favorites.length > 0 && (
                <div className="panel-section">
                  <h3>Favorite fonts</h3>
                  <div className="favorite-fonts">
                    {favorites.map((family) => (
                      <button
                        key={family}
                        type="button"
                        className="favorite-font"
                        style={{ fontFamily: `"${family}"` }}
                        title={
                          selectedLayer?.type === "text"
                            ? `Apply ${family} to selection`
                            : `Add a text box in ${family}`
                        }
                        onMouseEnter={() => {
                          void ensureFontLoaded(family);
                        }}
                        onClick={() => {
                          applyFavoriteFont(family);
                        }}
                      >
                        {family}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {tab === "shapes" && (
            <div className="panel-section">
              <h3>Shapes</h3>
              <div className="toolbar-buttons">
                <button type="button" className="tool-tile" onClick={addRect}>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                    <rect x="4" y="6" width="16" height="12" rx="2" />
                  </svg>
                  <span>Rectangle</span>
                </button>
                <button type="button" className="tool-tile" onClick={addLine}>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <path d="M4 20L20 4" />
                  </svg>
                  <span>Line</span>
                </button>
                <button type="button" className="tool-tile" onClick={() => { addShape("triangle", "Triangle"); }}>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                    <path d="M12 4L21 20H3Z" />
                  </svg>
                  <span>Triangle</span>
                </button>
                <button type="button" className="tool-tile" onClick={() => { addShape("hexagon", "Hexagon"); }}>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                    <path d="M7 3h10l5 9-5 9H7l-5-9Z" />
                  </svg>
                  <span>Hexagon</span>
                </button>
                <button type="button" className="tool-tile" onClick={() => { addShape("circle", "Circle"); }}>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                    <circle cx="12" cy="12" r="9" />
                  </svg>
                  <span>Circle</span>
                </button>
                <button type="button" className="tool-tile" onClick={() => { addShape("semicircle", "Semicircle"); }}>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                    <path d="M3 17a9 9 0 0 1 18 0Z" />
                  </svg>
                  <span>Semicircle</span>
                </button>
                <button type="button" className="tool-tile" onClick={() => { addShape("star", "Star"); }}>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                    <path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9Z" />
                  </svg>
                  <span>Star</span>
                </button>
              </div>
            </div>
          )}

          {tab === "uploads" && (
            <>
              <button
                type="button"
                className="primary block"
                onClick={() => fileInputRef.current?.click()}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M16 16l-4-4-4 4M12 12v9" />
                  <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
                </svg>
                Upload image
              </button>
              {uploadError && <p className="form-error">{uploadError}</p>}
              <div className="panel-section">
                {assets.length === 0
                  ? (
                      <p className="muted">No uploads yet.</p>
                    )
                  : (
                      <div className="asset-grid">
                        {assets.map((info) => (
                          <button
                            key={info.asset}
                            type="button"
                            className="asset-thumb"
                            title={info.name}
                            onClick={() => {
                              addAssetToCanvas(info.asset);
                            }}
                          >
                            <img src={`/assets/${info.asset}`} alt={info.name} loading="lazy" />
                            <span className="asset-name">{info.name}</span>
                          </button>
                        ))}
                      </div>
                    )}
              </div>
            </>
          )}
        </div>

        <div className="panel-bottom">
          <div className="panel-section">
            <h3>Background</h3>
            <div className="field-row">
              <ColorInput
                compact
                label="Background color"
                value={transparent ? lastBgColor : design.background}
                disabled={transparent}
                onChange={(color) => {
                  setLastBgColor(color);
                  setBackground(color, true);
                }}
                onCommit={commitTransient}
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
        </div>
      </div>

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
    </aside>
  );
}
