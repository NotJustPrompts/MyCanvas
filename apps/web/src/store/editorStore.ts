import {
  type Design,
  type ImageLayer,
  type Layer,
  type LineLayer,
  type RectLayer,
  type TextLayer,
  defaultShadow,
} from "@mycanva/shared";
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
  & Partial<LineLayer>;

const HISTORY_LIMIT = 100;
const AUTOSAVE_DELAY_MS = 800;

export interface EditorStore {
  design: Design | null;
  loadStatus: LoadStatus;
  saveStatus: SaveStatus;
  selectedLayerId: string | null;
  past: Snapshot[];
  future: Snapshot[];
  pendingSnapshot: Snapshot | null;

  loadDesign: (id: string) => Promise<void>;
  unload: () => void;
  selectLayer: (id: string | null) => void;
  setName: (name: string) => void;
  setBackground: (background: string, transient?: boolean) => void;
  addLayer: (layer: Layer) => void;
  addImageLayer: (asset: string, naturalWidth: number, naturalHeight: number) => void;
  updateLayer: (id: string, patch: LayerPatch, transient?: boolean) => void;
  commitTransient: () => void;
  removeLayer: (id: string) => void;
  duplicateLayer: (id: string) => void;
  copyLayer: (id: string) => void;
  pasteLayer: () => void;
  moveLayer: (id: string, direction: 1 | -1) => void;
  undo: () => void;
  redo: () => void;
  saveNow: () => Promise<void>;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;

/** In-app layer clipboard (shared across designs within the session). */
let layerClipboard: Layer | null = null;

export function newLayerId(): string {
  return crypto.randomUUID();
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
    selectedLayerId: null,
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
        selectedLayerId: null,
        past: [],
        future: [],
        pendingSnapshot: null,
      });
      try {
        const design = await api.getDesign(id);
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
        selectedLayerId: null,
        past: [],
        future: [],
        pendingSnapshot: null,
      });
    },

    selectLayer: (id) => {
      set({ selectedLayerId: id });
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
      set({ selectedLayerId: layer.id });
    },

    addImageLayer: (asset, naturalWidth, naturalHeight) => {
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
        name: asset,
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
      get().addLayer(layer);
    },

    updateLayer: (id, patch, transient = false) => {
      mutate(
        (design) => ({
          layers: design.layers.map((layer) => (layer.id === id ? ({ ...layer, ...patch }) : layer)),
        }),
        transient,
      );
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
      mutate((design) => ({ layers: design.layers.filter((layer) => layer.id !== id) }), false);
      if (get().selectedLayerId === id) {
        set({ selectedLayerId: null });
      }
    },

    duplicateLayer: (id) => {
      const design = get().design;
      if (!design) {
        return;
      }
      const index = design.layers.findIndex((layer) => layer.id === id);
      const source = design.layers[index];
      if (!source) {
        return;
      }
      const copy: Layer = {
        ...structuredClone(source),
        id: newLayerId(),
        name: `${source.name} copy`,
        x: source.x + 12,
        y: source.y + 12,
      };
      const layers = [...design.layers];
      layers.splice(index + 1, 0, copy);
      mutate(() => ({ layers }), false);
      set({ selectedLayerId: copy.id });
    },

    copyLayer: (id) => {
      const design = get().design;
      const source = design?.layers.find((layer) => layer.id === id);
      if (!source) {
        return;
      }
      layerClipboard = structuredClone(source);
    },

    pasteLayer: () => {
      const design = get().design;
      if (!design || !layerClipboard) {
        return;
      }
      const copy: Layer = {
        ...structuredClone(layerClipboard),
        id: newLayerId(),
        name: `${layerClipboard.name} copy`,
        x: layerClipboard.x + 16,
        y: layerClipboard.y + 16,
      };
      mutate((current) => ({ layers: [...current.layers, copy] }), false);
      set({ selectedLayerId: copy.id });
    },

    moveLayer: (id, direction) => {
      mutate((design) => {
        const index = design.layers.findIndex((layer) => layer.id === id);
        const target = index + direction;
        if (index < 0 || target < 0 || target >= design.layers.length) {
          return { layers: design.layers };
        }
        const layers = [...design.layers];
        const a = layers[index];
        const b = layers[target];
        if (!a || !b) {
          return { layers: design.layers };
        }
        layers[index] = b;
        layers[target] = a;
        return { layers };
      }, false);
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
