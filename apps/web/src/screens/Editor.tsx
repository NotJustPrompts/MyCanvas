import { useCallback, useEffect, useState } from "react";
import { Brand } from "../components/Brand";
import { CanvasStage } from "../components/CanvasStage";
import { ContextBar } from "../components/ContextBar";
import { ContextMenu } from "../components/ContextMenu";
import { ExportDialog } from "../components/ExportDialog";
import { Inspector } from "../components/Inspector";
import { LayersPanel } from "../components/LayersPanel";
import { LeftToolbar } from "../components/LeftToolbar";
import { ThemeToggle } from "../components/ThemeToggle";
import { useEditorStore } from "../store/editorStore";
import { makeDesignThumbnail } from "../utils/canvas-bridge";

export function Editor({ designId }: { designId: string }) {
  const design = useEditorStore((state) => state.design);
  const loadStatus = useEditorStore((state) => state.loadStatus);
  const saveStatus = useEditorStore((state) => state.saveStatus);
  const setName = useEditorStore((state) => state.setName);
  const toast = useEditorStore((state) => state.toast);

  const [fitScale, setFitScale] = useState(1);
  const [zoom, setZoom] = useState<number | null>(null);
  const [showExport, setShowExport] = useState(false);

  const loadDesign = useEditorStore((state) => state.loadDesign);
  const unload = useEditorStore((state) => state.unload);

  useEffect(() => {
    setZoom(null);
    void loadDesign(designId);
    return () => {
      unload();
    };
  }, [designId, loadDesign, unload]);

  const handleFitScale = useCallback((fit: number) => {
    setFitScale((prev) => (Math.abs(prev - fit) < 0.001 ? prev : fit));
  }, []);

  // Keyboard shortcuts: undo/redo, copy/paste, delete, arrow-key nudge.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const state = useEditorStore.getState();
      const target = e.target;
      // Only text-entry controls should swallow shortcuts. Sliders, checkboxes,
      // color inputs and buttons may keep focus after a click and must not
      // silently disable copy/paste while a layer is selected.
      const inField =
        target instanceof HTMLElement &&
        (target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable ||
          (target instanceof HTMLInputElement &&
            !["range", "checkbox", "radio", "color", "button"].includes(target.type)));
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) {
          state.redo();
        } else {
          state.undo();
        }
        return;
      }
      if (inField || !state.design) {
        return;
      }
      const hasSelection = state.selectedLayerIds.length > 0;
      if (mod && e.key.toLowerCase() === "c" && hasSelection) {
        e.preventDefault();
        state.copySelectedLayers();
        return;
      }
      if (mod && e.key.toLowerCase() === "v") {
        e.preventDefault();
        state.pasteLayers();
        return;
      }
      if (mod && e.key.toLowerCase() === "d" && hasSelection) {
        e.preventDefault();
        state.duplicateSelectedLayers();
        return;
      }
      if (mod && e.key.toLowerCase() === "g" && hasSelection) {
        e.preventDefault();
        if (e.shiftKey) {
          state.ungroupSelection();
        } else {
          state.groupSelection();
        }
        return;
      }
      // Cmd/Ctrl+Shift+L toggles layer locking (plain Cmd+L is the browser's
      // omnibox shortcut and can't be intercepted).
      if (mod && e.shiftKey && e.key.toLowerCase() === "l" && hasSelection) {
        e.preventDefault();
        state.toggleLockSelected();
        return;
      }
      if (e.key === "Escape" && state.editingGroupId) {
        // Leave the entered group: back to group-level selection.
        const groupId = state.editingGroupId;
        state.setEditingGroup(null);
        state.setSelectedLayers(
          state.design.layers.filter((entry) => entry.groupId === groupId).map((entry) => entry.id),
        );
        return;
      }
      if (!hasSelection) {
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        state.removeSelectedLayers();
        return;
      }
      const primaryId = state.selectedLayerIds[state.selectedLayerIds.length - 1];
      if (e.key === "Enter") {
        const layer = state.design.layers.find((entry) => entry.id === primaryId);
        if (state.selectedLayerIds.length === 1 && layer?.type === "text") {
          e.preventDefault();
          state.setEditingTextLayer(primaryId ?? null);
        }
        return;
      }
      if (e.key.startsWith("Arrow")) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
        const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
        state.updateLayers(
          state.selectedLayerIds.flatMap((id) => {
            const layer = state.design?.layers.find((entry) => entry.id === id);
            return layer ? [{ id, patch: { x: layer.x + dx, y: layer.y + dy } }] : [];
          }),
        );
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  // Prevent the browser's default "open the file" navigation when files are
  // dropped anywhere on the editor outside the canvas drop zone.
  useEffect(() => {
    const prevent = (e: DragEvent) => {
      e.preventDefault();
    };
    window.addEventListener("dragover", prevent);
    window.addEventListener("drop", prevent);
    return () => {
      window.removeEventListener("dragover", prevent);
      window.removeEventListener("drop", prevent);
    };
  }, []);

  // Best-effort save when leaving the page with unsaved changes.
  useEffect(() => {
    const onBeforeUnload = () => {
      const state = useEditorStore.getState();
      const current = state.design;
      if (!current || state.saveStatus === "saved") {
        return;
      }
      const thumbnail = makeDesignThumbnail();
      const payload = thumbnail ? { ...current, thumbnail } : current;
      void fetch(`/api/designs/${encodeURIComponent(current.id)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        keepalive: true,
      });
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, []);

  if (loadStatus === "loading") {
    return (
      <div className="editor-status">
        <p className="muted">Loading design…</p>
      </div>
    );
  }

  if (loadStatus === "not-found") {
    return (
      <div className="editor-status">
        <p>Design not found.</p>
        <a className="button-link" href="#/">
          Back to projects
        </a>
      </div>
    );
  }

  if (loadStatus === "error" || !design) {
    return (
      <div className="editor-status">
        <p>Failed to load the design. Is the server running?</p>
        <a className="button-link" href="#/">
          Back to projects
        </a>
      </div>
    );
  }

  const effectiveScale = zoom ?? fitScale;
  const zoomPercent = Math.round(effectiveScale * 100);

  const saveLabel =
    saveStatus === "saved"
      ? "Saved"
      : saveStatus === "saving"
        ? "Saving…"
        : "Unsaved changes";

  return (
    <div className="editor">
      <header className="editor-top">
        <Brand />
        <span className="top-bar-divider" aria-hidden="true" />
        <input
          className="design-name"
          value={design.name}
          onChange={(e) => {
            setName(e.target.value);
          }}
        />
        <span className={`save-pill ${saveStatus}`}>
          <span className="save-dot" aria-hidden="true" />
          {saveLabel}
        </span>
        <span className="top-bar-spacer" />
        <ThemeToggle />
        <button
          type="button"
          className="primary"
          onClick={() => {
            setShowExport(true);
          }}
        >
          Export
        </button>
      </header>
      <div className="editor-main">
        <LeftToolbar />
        <main className="editor-center">
          <ContextBar />
          <div className="canvas-wrap">
            <CanvasStage design={design} scale={effectiveScale} onFitScale={handleFitScale} />
          </div>
          <div className="editor-bottom">
            <input
              type="range"
              className="zoom-slider"
              min={0.05}
              max={2}
              step={0.05}
              value={Math.min(2, Math.max(0.05, effectiveScale))}
              onChange={(e) => {
                setZoom(Number(e.target.value));
              }}
              title="Zoom"
            />
            <span className="zoom-value">
              {zoomPercent}
              %
            </span>
            <button
              type="button"
              className="secondary"
              onClick={() => {
                setZoom(null);
              }}
            >
              Fit
            </button>
          </div>
        </main>
        <aside className="editor-right">
          <LayersPanel />
          <Inspector />
        </aside>
      </div>
      {showExport && (
        <ExportDialog
          onClose={() => {
            setShowExport(false);
          }}
        />
      )}
      <ContextMenu />
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}
