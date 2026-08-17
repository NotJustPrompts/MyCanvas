import { type Layer } from "@mycanva/shared";
import { type LayerPatch, useEditorStore } from "../store/editorStore";
import { AiToolsSection } from "./inspector/AiToolsSection";
import { ShadowPanel, StrokePanel } from "./inspector/EffectPanels";
import { ImageSection } from "./inspector/ImageSection";
import { PositionSection } from "./inspector/PositionSection";
import { LineSection, RectSection, ShapeSection } from "./inspector/ShapeSections";
import { TextContentSection } from "./inspector/TextContentSection";
import { TextEffectsSection } from "./inspector/TextEffectsSection";
import { TextLayoutSection } from "./inspector/TextLayoutSection";

/**
 * Right-hand properties sidebar: a composition of collapsible panels chosen
 * by layer type. Adding a panel = one component + one line here.
 */
export function Inspector() {
  const design = useEditorStore((state) => state.design);
  const selectedLayerIds = useEditorStore((state) => state.selectedLayerIds);
  const updateLayer = useEditorStore((state) => state.updateLayer);
  const commitTransient = useEditorStore((state) => state.commitTransient);

  const layer: Layer | undefined = design?.layers.find(
    (entry) => entry.id === selectedLayerIds[selectedLayerIds.length - 1],
  );

  if (!layer) {
    return (
      <div className="panel-section inspector">
        <h3>Inspector</h3>
        <p className="muted">Select a layer to edit its properties.</p>
      </div>
    );
  }

  const patch = (p: LayerPatch, transient = false) => {
    updateLayer(layer.id, p, transient);
  };

  return (
    <div className="panel-section inspector">
      <h3>Inspector</h3>
      {selectedLayerIds.length > 1 && (
        <p className="muted multi-note">
          {selectedLayerIds.length}
          {" "}
          layers selected — showing the primary layer.
        </p>
      )}
      {layer.locked && (
        <div className="inspector-lock-notice">
          <span>This layer is locked — properties are frozen.</span>
          <button
            type="button"
            className="secondary"
            onClick={() => {
              updateLayer(layer.id, { locked: false });
            }}
          >
            Unlock
          </button>
        </div>
      )}
      <div className={layer.locked ? "inspector-panels locked" : "inspector-panels"} key={layer.id}>
        <PositionSection layer={layer} patch={patch} commit={commitTransient} />
        {layer.type === "text" && (
          <>
            <TextContentSection layer={layer} patch={patch} commit={commitTransient} />
            <TextLayoutSection layer={layer} patch={patch} commit={commitTransient} />
            <TextEffectsSection layer={layer} patch={patch} commit={commitTransient} />
          </>
        )}
        {layer.type === "image" && (
          <>
            <ImageSection layer={layer} patch={patch} commit={commitTransient} />
            <AiToolsSection layer={layer} patch={patch} commit={commitTransient} />
            <ShadowPanel
              shadow={layer.shadow}
              onPatch={(sub, transient) => {
                patch({ shadow: { ...layer.shadow, ...sub } }, transient);
              }}
              onCommit={commitTransient}
            />
          </>
        )}
        {layer.type === "rect" && (
          <>
            <RectSection layer={layer} patch={patch} commit={commitTransient} />
            <StrokePanel
              stroke={layer.stroke}
              onPatch={(sub, transient) => {
                patch({ stroke: { ...layer.stroke, ...sub } }, transient);
              }}
              onCommit={commitTransient}
            />
            <ShadowPanel
              shadow={layer.shadow}
              onPatch={(sub, transient) => {
                patch({ shadow: { ...layer.shadow, ...sub } }, transient);
              }}
              onCommit={commitTransient}
            />
          </>
        )}
        {layer.type === "shape" && (
          <>
            <ShapeSection layer={layer} patch={patch} commit={commitTransient} />
            <StrokePanel
              stroke={layer.stroke}
              onPatch={(sub, transient) => {
                patch({ stroke: { ...layer.stroke, ...sub } }, transient);
              }}
              onCommit={commitTransient}
            />
            <ShadowPanel
              shadow={layer.shadow}
              onPatch={(sub, transient) => {
                patch({ shadow: { ...layer.shadow, ...sub } }, transient);
              }}
              onCommit={commitTransient}
            />
          </>
        )}
        {layer.type === "line" && (
          <>
            <LineSection layer={layer} patch={patch} commit={commitTransient} />
            <ShadowPanel
              shadow={layer.shadow}
              onPatch={(sub, transient) => {
                patch({ shadow: { ...layer.shadow, ...sub } }, transient);
              }}
              onCommit={commitTransient}
            />
          </>
        )}
      </div>
    </div>
  );
}
