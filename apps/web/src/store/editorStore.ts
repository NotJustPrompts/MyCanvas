import {
  type Design,
  type FrameLayer,
  type ImageLayer,
  type Layer,
  type LineLayer,
  type RectLayer,
  type TextLayer,
  defaultShadow,
} from "@mycanvas/shared";
import { create } from "zustand";
import { ApiError, api } from "../api";
import { makeDesignThumbnail } from "../utils/canvas-bridge";
import { ensureFontsLoaded } from "../utils/fonts";

export type SaveStatus = "saved" | "saving" | "dirty";
export type LoadStatus = "loading" | "ready" | "not-found" | "error";

interface Snapshot {
  layers: Layer[];
  background: string;
}

/** Any subset of layer-specific fields; only the keys matching the layer type are applied in practice. */
export type LayerPatch = Partial<TextLayer>
  & Partial<ImageLayer>
  & Partial<RectLayer>
  & Partial<LineLayer>
  & Partial<FrameLayer>;

const HISTORY_LIMIT = 100;
const AUTOSAVE_DELAY_MS = 800;

export interface EditorStore {
  design: Design | null;
  loadStatus: LoadStatus;
  saveStatus: SaveStatus;
  /** Selection set in click order; the last entry is the "primary" layer. */
  selectedLayerIds: string[];
  /** Group currently entered for isolated member editing (double-click). */
  editingGroupId: string | null;
  past: Snapshot[];
  future: Snapshot[];
  pendingSnapshot: Snapshot | null;

