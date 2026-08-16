import { useCallback, useEffect, useState } from "react";
import { CanvasStage } from "../components/CanvasStage";
import { ExportDialog } from "../components/ExportDialog";
import { Inspector } from "../components/Inspector";
import { LayersPanel } from "../components/LayersPanel";
import { LeftToolbar } from "../components/LeftToolbar";
import { useEditorStore } from "../store/editorStore";
import { makeDesignThumbnail } from "../utils/canvas-bridge";

const ZOOM_STEP = 1.25;

export function Editor({ designId }: { designId: string }) {
  const design = useEditorStore((state) => state.design);
  const loadStatus = useEditorStore((state) => state.loadStatus);
  const saveStatus = useEditorStore((state) => state.saveStatus);
  const setName = useEditorStore((state) => state.setName);

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

  // Keyboard shortcuts: undo/redo, delete, arrow-key nudge.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const state = useEditorStore.getState();
      const target = e.target;
      const inField =
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable);
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
      if (mod && e.key.toLowerCase() === "c" && state.selectedLayerId) {
        e.preventDefault();
        state.copyLayer(state.selectedLayerId);
        return;
      }
      if (mod && e.key.toLowerCase() === "v") {
        e.preventDefault();
        state.pasteLayer();
        return;
      }
      const selectedId = state.selectedLayerId;
      if (!selectedId) {
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        state.removeLayer(selectedId);
        return;
      }
      if (e.key.startsWith("Arrow")) {
        const layer = state.design.layers.find((entry) => entry.id === selectedId);
        if (!layer) {
          return;
        }
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
        const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
        state.updateLayer(selectedId, { x: layer.x + dx, y: layer.y + dy });
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
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
        <a className="back-link" href="#/">
          ← Projects
        </a>
        <input
          className="design-name"
          value={design.name}
          onChange={(e) => {
            setName(e.target.value);
          }}
        />
        <span className={`save-status ${saveStatus}`}>{saveLabel}</span>
        <div className="zoom-controls">
          <button
            type="button"
            className="icon-button"
            title="Zoom out"
            onClick={() => {
              setZoom(Math.max(0.05, effectiveScale / ZOOM_STEP));
            }}
          >
            −
          </button>
          <span className="zoom-value">
            {zoomPercent}
            %
          </span>
          <button
            type="button"
            className="icon-button"
            title="Zoom in"
            onClick={() => {
              setZoom(Math.min(4, effectiveScale * ZOOM_STEP));
            }}
          >
            +
          </button>
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
          <CanvasStage design={design} scale={effectiveScale} onFitScale={handleFitScale} />
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
    </div>
  );
}
