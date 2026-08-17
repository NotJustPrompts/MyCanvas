import { type TextLayer } from "@mycanvas/shared";
import { FontPicker } from "../FontPicker";
import { ColorField, NumberField, type SectionProps } from "./fields";
import { Panel } from "./Panel";

/** Content, font family, size, fill and style/alignment toggles. */
export function TextContentSection({ layer, patch, commit }: SectionProps<TextLayer>) {
  const bold = layer.fontStyle.includes("bold");
  const italic = layer.fontStyle.includes("italic");

  const setFontStyle = (nextBold: boolean, nextItalic: boolean) => {
    const parts = [nextBold ? "bold" : "", nextItalic ? "italic" : ""].filter((part) => part !== "");
    patch({ fontStyle: parts.length > 0 ? parts.join(" ") : "normal" });
  };

  return (
    <Panel title="Text">
      <label className="field field-wide">
        <span>Content</span>
        <textarea
          rows={3}
          value={layer.text}
          onChange={(e) => {
            patch({ text: e.target.value }, true);
          }}
          onBlur={commit}
        />
      </label>
      <div className="field field-wide">
        <span>Font</span>
        <FontPicker
          value={layer.fontFamily}
          onApply={(fontFamily) => {
            patch({ fontFamily });
          }}
        />
      </div>
      <div className="field-grid">
        <NumberField
          label="Size"
          value={layer.fontSize}
          min={1}
          onChange={(fontSize) => {
            patch({ fontSize }, true);
          }}
          onCommit={commit}
        />
        <ColorField
          label="Fill"
          value={layer.fill}
          onChange={(fill) => {
            patch({ fill }, true);
          }}
          onCommit={commit}
        />
      </div>
      <div className="field field-wide">
        <span>Style</span>
        <div className="button-group">
          <button
            type="button"
            className={bold ? "toggle active" : "toggle"}
            onClick={() => {
              setFontStyle(!bold, italic);
            }}
          >
            <strong>B</strong>
          </button>
          <button
            type="button"
            className={italic ? "toggle active" : "toggle"}
            onClick={() => {
              setFontStyle(bold, !italic);
            }}
          >
            <em>I</em>
          </button>
          <span className="button-group-sep" />
          {(["left", "center", "right"] as const).map((align) => (
            <button
              key={align}
              type="button"
              className={layer.align === align ? "toggle active" : "toggle"}
              title={`Align ${align}`}
              onClick={() => {
                patch({ align });
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                {align === "left" && <path d="M4 6h16M4 12h10M4 18h14" />}
                {align === "center" && <path d="M4 6h16M7 12h10M5 18h14" />}
                {align === "right" && <path d="M4 6h16M10 12h10M6 18h14" />}
              </svg>
            </button>
          ))}
        </div>
      </div>
    </Panel>
  );
}
