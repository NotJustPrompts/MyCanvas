import { useEffect, useState } from "react";
import { type TextLayer } from "@mycanva/shared";
import { useEditorStore } from "../store/editorStore";
import { exportDesignImage } from "../utils/canvas-bridge";
import { ensureFontsLoaded } from "../utils/fonts";

interface ExportDialogProps {
  onClose: () => void;
}

const SCALE_OPTIONS = ["0.25", "0.5", "0.75", "1", "2", "3"];

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${String(Math.max(1, Math.round(bytes / 1024)))} KB`;
  }
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export function ExportDialog({ onClose }: ExportDialogProps) {
  const design = useEditorStore((state) => state.design);
  const [format, setFormat] = useState<"png" | "jpeg">("png");
  const [ratio, setRatio] = useState("1");
  const [quality, setQuality] = useState(0.8);
  const [busy, setBusy] = useState(false);
  const [estimate, setEstimate] = useState<string | null>(null);

  const multiplier = Number(ratio);

  // Live size estimate: run the same export path (debounced) and approximate
  // the decoded file size from the base64 payload length.
  useEffect(() => {
    if (!design) {
      return;
    }
    const timer = setTimeout(() => {
      try {
        const mimeType = format === "png" ? "image/png" : "image/jpeg";
        const dataUrl = exportDesignImage({
          mimeType,
          quality,
          pixelRatio: multiplier,
          flattenWhite: format === "jpeg" && design.background === "transparent",
        });
        const base64Length = dataUrl.length - dataUrl.indexOf(",") - 1;
        setEstimate(`≈ ${formatBytes(Math.round(base64Length * 0.75))}`);
      } catch {
        setEstimate(null);
      }
    }, 300);
    return () => {
      clearTimeout(timer);
    };
  }, [design, format, multiplier, quality]);

  if (!design) {
    return null;
  }

  const outWidth = Math.round(design.width * multiplier);
  const outHeight = Math.round(design.height * multiplier);
  const outputSummary = `Output: ${String(outWidth)} × ${String(outHeight)} px${estimate ? ` · ${estimate}` : ""}`;

  const doExport = async () => {
    setBusy(true);
    try {
      const families = design.layers
        .filter((layer): layer is TextLayer => layer.type === "text")
        .map((layer) => layer.fontFamily);
      await ensureFontsLoaded(families);
      const mimeType = format === "png" ? "image/png" : "image/jpeg";
      const dataUrl = exportDesignImage({
        mimeType,
        quality,
        pixelRatio: multiplier,
        flattenWhite: format === "jpeg" && design.background === "transparent",
      });
      const anchor = document.createElement("a");
      anchor.href = dataUrl;
      anchor.download = `${design.name.trim() || "design"}.${format === "png" ? "png" : "jpg"}`;
      anchor.click();
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div
        className="dialog"
        role="dialog"
        aria-label="Export design"
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        <h2>Export</h2>
        <label className="field field-wide">
          <span>Format</span>
          <select
            value={format}
            onChange={(e) => {
              setFormat(e.target.value === "jpeg" ? "jpeg" : "png");
            }}
          >
            <option value="png">PNG</option>
            <option value="jpeg">JPG</option>
          </select>
        </label>
        <label className="field field-wide">
          <span>Scale</span>
          <select
            value={ratio}
            onChange={(e) => {
              setRatio(e.target.value);
            }}
          >
            {SCALE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option === "1" ? "1x (original)" : `${option}x`}
              </option>
            ))}
          </select>
        </label>
        {format === "jpeg" && (
          <label className="field field-wide">
            <span>
              Quality
              <em>{quality.toFixed(2)}</em>
            </span>
            <input
              type="range"
              min={0.5}
              max={1}
              step={0.05}
              value={quality}
              onChange={(e) => {
                setQuality(Number(e.target.value));
              }}
            />
          </label>
        )}
        <p className="muted">{outputSummary}</p>
        <div className="dialog-actions">
          <button type="button" className="secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="primary"
            disabled={busy}
            onClick={() => {
              void doExport();
            }}
          >
            {busy ? "Exporting…" : "Export"}
          </button>
        </div>
      </div>
    </div>
  );
}
