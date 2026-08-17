import { useEffect, useState } from "react";
import { type ImageLayer } from "@mycanva/shared";
import { useEditorStore } from "../../store/editorStore";
import { removeLayerBackground, textBehindSubject } from "../../utils/bg-removal";
import { applyPortraitMode, getPortraitInfo } from "../../utils/portrait-mode";
import { type SectionProps, SliderField } from "./fields";
import { Panel } from "./Panel";

/** AI actions: background removal, text-behind-subject, portrait mode. */
export function AiToolsSection({ layer }: SectionProps<ImageLayer>) {
  const bgRemoval = useEditorStore((state) => state.bgRemoval);
  const running = bgRemoval?.layerId === layer.id;
  const busy = bgRemoval !== null;
  const cutoutRunning = running && bgRemoval.kind === "cutout";
  const portraitRunning = running && bgRemoval.kind === "portrait";
  const label = cutoutRunning
    ? bgRemoval.progress === null
      ? "Removing background…"
      : `Downloading model… ${String(Math.round((bgRemoval.progress ?? 0) * 100))}%`
    : "Remove background";
  const portraitLabel = portraitRunning
    ? bgRemoval.progress === null
      ? "Applying portrait mode…"
      : `Downloading model… ${String(Math.round((bgRemoval.progress ?? 0) * 100))}%`
    : "Portrait mode";
  const portrait = getPortraitInfo(layer.asset);
  const [strength, setStrength] = useState(portrait?.strength ?? 12);

  useEffect(() => {
    setStrength(portrait?.strength ?? 12);
  }, [portrait?.strength]);

  return (
    <Panel title="AI tools">
      <button
        type="button"
        className="primary block"
        disabled={busy}
        onClick={() => {
          void removeLayerBackground(layer);
        }}
      >
        {label}
      </button>
      {!layer.cutout && (
        <button
          type="button"
          className="secondary block"
          disabled={busy}
          title="Place the subject cutout above the topmost text layer"
          onClick={() => {
            void textBehindSubject(layer);
          }}
        >
          Text behind subject
        </button>
      )}
      <button
        type="button"
        className="secondary block"
        disabled={busy}
        title="Depth-based background blur"
        onClick={() => {
          void applyPortraitMode(layer, portrait?.strength ?? 12);
        }}
      >
        {portraitLabel}
      </button>
      {portrait && (
        <SliderField
          label="Portrait strength"
          value={strength}
          min={0}
          max={40}
          step={1}
          onChange={setStrength}
          onCommit={() => {
            void applyPortraitMode(layer, strength);
          }}
        />
      )}
    </Panel>
  );
}
