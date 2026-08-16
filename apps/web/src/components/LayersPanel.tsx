import { useState } from "react";
import { type Layer } from "@mycanva/shared";
import { useEditorStore } from "../store/editorStore";

const TYPE_LABELS: Record<Layer["type"], string> = {
  text: "Text",
  image: "Image",
  rect: "Rect",
  line: "Line",
};

function EyeIcon({ visible }: { visible: boolean }) {
  return visible
    ? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      )
    : (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
          <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
          <line x1="1" y1="1" x2="23" y2="23" />
        </svg>
      );
}

export function LayersPanel() {
  const design = useEditorStore((state) => state.design);
  const selectedLayerId = useEditorStore((state) => state.selectedLayerId);
  const selectLayer = useEditorStore((state) => state.selectLayer);
  const updateLayer = useEditorStore((state) => state.updateLayer);
  const removeLayer = useEditorStore((state) => state.removeLayer);
  const duplicateLayer = useEditorStore((state) => state.duplicateLayer);
  const moveLayer = useEditorStore((state) => state.moveLayer);

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");

  if (!design) {
    return null;
  }

  // Top of the list = top-most layer (reverse of z-order).
  const layers = [...design.layers].reverse();

  const commitRename = (id: string) => {
    const trimmed = draftName.trim();
    if (trimmed) {
      updateLayer(id, { name: trimmed });
    }
    setRenamingId(null);
  };

  return (
    <div className="panel-section layers-panel">
      <h3>Layers</h3>
      {layers.length === 0 && <p className="muted">No layers yet.</p>}
      {layers.length > 0 && <p className="muted kbd-hint">⌘C copy · ⌘V paste</p>}
      <ul className="layers-list">
        {layers.map((layer) => (
          <li
            key={layer.id}
            className={layer.id === selectedLayerId ? "layer-row selected" : "layer-row"}
            onClick={() => {
              selectLayer(layer.id);
            }}
          >
            <button
              type="button"
              className="icon-button"
              title={layer.visible ? "Hide layer" : "Show layer"}
              onClick={(e) => {
                e.stopPropagation();
                updateLayer(layer.id, { visible: !layer.visible });
              }}
            >
              <EyeIcon visible={layer.visible} />
            </button>
            <span className="layer-type">{TYPE_LABELS[layer.type]}</span>
            {renamingId === layer.id
              ? (
                  <input
                    className="layer-rename"
                    value={draftName}
                    autoFocus
                    onChange={(e) => {
                      setDraftName(e.target.value);
                    }}
                    onBlur={() => {
                      commitRename(layer.id);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        commitRename(layer.id);
                      } else if (e.key === "Escape") {
                        setRenamingId(null);
                      }
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                    }}
                  />
                )
              : (
                  <span
                    className="layer-name"
                    title="Double-click to rename"
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      setDraftName(layer.name);
                      setRenamingId(layer.id);
                    }}
                  >
                    {layer.name}
                  </span>
                )}
            <span className="layer-actions">
              <button
                type="button"
                className="icon-button"
                title="Move up"
                onClick={(e) => {
                  e.stopPropagation();
                  moveLayer(layer.id, 1);
                }}
              >
                ↑
              </button>
              <button
                type="button"
                className="icon-button"
                title="Move down"
                onClick={(e) => {
                  e.stopPropagation();
                  moveLayer(layer.id, -1);
                }}
              >
                ↓
              </button>
              <button
                type="button"
                className="icon-button"
                title="Duplicate layer"
                onClick={(e) => {
                  e.stopPropagation();
                  duplicateLayer(layer.id);
                }}
              >
                ⧉
              </button>
              <button
                type="button"
                className="icon-button danger"
                title="Delete layer"
                onClick={(e) => {
                  e.stopPropagation();
                  removeLayer(layer.id);
                }}
              >
                ×
              </button>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
