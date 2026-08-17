import { useCallback, useEffect, useState } from "react";
import { ASPECT_RATIOS, type DesignSummary } from "@mycanva/shared";
import { api } from "../api";
import { Brand } from "../components/Brand";
import { ThemeToggle } from "../components/ThemeToggle";
import { relativeEditedTime } from "../utils/relative-time";

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
      <header className="top-bar">
        <Brand />
        <div className="top-bar-actions">
          <ThemeToggle />
        </div>
      </header>

      <div className="list-hero">
        <h1>What will you design today?</h1>
        <button
          type="button"
          className="primary hero-cta"
          onClick={() => {
            setShowNew(true);
          }}
        >
          New design
        </button>
      </div>

      <div className="list-content">
        {error && <p className="form-error">{error}</p>}
        {designs === null && !error && <p className="muted">Loading…</p>}
        {designs !== null && (
          <h2 className="section-title">Continue designing</h2>
        )}
        {designs !== null && designs.length === 0 && (
          <p className="muted">No designs yet. Create your first one.</p>
        )}

        <div className="design-grid">
          {(designs ?? []).map((design) => (
            <div
              key={design.id}
              className="design-card"
              role="link"
              tabIndex={0}
              onClick={() => {
                window.location.hash = `#/edit/${design.id}`;
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  window.location.hash = `#/edit/${design.id}`;
                }
              }}
            >
              <div className="design-thumb">
                {design.thumbnail
                  ? (
                      <img src={design.thumbnail} alt={design.name} />
                    )
                  : (
                      <span className="thumb-placeholder">
                        {`${String(design.width)} × ${String(design.height)}`}
                      </span>
                    )}
              </div>
              <div className="design-meta">
                <strong>{design.name}</strong>
                <span className="muted">
                  {`${String(design.width)} × ${String(design.height)} · ${relativeEditedTime(design.updatedAt)}`}
                </span>
              </div>
              <div className="design-actions">
                <button
                  type="button"
                  className="secondary"
                  onClick={(e) => {
                    e.stopPropagation();
                    window.location.hash = `#/edit/${design.id}`;
                  }}
                >
                  Open
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={(e) => {
                    e.stopPropagation();
                    duplicate(design.id);
                  }}
                >
                  Duplicate
                </button>
                <button
                  type="button"
                  className="secondary danger"
                  onClick={(e) => {
                    e.stopPropagation();
                    remove(design.id, design.name);
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
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
                {ASPECT_RATIOS.map((preset) => {
                  const landscape = preset.width >= preset.height;
                  const glyphWidth = landscape ? 32 : Math.max(8, Math.round((24 * preset.width) / preset.height));
                  const glyphHeight = landscape ? Math.max(8, Math.round((32 * preset.height) / preset.width)) : 24;
                  const dims = `${String(preset.width)} × ${String(preset.height)}`;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      className={preset.id === presetId ? "preset selected" : "preset"}
                      onClick={() => {
                        setPresetId(preset.id);
                      }}
                    >
                      <span
                        className="preset-glyph"
                        style={{ width: glyphWidth, height: glyphHeight }}
                        aria-hidden="true"
                      />
                      <strong>{preset.label}</strong>
                      <span className="muted">{dims}</span>
                    </button>
                  );
                })}
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
