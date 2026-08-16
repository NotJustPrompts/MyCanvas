import { useCallback, useEffect, useState } from "react";
import { ASPECT_RATIOS, type DesignSummary } from "@mycanva/shared";
import { api } from "../api";

export function ProjectList() {
  const [designs, setDesigns] = useState<DesignSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [presetId, setPresetId] = useState(ASPECT_RATIOS[0]?.id ?? "16:9");
  const [creating, setCreating] = useState(false);

  const refresh = useCallback(() => {
    void api
      .listDesigns()
      .then(setDesigns)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to load designs");
      });
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const create = async () => {
    const preset = ASPECT_RATIOS.find((entry) => entry.id === presetId);
    setCreating(true);
    try {
      const design = await api.createDesign({
        name: newName.trim() || "Untitled design",
        aspectRatioId: preset?.id,
        width: preset?.width,
        height: preset?.height,
      });
      window.location.hash = `#/edit/${design.id}`;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create design");
      setCreating(false);
    }
  };

  const duplicate = (id: string) => {
    void api
      .duplicateDesign(id)
      .then(refresh)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to duplicate design");
      });
  };

  const remove = (id: string, name: string) => {
    if (!window.confirm(`Delete "${name}"? This cannot be undone.`)) {
      return;
    }
    void api
      .deleteDesign(id)
      .then(refresh)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to delete design");
      });
  };

  return (
    <div className="list-screen">
      <header className="list-header">
        <h1>mycanva</h1>
        <button
          type="button"
          className="primary"
          onClick={() => {
            setShowNew(true);
          }}
        >
          New design
        </button>
      </header>

      {error && <p className="form-error">{error}</p>}
      {designs === null && !error && <p className="muted">Loading…</p>}
      {designs !== null && designs.length === 0 && (
        <p className="muted">No designs yet. Create your first one.</p>
      )}

      <div className="design-grid">
        {(designs ?? []).map((design) => (
          <div key={design.id} className="design-card">
            <a className="design-thumb" href={`#/edit/${design.id}`}>
              {design.thumbnail
                ? (
                    <img src={design.thumbnail} alt={design.name} />
                  )
                : (
                    <span className="thumb-placeholder">
                      {design.width}
                      {" "}
                      ×
                      {design.height}
                    </span>
                  )}
            </a>
            <div className="design-meta">
              <strong>{design.name}</strong>
              <span className="muted">
                {design.width}
                {" "}
                ×
                {design.height}
                {" "}
                ·
                {new Date(design.updatedAt).toLocaleString()}
              </span>
            </div>
            <div className="design-actions">
              <a className="button-link" href={`#/edit/${design.id}`}>
                Open
              </a>
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  duplicate(design.id);
                }}
              >
                Duplicate
              </button>
              <button
                type="button"
                className="secondary danger"
                onClick={() => {
                  remove(design.id, design.name);
                }}
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>

      {showNew && (
        <div
          className="dialog-backdrop"
          onClick={() => {
            setShowNew(false);
          }}
        >
          <div
            className="dialog"
            role="dialog"
            aria-label="New design"
            onClick={(e) => {
              e.stopPropagation();
            }}
          >
            <h2>New design</h2>
            <label className="field field-wide">
              <span>Name</span>
              <input
                type="text"
                value={newName}
                placeholder="Untitled design"
                autoFocus
                onChange={(e) => {
                  setNewName(e.target.value);
                }}
              />
            </label>
            <div className="field field-wide">
              <span>Size</span>
              <div className="preset-grid">
                {ASPECT_RATIOS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    className={preset.id === presetId ? "preset selected" : "preset"}
                    onClick={() => {
                      setPresetId(preset.id);
                    }}
                  >
                    <strong>{preset.label}</strong>
                    <span className="muted">
                      {preset.width}
                      {" "}
                      ×
                      {preset.height}
                    </span>
                  </button>
                ))}
              </div>
            </div>
            <div className="dialog-actions">
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  setShowNew(false);
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="primary"
                disabled={creating}
                onClick={() => {
                  void create();
                }}
              >
                {creating ? "Creating…" : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
