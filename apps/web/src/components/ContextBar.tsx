import { type TextLayer } from "@mycanva/shared";
import { primarySelectedId, useEditorStore } from "../store/editorStore";
import { ColorInput } from "./ColorInput";
import { FontPicker } from "./FontPicker";

/**
 * Floating contextual toolbar shown over the canvas while a layer is selected.
 * Text selections get font controls prepended; every selection gets the
 * duplicate / z-order / delete quick actions.
 */
export function ContextBar() {
  const selectedLayerIds = useEditorStore((state) => state.selectedLayerIds);
  const layer = useEditorStore((state) =>
    state.design?.layers.find((entry) => entry.id === primarySelectedId(state)));
  const design = useEditorStore((state) => state.design);
  const updateLayer = useEditorStore((state) => state.updateLayer);
  const commitTransient = useEditorStore((state) => state.commitTransient);
  const duplicateSelectedLayers = useEditorStore((state) => state.duplicateSelectedLayers);
  const moveSelectedLayers = useEditorStore((state) => state.moveSelectedLayers);
  const removeSelectedLayers = useEditorStore((state) => state.removeSelectedLayers);
  const groupSelection = useEditorStore((state) => state.groupSelection);
  const ungroupSelection = useEditorStore((state) => state.ungroupSelection);
  const editingTextLayerId = useEditorStore((state) => state.editingTextLayerId);

  const multi = selectedLayerIds.length > 1;
  const selectedLayers = design?.layers.filter((entry) => selectedLayerIds.includes(entry.id)) ?? [];
  const selectedGroupIds = new Set(
    selectedLayers.map((entry) => entry.groupId).filter((groupId): groupId is string => Boolean(groupId)),
  );
  const selectionHasGroup = selectedGroupIds.size > 0;
  const allSameGroup = multi && selectedGroupIds.size === 1 && selectedLayers.every((entry) => entry.groupId);

  if (!layer || editingTextLayerId || layer.locked) {
    return null;
  }

  const text: TextLayer | null = !multi && layer.type === "text" ? layer : null;
  const bold = text ? text.fontStyle.includes("bold") : false;
  const italic = text ? text.fontStyle.includes("italic") : false;

  const setFontStyle = (nextBold: boolean, nextItalic: boolean) => {
    const parts = [nextBold ? "bold" : "", nextItalic ? "italic" : ""].filter((part) => part !== "");
    updateLayer(layer.id, { fontStyle: parts.length > 0 ? parts.join(" ") : "normal" });
  };

  return (
    <div className="context-bar">
      {text && (
        <>
          <FontPicker
            compact
            value={text.fontFamily}
            onApply={(fontFamily) => {
              updateLayer(layer.id, { fontFamily });
            }}
          />
          <span className="context-sep" aria-hidden="true" />
          <div className="size-stepper">
            <button
              type="button"
              className="icon-button"
              title="Decrease font size"
              onClick={() => {
                updateLayer(layer.id, { fontSize: Math.max(1, text.fontSize - 2) });
              }}
            >
              −
            </button>
            <input
              type="number"
              className="size-input"
              value={text.fontSize}
              min={1}
              onChange={(e) => {
                const next = Number(e.target.value);
                if (Number.isFinite(next) && next > 0) {
                  updateLayer(layer.id, { fontSize: next }, true);
                }
              }}
              onBlur={commitTransient}
            />
            <button
              type="button"
              className="icon-button"
              title="Increase font size"
              onClick={() => {
                updateLayer(layer.id, { fontSize: text.fontSize + 2 });
              }}
            >
              +
            </button>
          </div>
          <button
            type="button"
            className={bold ? "icon-button toggle active" : "icon-button toggle"}
            title="Bold"
            onClick={() => {
              setFontStyle(!bold, italic);
            }}
          >
            <strong>B</strong>
          </button>
          <button
            type="button"
            className={italic ? "icon-button toggle active" : "icon-button toggle"}
            title="Italic"
            onClick={() => {
              setFontStyle(bold, !italic);
            }}
          >
            <em>I</em>
          </button>
          <ColorInput
            compact
            label="Text color"
            value={text.fill}
            onChange={(fill) => {
              updateLayer(layer.id, { fill }, true);
            }}
            onCommit={commitTransient}
          />
          <span className="context-sep" aria-hidden="true" />
        </>
      )}
      {multi && !allSameGroup && (
        <button
          type="button"
          className="secondary context-group-button"
          onClick={() => {
            groupSelection();
          }}
        >
          Group
        </button>
      )}
      {selectionHasGroup && (
        <button
          type="button"
          className="secondary context-group-button"
          onClick={() => {
            ungroupSelection();
          }}
        >
          Ungroup
        </button>
      )}
      <button
        type="button"
        className="icon-button"
        title="Duplicate"
        onClick={() => {
          duplicateSelectedLayers();
        }}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="9" y="9" width="12" height="12" rx="2" />
          <path d="M5 15V5a2 2 0 0 1 2-2h10" />
        </svg>
      </button>
      <button
        type="button"
        className="icon-button"
        title="Bring forward"
        onClick={() => {
          moveSelectedLayers(1);
        }}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 19V5M5 12l7-7 7 7" />
        </svg>
      </button>
      <button
        type="button"
        className="icon-button"
        title="Send backward"
        onClick={() => {
          moveSelectedLayers(-1);
        }}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 5v14M19 12l-7 7-7-7" />
        </svg>
      </button>
      <span className="context-sep" aria-hidden="true" />
      {!multi && (
        <div className="context-opacity" title="Opacity">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 3a9 9 0 0 1 0 18Z" fill="currentColor" stroke="none" />
          </svg>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={Math.round(layer.opacity * 100)}
            onChange={(e) => {
              updateLayer(layer.id, { opacity: Number(e.target.value) / 100 }, true);
            }}
            onPointerUp={commitTransient}
            onBlur={commitTransient}
          />
          <span className="context-opacity-value">{Math.round(layer.opacity * 100)}</span>
        </div>
      )}
      <button
        type="button"
        className="icon-button danger"
        title="Delete"
        onClick={() => {
          removeSelectedLayers();
        }}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
        </svg>
      </button>
    </div>
  );
}
