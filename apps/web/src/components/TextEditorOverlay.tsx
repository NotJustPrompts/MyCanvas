import Konva from "konva";
import { type RefObject, useEffect, useRef } from "react";
import { type TextLayer } from "@mycanva/shared";
import { useEditorStore } from "../store/editorStore";

interface TextEditorOverlayProps {
  layer: TextLayer;
  nodesRef: RefObject<Map<string, Konva.Node>>;
}

/**
 * In-place text editing: an HTML textarea overlaid exactly on the Konva text
 * node. Rendered inside the CSS-scaled `.canvas-natural` wrapper, so plain
 * design coordinates and font sizes line up with the canvas automatically.
 * Commits on blur or Escape; Enter inserts newlines.
 */
export function TextEditorOverlay({ layer, nodesRef }: TextEditorOverlayProps) {
  const updateLayer = useEditorStore((state) => state.updateLayer);
  const setEditingTextLayer = useEditorStore((state) => state.setEditingTextLayer);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const committedRef = useRef(false);

  const node = nodesRef.current?.get(layer.id);
  // TextPath.width() is path-derived and unreliable; measure the flat text
  // instead so the overlay wraps exactly like the on-canvas render.
  const flatWidth =
    layer.wrapWidth > 0
      ? layer.wrapWidth
      : Math.max(
          40,
          new Konva.Text({
            text: layer.text.replace(/\s*\n\s*/g, " "),
            fontFamily: layer.fontFamily,
            fontSize: layer.fontSize,
            fontStyle: layer.fontStyle,
            letterSpacing: layer.letterSpacing,
          }).width(),
        );
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

  // Focus, caret to end, and auto-height as the user types.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) {
      return;
    }
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
    const autosize = () => {
      el.style.height = "0";
      el.style.height = `${String(el.scrollHeight)}px`;
    };
    autosize();
    el.addEventListener("input", autosize);
    return () => {
      el.removeEventListener("input", autosize);
    };
  }, []);

  return (
    <textarea
      ref={textareaRef}
      className="text-editor-overlay"
      defaultValue={layer.text}
      spellCheck={false}
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
        width: flatWidth * layer.scaleX,
        fontFamily: `"${layer.fontFamily}"`,
        fontSize: layer.fontSize * layer.scaleY,
        fontWeight: bold ? 700 : 400,
        fontStyle: italic ? "italic" : "normal",
        color: layer.fill,
        textAlign: layer.align,
        lineHeight: layer.lineHeight,
        letterSpacing: layer.letterSpacing * layer.scaleX,
        opacity: layer.opacity,
        transform: layer.rotation !== 0 ? `rotate(${String(layer.rotation)}deg)` : undefined,
      }}
    />
  );
}
