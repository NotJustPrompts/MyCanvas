import { useEffect, useRef, useState } from "react";
import { GOOGLE_FONTS, type GoogleFont } from "@mycanva/shared";
import { api } from "../api";
import { ensureFontLoaded, isGoogleFont } from "../utils/fonts";

interface FontPickerProps {
  value: string;
  onApply: (family: string) => void;
}

export function FontPicker({ value, onApply }: FontPickerProps) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const [favorites, setFavorites] = useState<string[] | null>(null);
  const [systemFonts, setSystemFonts] = useState<string[] | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  // Close when clicking outside the dropdown.
  useEffect(() => {
    if (!open) {
      return;
    }
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && e.target instanceof Node && !rootRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  // Lazy-load favorites and system fonts the first time the dropdown opens.
  useEffect(() => {
    if (!open) {
      return;
    }
    if (favorites === null) {
      void api
        .getFontFavorites()
        .then((res) => {
          setFavorites(res.googleFontFavorites);
        })
        .catch(() => {
          setFavorites([]);
        });
    }
    if (systemFonts === null) {
      void api
        .systemFonts()
        .then(setSystemFonts)
        .catch(() => {
          setSystemFonts([]);
        });
    }
  }, [open, favorites, systemFonts]);

  const apply = (family: string) => {
    if (isGoogleFont(family)) {
      void ensureFontLoaded(family);
    }
    onApply(family);
    setOpen(false);
  };

  const toggleFavorite = (family: string) => {
    const current = favorites ?? [];
    const next = current.includes(family)
      ? current.filter((fav) => fav !== family)
      : [...current, family];
    setFavorites(next);
    void api.setFontFavorites(next).catch(() => {
      setFavorites(current);
    });
  };

  const query = filter.trim().toLowerCase();
  const matches = (family: string) => !query || family.toLowerCase().includes(query);

  const favoriteFonts = (favorites ?? []).filter(matches);
  const googleFonts = GOOGLE_FONTS.filter((font) => matches(font.family));
  const localFonts = (systemFonts ?? []).filter(matches);

  const renderGoogleRow = (font: GoogleFont) => {
    const isFavorite = (favorites ?? []).includes(font.family);
    return (
      <div key={font.family} className="font-row">
        <button
          type="button"
          className="font-name"
          style={{ fontFamily: `"${font.family}", ${font.category}` }}
          onMouseEnter={() => {
            void ensureFontLoaded(font.family);
          }}
          onClick={() => {
            apply(font.family);
          }}
        >
          {font.family}
        </button>
        <button
          type="button"
          className={isFavorite ? "icon-button star active" : "icon-button star"}
          title={isFavorite ? "Remove from favorites" : "Add to favorites"}
          onClick={() => {
            toggleFavorite(font.family);
          }}
        >
          {isFavorite ? "★" : "☆"}
        </button>
      </div>
    );
  };

  return (
    <div className="font-picker" ref={rootRef}>
      <button
        type="button"
        className="font-picker-toggle"
        onClick={() => {
          setOpen((prev) => !prev);
        }}
      >
        <span style={{ fontFamily: `"${value}"` }}>{value}</span>
        <span className="caret">▾</span>
      </button>
      {open && (
        <div className="font-dropdown">
          <input
            className="font-filter"
            placeholder="Filter fonts…"
            value={filter}
            autoFocus
            onChange={(e) => {
              setFilter(e.target.value);
            }}
          />
          <div className="font-groups">
            {favoriteFonts.length > 0 && (
              <div className="font-group">
                <h4>Favorites</h4>
                {favoriteFonts.map((family) => {
                  const font = GOOGLE_FONTS.find((entry) => entry.family === family);
                  return font ? renderGoogleRow(font) : null;
                })}
              </div>
            )}
            <div className="font-group">
              <h4>Google Fonts</h4>
              {googleFonts.map(renderGoogleRow)}
            </div>
            <div className="font-group">
              <h4>Installed on this Mac</h4>
              {systemFonts === null && <p className="muted">Loading…</p>}
              {localFonts.map((family) => (
                <div key={family} className="font-row">
                  <button
                    type="button"
                    className="font-name"
                    style={{ fontFamily: `"${family}"` }}
                    onClick={() => {
                      apply(family);
                    }}
                  >
                    {family}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
