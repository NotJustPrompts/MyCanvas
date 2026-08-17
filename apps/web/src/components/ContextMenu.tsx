import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useEditorStore } from "../store/editorStore";
import { removeLayerBackground, textBehindSubject } from "../utils/bg-removal";
import { applyPortraitMode, getPortraitInfo } from "../utils/portrait-mode";
import { getLayerNode } from "../utils/canvas-bridge";

type AlignMode = "min" | "center" | "max";

/**
 * Right-click context menu for layers (canvas + layers panel). All actions go
 * through the store; alignment uses the Konva node's rendered bounds so it
 * works for auto-sized text and scaled/rotated layers.
 */
export function ContextMenu() {
  const menu = useEditorStore((state) => state.contextMenu);
  const closeContextMenu = useEditorStore((state) => state.closeContextMenu);
  const design = useEditorStore((state) => state.design);
  const selectedLayerIds = useEditorStore((state) => state.selectedLayerIds);
  const copySelectedLayers = useEditorStore((state) => state.copySelectedLayers);
  const pasteLayers = useEditorStore((state) => state.pasteLayers);
  const duplicateSelectedLayers = useEditorStore((state) => state.duplicateSelectedLayers);
  const removeSelectedLayers = useEditorStore((state) => state.removeSelectedLayers);
  const moveSelectedLayers = useEditorStore((state) => state.moveSelectedLayers);
  const groupSelection = useEditorStore((state) => state.groupSelection);
  const ungroupSelection = useEditorStore((state) => state.ungroupSelection);
  const updateLayer = useEditorStore((state) => state.updateLayer);
  const bgRemovalBusy = useEditorStore((state) => state.bgRemoval !== null);

  const menuRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState({ x: 0, y: 0, flipX: false });

  // Close on Escape or any scroll while open.
  useEffect(() => {
    if (!menu) {
      return;
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeContextMenu();
      }
    };
    const onScroll = () => {
      closeContextMenu();
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("wheel", onScroll, { capture: true });
    window.addEventListener("scroll", onScroll, { capture: true });
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("wheel", onScroll, { capture: true });
      window.removeEventListener("scroll", onScroll, { capture: true });
    };
  }, [menu, closeContextMenu]);

  // Keep the menu inside the viewport once its size is known.
  useLayoutEffect(() => {
    if (!menu) {
      return;
    }
    const el = menuRef.current;
    const rect = el?.getBoundingClientRect();
    const width = rect?.width ?? 200;
    const height = rect?.height ?? 300;
    setPosition({
      x: Math.max(4, Math.min(menu.x, window.innerWidth - width - 8)),
      y: Math.max(4, Math.min(menu.y, window.innerHeight - height - 8)),
      flipX: menu.x + width + 190 > window.innerWidth,
    });
  }, [menu]);

  if (!menu || !design) {
    return null;
  }
  const layer = design.layers.find((entry) => entry.id === menu.layerId);
  if (!layer) {
    return null;
  }

  const run = (action: () => void) => {
    action();
    closeContextMenu();
  };

  const align = (axis: "x" | "y", mode: AlignMode) => {
    const node = getLayerNode(layer.id);
    if (!node) {
      closeContextMenu();
      return;
    }
    const bounds = node.getClientRect({ skipShadow: true });
    if (axis === "x") {
      const target =
        mode === "min"
          ? 0
          : mode === "center"
            ? design.width / 2 - bounds.width / 2
            : design.width - bounds.width;
      updateLayer(layer.id, { x: Math.round(layer.x + (target - bounds.x)) });
    } else {
      const target =
        mode === "min"
          ? 0
          : mode === "center"
            ? design.height / 2 - bounds.height / 2
            : design.height - bounds.height;
      updateLayer(layer.id, { y: Math.round(layer.y + (target - bounds.y)) });
    }
    closeContextMenu();
  };

  return (
    <>
      <div
        className="context-menu-backdrop"
        onMouseDown={closeContextMenu}
        onContextMenu={(e) => {
          e.preventDefault();
          closeContextMenu();
        }}
      />
      <div
        ref={menuRef}
        className="context-menu"
        role="menu"
        style={{ left: position.x, top: position.y }}
      >
        <button type="button" role="menuitem" onClick={() => { run(copySelectedLayers); }}>
          Copy
          <kbd>Cmd+C</kbd>
        </button>
        <button type="button" role="menuitem" onClick={() => { run(pasteLayers); }}>
          Paste
          <kbd>Cmd+V</kbd>
        </button>
        <button type="button" role="menuitem" onClick={() => { run(duplicateSelectedLayers); }}>
          Duplicate
          <kbd>Cmd+D</kbd>
        </button>
        {layer.type === "image" && (
          <button
            type="button"
            role="menuitem"
            disabled={bgRemovalBusy}
            onClick={() => { run(() => { void removeLayerBackground(layer); }); }}
          >
            {bgRemovalBusy ? "Removing background…" : "Remove background"}
          </button>
        )}
        {layer.type === "image" && !layer.cutout && (
          <button
            type="button"
            role="menuitem"
            disabled={bgRemovalBusy}
            onClick={() => { run(() => { void textBehindSubject(layer); }); }}
          >
            Text behind subject
          </button>
        )}
        {layer.type === "image" && (
          <button
            type="button"
            role="menuitem"
            disabled={bgRemovalBusy}
            onClick={() => { run(() => { void applyPortraitMode(layer, getPortraitInfo(layer.asset)?.strength ?? 12); }); }}
          >
            Portrait mode
          </button>
        )}
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            run(() => {
              updateLayer(layer.id, { locked: !layer.locked });
            });
          }}
        >
          {layer.locked ? "Unlock" : "Lock"}
          <kbd>⌘⇧L</kbd>
        </button>
        {!layer.locked && (
          <button type="button" role="menuitem" onClick={() => { run(removeSelectedLayers); }}>
            Delete
          </button>
        )}
        <div className="context-menu-divider" />
        {selectedLayerIds.length > 1 && (
          <button type="button" role="menuitem" onClick={() => { run(groupSelection); }}>
            Group
            <kbd>Cmd+G</kbd>
          </button>
        )}
        {layer.groupId && (
          <button type="button" role="menuitem" onClick={() => { run(ungroupSelection); }}>
            Ungroup
            <kbd>Cmd+Shift+G</kbd>
          </button>
        )}
        {!layer.locked && (
          <div className={position.flipX ? "context-submenu-anchor flip" : "context-submenu-anchor"}>
            <button type="button" role="menuitem" className="context-submenu-trigger">
              Align to page
              <span className="caret">›</span>
            </button>
            <div className="context-submenu" role="menu">
              <button type="button" role="menuitem" onClick={() => { align("x", "min"); }}>Left</button>
              <button type="button" role="menuitem" onClick={() => { align("x", "center"); }}>Center</button>
              <button type="button" role="menuitem" onClick={() => { align("x", "max"); }}>Right</button>
              <div className="context-menu-divider" />
              <button type="button" role="menuitem" onClick={() => { align("y", "min"); }}>Top</button>
              <button type="button" role="menuitem" onClick={() => { align("y", "center"); }}>Middle</button>
              <button type="button" role="menuitem" onClick={() => { align("y", "max"); }}>Bottom</button>
            </div>
          </div>
        )}
        <div className="context-menu-divider" />
        {!layer.locked && (
          <>
            <button type="button" role="menuitem" onClick={() => { run(() => { moveSelectedLayers(1); }); }}>
              Bring forward
            </button>
            <button type="button" role="menuitem" onClick={() => { run(() => { moveSelectedLayers(-1); }); }}>
              Send backward
            </button>
          </>
        )}
      </div>
    </>
  );
}
