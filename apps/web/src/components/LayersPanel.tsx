import { useState } from "react";
import { type Layer } from "@mycanvas/shared";
import { useEditorStore } from "../store/editorStore";

const TYPE_LABELS: Record<Layer["type"], string> = {
  text: "Text",
  image: "Image",
  rect: "Rect",
  line: "Line",
  shape: "Shape",
  frame: "Frame",
};

function EyeIcon({ visible }: { visible: boolean }) {
  return visible
    ? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      )
    : (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
          <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
          <line x1="1" y1="1" x2="23" y2="23" />
        </svg>
      );
}

function LinkIcon() {
  return (
    <svg
      className="group-link"
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-label="Grouped"
    >
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}

function LockIcon({ locked }: { locked: boolean }) {
  return locked
    ? (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <rect x="4" y="11" width="16" height="10" rx="2" />
          <path d="M8 11V7a4 4 0 0 1 8 0v4" />
        </svg>
      )
    : (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <rect x="4" y="11" width="16" height="10" rx="2" />
          <path d="M8 11V7a4 4 0 0 1 7.9-1" />
        </svg>
      );
}

interface GroupBlock {
  kind: "group";
  groupId: string;
  label: string;
  members: Layer[];
}

interface LayerItem {
  kind: "layer";
  layer: Layer;
}

type DisplayItem = GroupBlock | LayerItem;

export function LayersPanel() {
  const design = useEditorStore((state) => state.design);
  const selectedLayerIds = useEditorStore((state) => state.selectedLayerIds);
  const selectLayer = useEditorStore((state) => state.selectLayer);
  const toggleSelectLayer = useEditorStore((state) => state.toggleSelectLayer);
  const setSelectedLayers = useEditorStore((state) => state.setSelectedLayers);
  const removeSelectedLayers = useEditorStore((state) => state.removeSelectedLayers);
  const ungroupSelection = useEditorStore((state) => state.ungroupSelection);
  const updateLayer = useEditorStore((state) => state.updateLayer);
  const removeLayer = useEditorStore((state) => state.removeLayer);
  const duplicateLayer = useEditorStore((state) => state.duplicateLayer);
  const moveLayer = useEditorStore((state) => state.moveLayer);
  const openContextMenu = useEditorStore((state) => state.openContextMenu);

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [collapsedGroups, setCollapsedGroups] = useState<ReadonlySet<string>>(new Set());

  if (!design) {
    return null;
  }

  // Top of the list = top-most layer (reverse of z-order). Group members form
  // contiguous runs; number groups in bottom-to-top z-order for stable labels.
  const groupNumbers = new Map<string, number>();
  for (const layer of design.layers) {
    if (layer.groupId && !groupNumbers.has(layer.groupId)) {
      groupNumbers.set(layer.groupId, groupNumbers.size + 1);
    }
  }

  const items: DisplayItem[] = [];
  const reversed = [...design.layers].reverse();
  for (let index = 0; index < reversed.length; index += 1) {
    const layer = reversed[index];
    if (!layer) {
      continue;
    }
    if (layer.groupId) {
      const groupId = layer.groupId;
      const previous = reversed[index - 1];
      if (previous?.groupId === groupId) {
        continue; // already emitted as part of the group block
      }
      const members: Layer[] = [];
      let cursor = index;
      while (reversed[cursor]?.groupId === groupId) {
        const member = reversed[cursor];
        if (member) {
          members.push(member);
        }
        cursor += 1;
      }
      items.push({
        kind: "group",
        groupId,
        label: `Group ${String(groupNumbers.get(groupId) ?? 0)}`,
        members,
      });
    } else {
      items.push({ kind: "layer", layer });
    }
  }

  const commitRename = (id: string) => {
    const trimmed = draftName.trim();
    if (trimmed) {
      updateLayer(id, { name: trimmed });
    }
    setRenamingId(null);
  };

  const toggleCollapsed = (groupId: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  };

  const renderLayerRow = (layer: Layer, indented: boolean) => (
    <li
      key={layer.id}
      className={[
        "layer-row",
        indented ? "indented" : "",
        selectedLayerIds.includes(layer.id) ? "selected" : "",
      ].filter(Boolean).join(" ")}
      onClick={(e) => {
        if (e.shiftKey) {
          toggleSelectLayer(layer.id);
        } else {
          selectLayer(layer.id);
        }
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        selectLayer(layer.id);
        openContextMenu({ x: e.clientX, y: e.clientY, layerId: layer.id });
      }}
    >
      <button
        type="button"
        className="icon-button"
        title={layer.visible ? "Hide layer" : "Show layer"}
        onClick={(e) => {
          e.stopPropagation();
          updateLayer(layer.id, { visible: !layer.visible });
        }}
      >
        <EyeIcon visible={layer.visible} />
      </button>
      <button
        type="button"
        className={layer.locked ? "icon-button lock-toggle active" : "icon-button lock-toggle"}
        title={layer.locked ? "Unlock layer" : "Lock layer"}
        onClick={(e) => {
          e.stopPropagation();
          updateLayer(layer.id, { locked: !layer.locked });
        }}
      >
        <LockIcon locked={layer.locked ?? false} />
      </button>
      <span className="layer-type">{TYPE_LABELS[layer.type]}</span>
      {layer.groupId && <LinkIcon />}
      {renamingId === layer.id
        ? (
            <input
              className="layer-rename"
              value={draftName}
              autoFocus
              onChange={(e) => {
                setDraftName(e.target.value);
              }}
              onBlur={() => {
                commitRename(layer.id);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  commitRename(layer.id);
                } else if (e.key === "Escape") {
                  setRenamingId(null);
                }
              }}
              onClick={(e) => {
                e.stopPropagation();
              }}
            />
          )
        : (
            <span
              className="layer-name"
              title="Double-click to rename"
              onDoubleClick={(e) => {
                e.stopPropagation();
                setDraftName(layer.name);
                setRenamingId(layer.id);
              }}
            >
              {layer.name}
            </span>
          )}
      <span className="layer-actions">
        <button
          type="button"
          className="icon-button"
          title="Move up"
          onClick={(e) => {
            e.stopPropagation();
            moveLayer(layer.id, 1);
          }}
        >
          ↑
        </button>
        <button
          type="button"
          className="icon-button"
          title="Move down"
          onClick={(e) => {
            e.stopPropagation();
            moveLayer(layer.id, -1);
          }}
        >
          ↓
        </button>
        <button
          type="button"
          className="icon-button"
          title="Duplicate layer"
          onClick={(e) => {
            e.stopPropagation();
            duplicateLayer(layer.id);
          }}
        >
          ⧉
        </button>
        {!layer.locked && (
          <button
            type="button"
            className="icon-button danger"
            title="Delete layer"
            onClick={(e) => {
              e.stopPropagation();
              removeLayer(layer.id);
            }}
          >
            ×
          </button>
        )}
      </span>
    </li>
  );

  return (
    <div className="panel-section layers-panel">
      <h3>Layers</h3>
      {items.length === 0 && <p className="muted">No layers yet.</p>}
      {items.length > 0 && <p className="muted kbd-hint">Cmd+C copy · Cmd+V paste · Cmd+G group</p>}
      <ul className="layers-list">
        {items.map((item) => {
          if (item.kind === "layer") {
            return renderLayerRow(item.layer, false);
          }
          const memberIds = item.members.map((member) => member.id);
          const allSelected = memberIds.every((id) => selectedLayerIds.includes(id));
          const collapsed = collapsedGroups.has(item.groupId);
          return (
            <li key={item.groupId} className="layer-group">
              <div
                className={allSelected ? "layer-row group-header selected" : "layer-row group-header"}
                onClick={() => {
                  setSelectedLayers(memberIds);
                }}
              >
                <button
                  type="button"
                  className="icon-button chevron"
                  title={collapsed ? "Expand group" : "Collapse group"}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleCollapsed(item.groupId);
                  }}
                >
                  {collapsed ? "▸" : "▾"}
                </button>
                <span className="layer-type">Grp</span>
                <LinkIcon />
                <span className="layer-name">{item.label}</span>
                <span className="layer-actions">
                  <button
                    type="button"
                    className="icon-button"
                    title="Ungroup"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedLayers(memberIds);
                      ungroupSelection();
                    }}
                  >
                    ⛓
                  </button>
                  <button
                    type="button"
                    className="icon-button danger"
                    title="Delete group"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedLayers(memberIds);
                      removeSelectedLayers();
                    }}
                  >
                    ×
                  </button>
                </span>
              </div>
              {!collapsed && (
                <ul className="layer-group-members">{item.members.map((member) => renderLayerRow(member, true))}</ul>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
