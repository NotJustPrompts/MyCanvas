import Konva from "konva";
import { type RefObject, useEffect, useRef } from "react";
import { type TextLayer } from "@mycanva/shared";
import { useEditorStore } from "../store/editorStore";

interface TextEditorOverlayProps {
  layer: TextLayer;
  nodesRef: RefObject<Map<string, Konva.Node>>;
}

/** Measures text exactly like the canvas renderer (Konva.Text line metrics). */
function measureTextWidth(text: string, layer: TextLayer): number {
  const scratch = new Konva.Text({
    text,
    fontFamily: layer.fontFamily,
    fontSize: layer.fontSize,
    fontStyle: layer.fontStyle,
    letterSpacing: layer.letterSpacing,
  });
  const width = scratch.width();
  scratch.destroy();
  return width;
}

/**
 * In-place text editing: an HTML textarea overlaid exactly on the Konva text
 * node. Rendered inside the CSS-scaled `.canvas-natural` wrapper, so plain
 * design coordinates and font sizes line up with the canvas automatically.
 * Commits on blur or Escape; Enter inserts newlines.
 *
 * Auto-width layers (wrapWidth = 0) never wrap in the overlay: the box grows
 * horizontally as you type, re-measured with the same Konva metrics the canvas
 * uses, so entering edit mode never changes the visible line breaks and the
 * commit lands exactly where the preview showed it. Fixed-wrapWidth layers
 * keep wrapping, at the same width the canvas wraps.
 */
export function TextEditorOverlay({ layer, nodesRef }: TextEditorOverlayProps) {
  const updateLayer = useEditorStore((state) => state.updateLayer);
  const setEditingTextLayer = useEditorStore((state) => state.setEditingTextLayer);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const committedRef = useRef(false);

  const node = nodesRef.current?.get(layer.id);
  const curved = (layer.curve ?? 0) !== 0;
  const fixedWidth = !curved && layer.wrapWidth > 0;
  // Curved text edits flat: newlines collapse to spaces, matching the renderer.
  const flatText = curved ? layer.text.replace(/\s*\n\s*/g, " ") : layer.text;
  // Caret room plus DOM/canvas subpixel and trailing letter-spacing
  // differences — without this buffer the textarea wraps a line that still
  // fits on the canvas.
  const widthBuffer = (layer.letterSpacing + 4) * layer.scaleX;
  // Konva.Text width() is TextPath-derived and unreliable for curved text, so
  // measure the flat string instead. For multi-line auto-width text Konva
  // reports the widest line, which is exactly the canvas box width.
  const contentWidth = (text: string) =>
    Math.max(40, measureTextWidth(curved ? text.replace(/\s*\n\s*/g, " ") : text, layer)) * layer.scaleX +
    widthBuffer;
  const initialWidth = fixedWidth ? layer.wrapWidth * layer.scaleX + widthBuffer : contentWidth(flatText);

  // Align the overlay with the node's rendered bounds (matters for curved
  // text, whose visual box is offset from the layer origin).
  const bounds = node?.getClientRect({ skipShadow: true });

  const bold = layer.fontStyle.includes("bold");
  const italic = layer.fontStyle.includes("italic");

  const commit = () => {
    if (committedRef.current) {
      return;
    }
    committedRef.current = true;
    const value = textareaRef.current?.value ?? layer.text;
    setEditingTextLayer(null);
    if (value !== layer.text) {
      // Empty text keeps the layer alive as a single space (undo restores).
      updateLayer(layer.id, { text: value.length > 0 ? value : " " });
    }
  };

  // Focus, caret to end, and auto-size as the user types: horizontal growth
  // for auto-width layers (anchored at the node's left edge, like the Konva
  // node itself), vertical growth for everyone.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) {
      return;
    }
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
    const autosize = () => {
      if (!fixedWidth) {
        el.style.width = `${String(contentWidth(el.value))}px`;
      }
      el.style.height = "0";
      el.style.height = `${String(el.scrollHeight)}px`;
    };
    autosize();
    el.addEventListener("input", autosize);
    return () => {
      el.removeEventListener("input", autosize);
    };
    // Remount-per-layer (keyed in the parent); layer props are stable here.
  }, []);

  return (
    <textarea
      ref={textareaRef}
      className="text-editor-overlay"
      defaultValue={layer.text}
      spellCheck={false}
      wrap={fixedWidth ? "soft" : "off"}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          commit();
        }
        e.stopPropagation();
      }}
      onMouseDown={(e) => {
        e.stopPropagation();
      }}
      style={{
        left: bounds ? bounds.x : layer.x,
        top: bounds ? bounds.y : layer.y,
        width: initialWidth,
        fontFamily: `"${layer.fontFamily}"`,
        fontSize: layer.fontSize * layer.scaleY,
        fontWeight: bold ? 700 : 400,
        fontStyle: italic ? "italic" : "normal",
        color: layer.fill,
        textAlign: layer.align,
        lineHeight: layer.lineHeight,
        letterSpacing: layer.letterSpacing * layer.scaleX,
        opacity: layer.opacity,
        whiteSpace: fixedWidth ? "pre-wrap" : "pre",
        transform: layer.rotation !== 0 ? `rotate(${String(layer.rotation)}deg)` : undefined,
      }}
    />
  );
}