  loadDesign: (id: string) => Promise<void>;
  unload: () => void;
  /** Replace the selection (group-aware: a member selects its whole group). */
  selectLayer: (id: string | null) => void;
  /** Shift-click toggle (group-aware). */
  toggleSelectLayer: (id: string) => void;
  setSelectedLayers: (ids: string[]) => void;
  setEditingGroup: (id: string | null) => void;
  setName: (name: string) => void;
  setBackground: (background: string, transient?: boolean) => void;
  addLayer: (layer: Layer) => void;
  /** Insert a layer at a z-index, select it, one history entry. */
  addLayerAt: (layer: Layer, index: number) => void;
  addImageLayer: (asset: string, naturalWidth: number, naturalHeight: number) => void;
  addImageLayerAt: (
    asset: string,
    naturalWidth: number,
    naturalHeight: number,
    centerX: number,
    centerY: number,
  ) => void;
  /** Cover-fit image layer inserted at the BOTTOM of the stack (drop-at-edge). */
  addImageLayerAsBackground: (asset: string, naturalWidth: number, naturalHeight: number) => void;
  /** Incremented whenever an asset is uploaded so the Uploads panel refetches. */
  assetsVersion: number;
  bumpAssetsVersion: () => void;
  /** Text layer currently being edited in place (textarea overlay). */
  editingTextLayerId: string | null;
  setEditingTextLayer: (id: string | null) => void;
  /** Frame layer whose content is being panned/zoomed (double-click mode). */
  editingFrameId: string | null;
  setEditingFrame: (id: string | null) => void;
  /** Open right-click menu (client coords + target layer). */
  contextMenu: { x: number; y: number; layerId: string } | null;
  openContextMenu: (menu: { x: number; y: number; layerId: string }) => void;
  closeContextMenu: () => void;
  /** Active worker job: download progress (0–1) or null = inference/composite. */
  bgRemoval: { layerId: string; progress: number | null; kind: "cutout" | "portrait" } | null;
  setBgRemoval: (value: { layerId: string; progress: number | null; kind: "cutout" | "portrait" } | null) => void;
  /** Minimal transient toast message. */
  toast: string | null;
  showToast: (message: string) => void;
  /** Extracted photo palettes, keyed by asset+crop (see utils/photo-colors). */
  photoPalettes: Record<string, string[]>;
  setPhotoPalette: (key: string, colors: string[]) => void;
  updateLayer: (id: string, patch: LayerPatch, transient?: boolean) => void;
  /** Multi-layer patch, one history entry (group drag/transform write-back). */
  updateLayers: (entries: { id: string; patch: LayerPatch }[]) => void;
  /** Lock the selection — or unlock it when every selected layer is locked. */
  toggleLockSelected: () => void;
  commitTransient: () => void;
  removeLayer: (id: string) => void;
  removeSelectedLayers: () => void;
  duplicateLayer: (id: string) => void;
  duplicateSelectedLayers: () => void;
  copyLayer: (id: string) => void;
  copySelectedLayers: () => void;
  pasteLayers: () => void;
  moveLayer: (id: string, direction: 1 | -1) => void;
  moveSelectedLayers: (direction: 1 | -1) => void;
  groupSelection: () => void;
  ungroupSelection: () => void;
  undo: () => void;
  redo: () => void;
  saveNow: () => Promise<void>;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let toastTimer: ReturnType<typeof setTimeout> | null = null;

/** In-app layer clipboard (z-order preserved; shared across designs). */
let layerClipboard: Layer[] = [];

export function newLayerId(): string {
  return crypto.randomUUID();
}

/** The primary layer of a selection set (last clicked), or null. */
export function primarySelectedId(state: { selectedLayerIds: string[] }): string | null {
  return state.selectedLayerIds[state.selectedLayerIds.length - 1] ?? null;
}

/**
 * Lock guard: a locked layer only accepts patches that change `locked` itself
 * (i.e. unlock). Everything else — geometry, style, name — is a no-op so no
 * UI path can bypass the freeze.
 */
function patchAllowedOnLocked(patch: LayerPatch): boolean {
  return Object.keys(patch).every((key) => key === "locked");
}

/** Sequential names: next free image_N across the design, case-insensitive. */
function nextImageName(layers: Layer[]): string {
  let maxIndex = 0;
  for (const existing of layers) {
    const match = /^image_(\d+)$/i.exec(existing.name);
    if (match?.[1]) {
      maxIndex = Math.max(maxIndex, Number(match[1]));
    }
  }
  return `image_${String(maxIndex + 1)}`;
}

export const useEditorStore = create<EditorStore>()((set, get) => {
  const snapshotOf = (design: Design): Snapshot => ({
    layers: structuredClone(design.layers),
    background: design.background,
  });

  const markDirty = () => {
    if (get().saveStatus !== "dirty") {
      set({ saveStatus: "dirty" });
    }
    if (saveTimer) {
      clearTimeout(saveTimer);
    }
    saveTimer = setTimeout(() => {
      void get().saveNow();
    }, AUTOSAVE_DELAY_MS);
  };

  const pushHistory = () => {
    const design = get().design;
    if (!design) {
      return;
    }
    set((state) => ({
      past: [...state.past.slice(-(HISTORY_LIMIT - 1)), snapshotOf(design)],
      future: [],
    }));
  };

  /**
   * Applies a mutation to layers and/or background. Discrete mutations push a
   * history entry immediately; transient ones (slider/color drags) capture a
   * pending snapshot on the first change, pushed by commitTransient().
   */
  const mutate = (fn: (design: Design) => Pick<Snapshot, "layers"> | Snapshot, transient: boolean) => {
    const design = get().design;
    if (!design) {
      return;
    }
    const result = fn(design);
    if (result.layers === design.layers && !("background" in result)) {
      return;
    }
    if (transient) {
      if (!get().pendingSnapshot) {
        set({ pendingSnapshot: snapshotOf(design) });
      }
    } else {
      pushHistory();
    }
    set({ design: { ...design, ...result } });
    markDirty();
  };

  return {
    design: null,
    loadStatus: "loading",
    saveStatus: "saved",
    selectedLayerIds: [],
    editingGroupId: null,
    past: [],
    future: [],
    pendingSnapshot: null,

    loadDesign: async (id) => {
      if (saveTimer) {
        clearTimeout(saveTimer);
        saveTimer = null;
      }
      set({
        design: null,
        loadStatus: "loading",
        saveStatus: "saved",
        selectedLayerIds: [],
        editingGroupId: null,
        past: [],
        future: [],
        pendingSnapshot: null,
        editingTextLayerId: null,
        editingFrameId: null,
        contextMenu: null,
      });
      try {
        const design = await api.getDesign(id);
        // Migrate legacy per-field shadow/stroke toggles on text layers to the
        // mutually-exclusive effect model (one effect or none).
        design.layers = design.layers.map((layer) => {
          if (layer.type !== "text" || layer.effect) {
            return layer;
          }
          if (layer.shadow.enabled) {
            const distance = Math.round(Math.hypot(layer.shadow.offsetX, layer.shadow.offsetY));
            const angle = Math.round((Math.atan2(layer.shadow.offsetY, layer.shadow.offsetX) * 180) / Math.PI);
            return {
              ...layer,
              effect: {
                type: "shadow",
                color: layer.shadow.color,
                distance,
                angle,
                blur: layer.shadow.blur,
                opacity: layer.shadow.opacity,
              },
            };
          }
          if (layer.stroke.enabled) {
            return { ...layer, effect: { type: "outline", color: layer.stroke.color, thickness: layer.stroke.width } };
          }
          return { ...layer, effect: { type: "none" } };
        });
        set({ design, loadStatus: "ready" });
        const families = design.layers
          .filter((layer): layer is TextLayer => layer.type === "text")
          .map((layer) => layer.fontFamily);
        void ensureFontsLoaded(families);
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) {
          set({ loadStatus: "not-found" });
        } else {
          set({ loadStatus: "error" });
        }
      }
    },

    unload: () => {
      if (saveTimer) {
        clearTimeout(saveTimer);
        saveTimer = null;
      }
      set({
        design: null,
        loadStatus: "loading",
        saveStatus: "saved",
        selectedLayerIds: [],
        editingGroupId: null,
        past: [],
        future: [],
        pendingSnapshot: null,
        editingTextLayerId: null,
        editingFrameId: null,
      });
    },

    selectLayer: (id) => {
      if (!id) {
        set({ selectedLayerIds: [], editingGroupId: null });
        return;
      }
      const design = get().design;
      const layer = design?.layers.find((entry) => entry.id === id);
      if (design && layer?.groupId) {
        if (layer.groupId === get().editingGroupId) {
          // Inside an entered group: select just the member.
          set({ selectedLayerIds: [id] });
          return;
        }
        // A member of a (non-entered) group selects the whole group.
        set({
          editingGroupId: null,
          selectedLayerIds: design.layers.filter((entry) => entry.groupId === layer.groupId).map((entry) => entry.id),
        });
        return;
      }
      set({ editingGroupId: null, selectedLayerIds: [id] });
    },

    toggleSelectLayer: (id) => {
      const design = get().design;
      const layer = design?.layers.find((entry) => entry.id === id);
      if (!design || !layer) {
        return;
      }
      const memberIds =
        layer.groupId && layer.groupId !== get().editingGroupId
          ? design.layers.filter((entry) => entry.groupId === layer.groupId).map((entry) => entry.id)
          : [id];
      const current = get().selectedLayerIds;
      const allSelected = memberIds.every((memberId) => current.includes(memberId));
      if (allSelected) {
        set({ selectedLayerIds: current.filter((memberId) => !memberIds.includes(memberId)) });
      } else {
        set({ selectedLayerIds: [...current.filter((memberId) => !memberIds.includes(memberId)), ...memberIds] });
      }
    },

    setSelectedLayers: (ids) => {
      set({ selectedLayerIds: ids });
    },

    setEditingGroup: (id) => {
      set({ editingGroupId: id });
    },

    setName: (name) => {
      const design = get().design;
      if (!design) {
        return;
      }
      set({ design: { ...design, name } });
      markDirty();
    },

    setBackground: (background, transient = false) => {
      mutate((design) => ({ layers: design.layers, background }), transient);
    },

    addLayer: (layer) => {
      mutate((design) => ({ layers: [...design.layers, layer] }), false);
      set({ selectedLayerIds: [layer.id] });
    },

    addLayerAt: (layer, index) => {
      mutate((design) => {
        const layers = [...design.layers];
        layers.splice(Math.max(0, Math.min(index, layers.length)), 0, layer);
        return { layers };
      }, false);
      set({ selectedLayerIds: [layer.id] });
    },

    addImageLayer: (asset, naturalWidth, naturalHeight) => {
      const design = get().design;
      if (!design) {
        return;
      }
      get().addImageLayerAt(asset, naturalWidth, naturalHeight, design.width / 2, design.height / 2);
    },

    addImageLayerAt: (asset, naturalWidth, naturalHeight, centerX, centerY) => {
      const design = get().design;
      if (!design) {
        return;
      }
      const fit = Math.min(1, design.width / naturalWidth, design.height / naturalHeight);
      const width = Math.max(1, Math.round(naturalWidth * fit));
      const height = Math.max(1, Math.round(naturalHeight * fit));
      const layer: ImageLayer = {
        id: newLayerId(),
        type: "image",
        name: nextImageName(design.layers),
        x: Math.round(centerX - width / 2),
        y: Math.round(centerY - height / 2),
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
        opacity: 1,
        visible: true,
        asset,
        width,
        height,
        shadow: defaultShadow(),
      };
      get().addLayer(layer);
    },

    addImageLayerAsBackground: (asset, naturalWidth, naturalHeight) => {
      const design = get().design;
      if (!design) {
        return;
      }
      // Cover-fit the whole canvas (like a CSS cover background), centered,
      // inserted at the bottom of the stack.
      const cover = Math.max(design.width / naturalWidth, design.height / naturalHeight);
      const width = Math.max(1, Math.round(naturalWidth * cover));
      const height = Math.max(1, Math.round(naturalHeight * cover));
      const layer: ImageLayer = {
        id: newLayerId(),
        type: "image",
        name: nextImageName(design.layers),
        x: Math.round((design.width - width) / 2),
        y: Math.round((design.height - height) / 2),
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
        opacity: 1,
        visible: true,
        asset,
        width,
        height,
        shadow: defaultShadow(),
      };
      get().addLayerAt(layer, 0);
    },

    assetsVersion: 0,

    bumpAssetsVersion: () => {
      set((state) => ({ assetsVersion: state.assetsVersion + 1 }));
    },

    editingTextLayerId: null,

    setEditingTextLayer: (id) => {
      set({ editingTextLayerId: id });
    },

    editingFrameId: null,

    setEditingFrame: (id) => {
      set({ editingFrameId: id });
    },

    contextMenu: null,

    openContextMenu: (menu) => {
      set({ contextMenu: menu });
    },

    closeContextMenu: () => {
      set({ contextMenu: null });
    },

    bgRemoval: null,

    setBgRemoval: (value) => {
      set({ bgRemoval: value });
    },

    toast: null,

    showToast: (message) => {
      if (toastTimer) {
        clearTimeout(toastTimer);
      }
      set({ toast: message });
      toastTimer = setTimeout(() => {
        set({ toast: null });
      }, 4000);
    },

    photoPalettes: {},

    setPhotoPalette: (key, colors) => {
      set((state) => ({ photoPalettes: { ...state.photoPalettes, [key]: colors } }));
    },

    updateLayer: (id, patch, transient = false) => {
      const target = get().design?.layers.find((layer) => layer.id === id);
      if (target?.locked && !patchAllowedOnLocked(patch)) {
        return;
      }
      mutate(
        (design) => ({
          // The patch only carries fields valid for the target's type; the
          // spread widens to the intersection, so narrow it back explicitly.
          layers: design.layers.map((layer) => (layer.id === id ? ({ ...layer, ...patch }) as Layer : layer)),
        }),
        transient,
      );
    },

    updateLayers: (entries) => {
      const design = get().design;
      if (!design) {
        return;
      }
      const allowed = entries.filter((entry) => {
        const layer = design.layers.find((candidate) => candidate.id === entry.id);
        return !layer?.locked || patchAllowedOnLocked(entry.patch);
      });
      if (allowed.length === 0) {
        return;
      }
      const patches = new Map(allowed.map((entry) => [entry.id, entry.patch]));
      mutate(
        (current) => ({
          layers: current.layers.map((layer) => {
            const patch = patches.get(layer.id);
            return patch ? ({ ...layer, ...patch }) as Layer : layer;
          }),
        }),
        false,
      );
    },

    toggleLockSelected: () => {
      const design = get().design;
      const ids = get().selectedLayerIds;
      if (!design || ids.length === 0) {
        return;
      }
      const selected = design.layers.filter((layer) => ids.includes(layer.id));
      if (selected.length === 0) {
        return;
      }
      const unlock = selected.every((layer) => layer.locked);
      get().updateLayers(selected.map((layer) => ({ id: layer.id, patch: { locked: !unlock } })));
    },

    commitTransient: () => {
      const pending = get().pendingSnapshot;
      if (!pending) {
        return;
      }
      set((state) => ({
        pendingSnapshot: null,
        past: [...state.past.slice(-(HISTORY_LIMIT - 1)), pending],
        future: [],
      }));
    },

    removeLayer: (id) => {
      const target = get().design?.layers.find((layer) => layer.id === id);
      if (target?.locked) {
        return;
      }
      mutate((design) => ({ layers: design.layers.filter((layer) => layer.id !== id) }), false);
      set((state) => ({ selectedLayerIds: state.selectedLayerIds.filter((entry) => entry !== id) }));
    },

    removeSelectedLayers: () => {
      const ids = get().selectedLayerIds;
      if (ids.length === 0) {
        return;
      }
      const design = get().design;
      // Locked layers survive Delete; unlocked ones are removed normally.
      const removable = new Set(
        design?.layers.filter((layer) => ids.includes(layer.id) && !layer.locked).map((layer) => layer.id),
      );
      if (removable.size === 0) {
        return;
      }
      mutate((current) => ({ layers: current.layers.filter((layer) => !removable.has(layer.id)) }), false);
      set((state) => ({ selectedLayerIds: state.selectedLayerIds.filter((entry) => !removable.has(entry)) }));
    },

    duplicateLayer: (id) => {
      set({ selectedLayerIds: [id] });
      get().duplicateSelectedLayers();
    },

    duplicateSelectedLayers: () => {
      const design = get().design;
      const ids = get().selectedLayerIds;
      if (!design || ids.length === 0) {
        return;
      }
      const selected = design.layers.filter((layer) => ids.includes(layer.id));
      const groupMap = new Map<string, string>();
      const clones = selected.map((layer) => {
        const clone: Layer = {
          ...structuredClone(layer),
          id: newLayerId(),
          name: `${layer.name} copy`,
          x: layer.x + 12,
          y: layer.y + 12,
        };
        if (clone.groupId) {
          let mapped = groupMap.get(clone.groupId);
          if (!mapped) {
            mapped = newLayerId();
            groupMap.set(clone.groupId, mapped);
          }
          clone.groupId = mapped;
        }
        return clone;
      });
      mutate((current) => ({ layers: [...current.layers, ...clones] }), false);
      set({ selectedLayerIds: clones.map((clone) => clone.id) });
    },

    copyLayer: (id) => {
      set({ selectedLayerIds: [id] });
      get().copySelectedLayers();
    },

    copySelectedLayers: () => {
      const design = get().design;
      const ids = get().selectedLayerIds;
      if (!design || ids.length === 0) {
        return;
      }
      layerClipboard = structuredClone(design.layers.filter((layer) => ids.includes(layer.id)));
    },

    pasteLayers: () => {
      const design = get().design;
      if (!design || layerClipboard.length === 0) {
        return;
      }
      const groupMap = new Map<string, string>();
      const clones = layerClipboard.map((layer) => {
        const clone: Layer = {
          ...structuredClone(layer),
          id: newLayerId(),
          name: `${layer.name} copy`,
          x: layer.x + 16,
          y: layer.y + 16,
        };
        if (clone.groupId) {
          let mapped = groupMap.get(clone.groupId);
          if (!mapped) {
            mapped = newLayerId();
            groupMap.set(clone.groupId, mapped);
          }
          clone.groupId = mapped;
        }
        return clone;
      });
      mutate((current) => ({ layers: [...current.layers, ...clones] }), false);
      set({ selectedLayerIds: clones.map((clone) => clone.id) });
    },

    moveLayer: (id, direction) => {
      set({ selectedLayerIds: [id] });
      get().moveSelectedLayers(direction);
    },

    moveSelectedLayers: (direction) => {
      const design = get().design;
      // Z-order freeze: locked layers never move; unlocked layers pass
      // behind/in front of them normally.
      const ids = new Set(
        design?.layers
          .filter((layer) => get().selectedLayerIds.includes(layer.id) && !layer.locked)
          .map((layer) => layer.id),
      );
      if (ids.size === 0) {
        return;
      }
      mutate((design) => {
        const layers = [...design.layers];
        if (direction === 1) {
          for (let i = layers.length - 2; i >= 0; i -= 1) {
            const current = layers[i];
            const above = layers[i + 1];
            if (current && above && ids.has(current.id) && !ids.has(above.id)) {
              layers[i] = above;
              layers[i + 1] = current;
            }
          }
        } else {
          for (let i = 1; i < layers.length; i += 1) {
            const current = layers[i];
            const below = layers[i - 1];
            if (current && below && ids.has(current.id) && !ids.has(below.id)) {
              layers[i] = below;
              layers[i - 1] = current;
            }
          }
        }
        return { layers };
      }, false);
    },

    groupSelection: () => {
      const design = get().design;
      const ids = get().selectedLayerIds;
      if (!design || ids.length < 2) {
        return;
      }
      const groupId = newLayerId();
      mutate((current) => {
        const memberIndices = current.layers
          .map((layer, index) => (ids.includes(layer.id) ? index : -1))
          .filter((index) => index >= 0);
        if (memberIndices.length < 2) {
          return { layers: current.layers };
        }
        const members = memberIndices
          .map((index) => current.layers[index])
          .filter((layer): layer is Layer => Boolean(layer))
          .map((layer) => ({ ...layer, groupId }));
        const nonMembers = current.layers.filter((layer) => !ids.includes(layer.id));
        const topIndex = memberIndices[memberIndices.length - 1] ?? 0;
        const insertAt = Math.max(0, topIndex - (memberIndices.length - 1));
        return {
          layers: [...nonMembers.slice(0, insertAt), ...members, ...nonMembers.slice(insertAt)],
        };
      }, false);
    },

    ungroupSelection: () => {
      const design = get().design;
      const ids = get().selectedLayerIds;
      if (!design || ids.length === 0) {
        return;
      }
      const groupIds = new Set(
        design.layers.filter((layer) => ids.includes(layer.id) && layer.groupId).map((layer) => layer.groupId),
      );
      if (groupIds.size === 0) {
        return;
      }
      mutate(
        (current) => ({
          layers: current.layers.map((layer) =>
            layer.groupId && groupIds.has(layer.groupId) ? { ...layer, groupId: undefined } : layer),
        }),
        false,
      );
      set({ editingGroupId: null });
    },

    undo: () => {
      get().commitTransient();
      const state = get();
      const design = state.design;
      const previous = state.past[state.past.length - 1];
      if (!design || !previous) {
        return;
      }
      set({
        past: state.past.slice(0, -1),
        future: [...state.future, snapshotOf(design)],
        design: { ...design, layers: previous.layers, background: previous.background },
      });
      markDirty();
    },

    redo: () => {
      const state = get();
      const design = state.design;
      const next = state.future[state.future.length - 1];
      if (!design || !next) {
        return;
      }
      set({
        future: state.future.slice(0, -1),
        past: [...state.past, snapshotOf(design)],
        design: { ...design, layers: next.layers, background: next.background },
      });
      markDirty();
    },

    saveNow: async () => {
      if (saveTimer) {
        clearTimeout(saveTimer);
        saveTimer = null;
      }
      const design = get().design;
      if (!design || get().saveStatus === "saved") {
        return;
      }
      set({ saveStatus: "saving" });
      try {
        const thumbnail = makeDesignThumbnail();
        const payload: Design = thumbnail ? { ...design, thumbnail } : design;
        const saved = await api.updateDesign(design.id, payload);
        const current = get().design;
        set({
          saveStatus: "saved",
          ...(current ? { design: { ...current, updatedAt: saved.updatedAt } } : {}),
        });
      } catch {
        set({ saveStatus: "dirty" });
      }
    },
  };
});
