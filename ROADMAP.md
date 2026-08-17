# MyCanvas roadmap

A local-first, Canva-lite thumbnail designer. Hono + JSON-on-disk backend (`apps/server`),
React + react-konva editor (`apps/web`), shared types in `packages/shared`.

Canva reference screenshots live in `reference/` (git-ignored).

## Shipped

### v1

- Monorepo scaffold, MoonBeat eslint rule set, Hono API (designs CRUD, duplicate,
  asset upload/serve, system font scan, Google Font favorites).
- Editor: Konva canvas, drag/resize/rotate, text/image/rect/line layers, glow/shadow/stroke
  effects, layer panel with z-order, undo/redo, debounced autosave with thumbnails.
- Project list with aspect-ratio picker (1:1, 16:9, 9:16, 21:9, 9:21, 4:3, 3:4).
- Export PNG/JPG, 0.25x–3x scale, JPG quality, live file-size estimate.
- Copy/paste layers (Cmd/Ctrl+C/V), duplicate, arrow-key nudge.
- `npm run dev` runs both apps.

### v1.5 ("Studio Daylight")

- Light-first theme + dark mode (toggle in both top bars, persisted, OS-aware, no flash).
- Canva-style ergonomics: icon rail (Text/Shapes/Uploads), contextual left panel,
  floating context bar on selection (duplicate/z-order/delete + text quick controls),
  bottom zoom slider, violet transformer, gradient-hero projects home, relative-time meta.
- Drag-and-drop image files onto the canvas (uploads + places at drop point).
- Fixed: shortcuts (copy/paste/delete/nudge) were dead while non-text controls
  (sliders, checkboxes) held focus; canvas click now releases control focus.

## In flight

(nothing — see queued passes below)

## Shipped (cont.)

### v1.6 — resize semantics

- Corner anchors scale proportionally (text font scales via scaleX/scaleY).
- Middle anchors resize the container: text re-wraps (`wrapWidth`, top/bottom middles
  hidden), rects change width/height attrs, images genuinely crop (new optional
  `ImageLayer.crop` source-space rect in shared types), lines keep corners-only
  (angle preserved). Active anchor via `transformer.getActiveAnchor()`.
- Known nit: image middle-drags show a distorted live preview; correct crop snaps in
  on release.

### v1.7 — canvas interaction (Pass A)

- Rotate handle below the selection (`rotateAnchorAngle: 180`), 45° rotation snaps.
- Anchor styling: circles on corners, pills on sides, themed accent stroke.
- Smart guides: drag-snapping to layer edges/centers + canvas center/edges,
  magenta hairlines in the overlay layer (never exported). One best guide per axis;
  rotated layers snap by axis-aligned bounding box.
- Edit-in-place text: double-click or Enter overlays a styled textarea (pixel-exact),
  commit on blur/Escape/click-away; empty text commits as a single space.

### v1.8 — menus & panels (Pass B)

- Right-click context menu (canvas + layer rows): Copy/Paste/Duplicate (⌘D added)/
  Delete, Align-to-page submenu with independent H/V axes (bounds-driven, works for
  auto-sized text), Bring forward/Send backward.
- Image layers auto-named `image_N`; server keeps `data/assets.json` manifest of
  original filenames; Uploads panel shows filename labels.
- Unified ColorInput everywhere: design-colors row (derived live), default palette,
  `#rgb`/`#rrggbb`/`rgb(r,g,b)` input, native well.

### v1.9 — shapes & opacity (Pass C+D)

- New `ShapeLayer` type: triangle, hexagon, circle (ellipse), semicircle (dome), star.
  Same resize semantics as rects; star points normalized to the layer box.
- Opacity is a 0–100 percentage control (inspector + compact control in ContextBar).
- Popovers are viewport-aware (`usePopoverPlacement` hook): flip up when clipping,
  horizontal clamp, 8px margin. ContextMenu audited likewise.
- Asset manifest entries pruned on asset delete.

### v1.10 — background removal (Pass F)

- 1-click "Remove background" for image layers (inspector button + context menu).
- `briaai/RMBG-1.4` (quantized) via transformers.js in a dedicated Web Worker;
  WebGPU with WASM fallback; transferable buffers; model cached in browser Cache API.
- Cutout saved as a NEW asset; layer asset swapped through the store (undo/redo free);
  session cache `asset|crop → cutout` for instant re-apply; crop-aware; no-subject
  toast. Input capped at 1600px long side (original asset always preserved).
- Fixed upstream quirk: RMBG-1.4's config declares `model_type` verbatim; patched to
  `segformer` before pipeline creation (transformers.js v4).
- Measured: model download ~21s (once per browser profile), inference ~3s warm.

### v1.11 — photo colors (Pass G)

- ColorInput popover gains "Background colors" (image covering >95% of canvas) and
  "Photo colors" rows: per image layer, thumbnail + 5 swatches from node-vibrant
  (≤200px downscale, crop-aware), ranked by the heuristic (coverage/area/z/centrality).
- Palettes cached per `asset|crop` in the store; lazy extraction on popover open.

### v1.12 — curved text (Pass H)

- `curve?: number` (−100…100) on TextLayer (optional → old designs valid).
  `Konva.TextPath` with generated arc when curved: Θ = (|C|/100)·2π, R = W/Θ;
  smile case (C<0) swept so text reads left-to-right upright.
- Single-line only while curved; corners-only anchors; edit-in-place shows flat
  overlay with the curved render ghosted at 0.25 opacity behind.

### v1.13 — text effects (Pass I)

- Mutually-exclusive `effect` union on TextLayer: none/shadow/outline/echo/
  background/glitch, curated defaults via `defaultTextEffect()`, load-time
  migration from legacy shadow/stroke fields (kept in storage, ignored after
  migration). Non-text layers unchanged.
- Rendering: text LayerNode is a Konva Group (transformer on the group →
  effect-expanded bounds + proportional corner scaling for free). Outline =
  2×-thick stroke copy behind fill; echo = 2 trailing copies; background =
  round-capped band along the line path(s), follows curve arcs; glitch =
  ±offset channel-split copies.
- Effects grid in the text inspector with "Ag" preview tiles + per-effect params.

### v1.14 — multi-select & grouping (Pass E)

- Selection is a set (`selectedLayerIds`, last = primary): shift-click toggles,
  marquee from empty canvas (dashed accent rect, overlay-only, Shift = additive),
  group drag via Konva's transformer drag proxy, unified dashed bounding box with
  corners-only anchors, one history entry per multi-transform.
- Sets work everywhere: Cmd+C/V/D, Delete, arrow nudge, z-order, context menu,
  ContextBar (Group ≥2 selected / Ungroup, Cmd+G / Cmd+Shift+G).
- Grouping via `groupId` on the flat layers array: z-consolidation pulls members
  into a contiguous run at the topmost member's index (internal order preserved),
  group acts as one entity; double-click enters a group for isolated member
  editing (Escape exits). Clipboard is `Layer[]`; paste/duplicate remap groupIds.
- Layers inspector shows groups as collapsible rows (chevron + "Group N" header,
  members indented, header hover ungroup/delete) — user addition mid-pass.
- Follow-up fixes: curving multiline text no longer clips (arc radius measured
  with a scratch TextPath's per-glyph width); effect params + curve are
  slider+numeric combos (transient drag, one history entry per commit); precise
  fields (font size, X/Y, dims, rotation) stay plain inputs.

### v2.0

- Milestone commit (`6f4a6ca`): versions bumped to 2.0.0, everything committed.

### v2.1 — text-behind-subject (Pass J)

- "Text behind subject" action on image layers (inspector button + context menu):
  reuses the RMBG-1.4 worker via a shared `produceCutout(layer)` helper, saves the
  subject cutout as a new asset, and inserts it as a "Subject cutout" image layer
  at the source's exact geometry, directly above the topmost text layer above the
  image (top of stack if none). One undoable step (`addLayerAt`), auto-selected.
- Static copy by design: edits to the source don't re-sync the cutout.

### v2.2 — portrait mode (Pass K)

- "Portrait mode" on image layers (inspector + context menu): DepthAnything v2
  small (`depth-estimation`) in the same Web Worker as Pass F/J (job kinds
  `cutout`/`depth`), WebGPU → WASM fallback, download progress in the button.
- Banded bokeh composite on 2D canvas (sharp/mid/far, smoothstepped feathered
  depth bands); result uploaded as a new asset and swapped in — one undo step,
  original asset stays in Uploads (reversible).
- Strength slider combo (0–40, default 12) re-composites from the ORIGINAL asset
  with the depth map cached per asset+crop — no second inference on strength
  change. Fixed a SliderField double-commit bug (Enter+blur) found in testing.

### v2.4.1 — interaction fixes

- Middle-anchor drags preview live: images show the real crop growing, text
  re-wraps in place (per-frame "resize, don't scale" baking, `bakeMiddleTransform`
  in CanvasStage) — no more distorted stretch; commit on release, one undo step.
- Text-behind-subject (and remove-bg) cutouts are trimmed to their alpha bbox
  (+2px) before upload, positioned pixel-exact through the source's
  scale/rotation — layers underneath are clickable again.
- Edit-in-place overlay no longer re-wraps text: auto-width layers use
  `white-space: pre` + `wrap="off"` with live horizontal growth measured by a
  scratch `Konva.Text` (same metrics as the renderer); fixed-width overlays get a
  caret/letter-spacing buffer. Overlay focus frame CSS fixed (was being
  out-specified by a global `textarea:focus` rule).
- "Text behind subject" is no longer offered on cutout layers: `ImageLayer`
  gains optional `cutout?: boolean`, stamped by both text-behind-subject and
  remove-background; the action hides from the inspector/context menu and is
  guarded programmatically.

### v2.4 — rebrand to MyCanvas

- New brand from the user's logo PNG: hand-fitted `brand/icon.svg` (navy #162231
  rounded square, orange #fa7339 brush capsule + paint blob, clipPath corner
  clipping, pixel-compared against the source), `icon-dark.svg` (light-square
  variant), and `logo-light/dark.svg` lockups with the "MyCanvas" wordmark as
  Poppins SemiBold vector paths (GitHub-safe, no external font refs).
- App: `Brand.tsx` renders icon + Poppins wordmark, theme-aware; `<title>` +
  favicon (SVG + 64px PNG fallback); visible "mycanva" strings replaced.
  Internal identifiers (`@mycanva/*` packages, repo folder, localStorage keys,
  data dir) intentionally unchanged.
- README: centered `<picture>` header (dark/light lockup via
  `prefers-color-scheme`) above the tagline.

### v2.3 — inspector panel system (refactor)

- The properties sidebar is now a container of composable, collapsible panels:
  reusable `Panel` primitive (chevron header, subtle separators, optional
  `headerRight` slot — Shadow/Stroke enable checkboxes live there), pure
  composition in `Inspector.tsx` per layer type.
- `Inspector.tsx` split into `components/inspector/`: one file per section
  (Position, Text content, Layout, Text effects, Image, AI tools, Shape/Line,
  Shadow/Stroke) + shared `fields.tsx` (NumberField, SliderField, ColorField).
  Pure refactor, zero behavior change.
- Defaults: Effects/Shadow/Stroke open iff active; everything else expanded;
  collapse state resets on layer switch (deliberate).

### Layer locking (unreleased, post-2.0)

- `locked?: boolean` on LayerBase (optional → no migration). Locked layers stay
  selectable by click but are frozen: no drag/transformer/nudge/z-order/delete,
  marquee skips them entirely. Store-level guards in updateLayer/updateLayers
  (only `locked` patches pass), removeLayer(s) (locked filtered out),
  moveSelectedLayers (locked ids excluded; unlocked layers still pass them).
- UX: padlock badge on the selection frame (overlay layer, click = unlock),
  Lock/Unlock in the context menu and layers panel (persistent padlock on
  locked rows), inspector renders inert (pointer-events none + dimmed) under a
  lock notice with an Unlock button, ContextBar suppressed. Shortcut is
  **Cmd/Ctrl+Shift+L** — plain Cmd+L is the browser omnibox and can't be
  intercepted (verified firing in Playwright).
- Groups: the flag is per-layer and rides through group/ungroup/copy/paste/
  duplicate as plain layer data. A locked member inside a moved group simply
  stays behind (its write-back is filtered) — documented edge case.

### Cutout trim fix + shape corner radius (unreleased, post-2.0)

- Trim fix: `trimCutout` scanned for alpha > 0, but RMBG masks leave faint
  residue (alpha 1–8, ~6–12 px/column) that can reach the frame edges —
  extending the bbox (user saw the right edge untrimmed). Now: alpha > 8 plus
  a minimum column/row mass of 2 pixels. Verified no over-trim of wispy hair.
- `cornerRadius?: number` on ShapeLayer (optional → no migration). Shapes
  render through `roundedPolygonPath` (utils/rounded-path.ts): per-corner
  radius clamped to half the shorter adjacent edge, quadratic joins.
  Semicircle is sampled to a 64-point polyline so the same helper rounds its
  two chord corners while the arc stays exact. Circle excluded (no UI field).
- Also fixed a pre-existing bug found during verification: circle layers
  ignored layer x/y (Ellipse x/y after the prop spread overrode it) — circles
  now render inside a Group like text nodes do.

## Queued

Order: B → C+D → F → G → H → I → E. (A and B already shipped; F–I are
self-contained; E is the most invasive, so it goes last.)

### Pass A — canvas interaction

- **Rotate handle below the selection box** (Canva position; Konva defaults above).
  Inspector rotation field already exists; keep it two-way synced. 15° snaps with Shift if cheap.
- **Anchor styling**: circles on corners (scale), pill shapes on sides (container resize),
  per `reference` screenshots. Konva anchors are styleable.
- **Smart guides**: while dragging, snap to other layers' edges + centers and to canvas
  center/edges; magenta/violet guide lines rendered in the overlay layer (never exported);
  zoom-adjusted snap threshold. Stretch: even-spacing rulers with pixel readouts for 3+ items.
- **Edit-in-place text**: double-click (or Enter on selection) overlays an HTML textarea
  exactly over the Konva text node (same font/size/color/align/line-height, zoom-adjusted,
  same wrap width); commit on blur/Escape/click-away; keyboard shortcuts must stay inert
  while editing (textarea is already covered by the text-field guard).

### Pass B — menus & panels

- **Right-click context menu** on canvas layers (select + open at cursor, themed, closes on
  click-away/Escape): Copy ⌘C, Paste ⌘V, Duplicate ⌘D (new shortcut), Delete; divider;
  **Align to page** submenu — Left/Center/Right and Top/Middle/Bottom as independent axes,
  computed from rendered bounds (works for auto-sized text); divider; Bring forward /
  Send backward. Skip Canva's components/comments/lock.
- **Image naming**: new image layers get sequential names (`image_1`, `image_2`, …).
  Server stores original upload filename in a manifest (`data/assets.json`) and
  `GET /api/assets` returns `{asset, name}` pairs; Uploads panel labels thumbnails with the
  original filename. Backwards compatible: existing assets fall back to raw filename.
- **Color picker**: unified control everywhere (including background): swatch chip,
  text input accepting `#rgb` / `#rrggbb` / `rgb(r,g,b)` (normalized to hex),
  a default palette row, and a "colors in this design" row derived live from the design's
  layers (fills, strokes, shadows, line colors, background) — deduped, no schema change.

### Pass C - add more shapes

- Add triangle, hexagon, circle, , semicircle, star to the list of basic shapes.

### Pass D - add transparency controls

- For all layers, add a transparency control (a slider from 0 to 100) that allows setting the transparency of the layer.

### Pass E - Implement layer grouping 

**Phase 0 (user request): multi-select + marquee ("lasso") selection.** Selection
becomes a set (`selectedLayerIds`), not a single id. Shift-click toggles membership;
dragging from an empty canvas spot draws a marquee rectangle (themed, in the
overlay layer) and selects every layer whose bounds intersect it. Multi-select
supports: group drag (move all together), Delete/copy/paste across the set, and a
dashed unified bounding box. This is the foundation grouping builds on.

Here is a breakdown of how grouping works in Canva and how it affects the properties of the selected elements.

#### **The Dynamics of Grouping**

* **Unified Bounding Box:** When you select multiple elements, Canva draws a temporary dashed bounding box around the entire selection and provides a floating toolbar with a **Group** button.
* **Single Entity Behavior:** Once grouped, the elements function as a single structural unit. Moving, rotating, or scaling the group via the corner handles applies the transformation proportionally to everything inside the bounding box simultaneously.
* **Isolated Editing:** Even when grouped, you can still edit individual items. Clicking an element inside a group allows you to change its specific color, font, or crop without needing to ungroup the entire cluster first.

#### **Layering Order (Z-Index) Normalization**

* **Consolidation of Layers:** Every element on a Canva design sits on its own distinct layer (its z-index). When you group elements, they are merged into a single, consolidated layer block within the overall document hierarchy.
* **Z-Index Shifting:** If you group elements that originally had other unrelated, unselected elements layered between them, the act of grouping forces the selected items together. The new group will automatically shift to the layer position of the topmost element within your selection, pulling any lower selected elements up to join it.
* **Preserved Internal Hierarchy:** The relative z-index *between* the grouped items is perfectly maintained. If the triangle was layered above the square before grouping, it remains above the square inside the newly formed group.

#### **Normalization of Other Parameters**

* **Rotation Baseline:** Forming a group establishes a brand new rotation axis of 0 degrees for the unified bounding box, regardless of the individual rotation angles of the items inside it. Using the rotation handle at the bottom of the group rotates all items relative to this new shared center point.
* **Alignment Behavior:** If you use Canva's alignment tools (such as "Align left" or "Center") on a group, the entire cluster moves as one solid block relative to the page margins. If the elements were ungrouped, those same tools would force the individual elements to align with each other.
* **Positioning Coordinates:** The X and Y coordinates for the group are recalculated based on the outermost edges of the new combined bounding box, rather than the dimensions of the individual shapes.

#### **Layers Inspector & Ungroup (user addition)**

* Grouped layers must appear **as a group** in the layers inspector: a collapsible group row (named, e.g. "Group 1") containing its member layers indented beneath it, instead of a flat list of loose layers.
* **Ungroup** must be available wherever Group is (floating toolbar + context menu), restoring the members as independent layers at their current positions/rotations.

### Pass F - 1-click background removal (client-side)

Private, home-only project — licensing of model weights is a non-issue here.
Approach: fully client-side, no server inference, no Python sidecar. The cutout is
produced in the browser and saved back through the normal asset pipeline.

#### Engine

- **Model:** `briaai/RMBG-1.4` (BiRefNet architecture, quantized ONNX, ~43 MB).
- **Runtime:** `@huggingface/transformers` (transformers.js) `image-segmentation`
  pipeline, WebGPU execution with WASM fallback. Reference implementations:
  transformers.js `examples/remove-background-client`.
- **Delivery:** dynamic `import()` so the main bundle stays lean; model downloads on
  first use (progress bar) and persists in the browser cache afterwards.
- **Threading (required):** the pipeline lives in a dedicated **Web Worker**. The main
  thread posts the ImageData in; the worker runs graph compilation + inference +
  mask post-processing and posts the alpha mask back. The canvas thread never
  blocks — no jank while dragging elements mid-inference. Use transferable buffers
  (`ImageData.data.transfer` / OffscreenCanvas) to avoid copy overhead. Verify WebGPU
  availability inside the worker (Chrome: yes; Safari: check — WASM-in-worker is the
  fallback either way).

#### Pipeline (per click on "Remove background")

1. Read the layer's current asset (respecting `crop` — process what's displayed).
2. Inference at the model's native 1024² (letterboxed, aspect preserved) → alpha mask.
3. Upscale mask to the source resolution (bicubic). BiRefNet's detail recovery makes
   this sufficient; a guided filter against the original is the documented fallback
   ("Step 3b") if real-world edges disappoint — do not build preemptively.
4. Composite onto the alpha channel → PNG blob → `POST /api/assets` as a NEW asset.
   The original asset is never modified.

#### Integration & UX

- Entry points: image-layer inspector button + right-click context menu item.
- Layer's `asset` field is swapped through the store → undo/redo/autosave just work,
  and undo never reruns the model (swap back is instant).
- Session cache `assetId → cutoutAssetId` covers re-apply after undo; the persisted
  cutout asset covers reloads.
- Progress UI: model-download progress on first run, then an inference spinner on
  the layer/panel; canvas stays usable.
- No-subject edge case: if mask mean ≈ 0, abort and toast
  "Could not detect a clear subject in this image."
- Expected latency on Apple Silicon WebGPU: ~0.5–2 s.

#### Notes

- `onnxruntime-web` multithreading benefits from cross-origin isolation (COOP/COEP
  headers on the vite dev server); single-thread WASM works without it.
- Explicitly rejected: cloud GPU microservice (Option A of the original spec) and a
  local Python/FastAPI sidecar — extra moving parts for zero benefit in a private,
  single-machine app.

### Pass G — "Photo Colors" palette suggestions

Extends the v1.8 ColorInput ("In this design" row) with per-image palettes,
Canva-style. Sorted by a heuristic so the "star" image's palette comes first.

#### Heuristic ranking (the "star")

Score each image layer on the canvas: background status +50 (bounding box covers
>95% of canvas — we have no explicit background-image concept), area 0–30
(proportional), z-index 0–10, centrality 0–10. Sort descending; top palette may be
elevated to a dedicated "Background colors" section when the +50 criterion hits.

#### Extraction

- Downscale to max 200×200 on an off-screen canvas first (respecting `crop`).
- `node-vibrant` (vibrant.js): Vibrant, Muted, LightVibrant, DarkVibrant, DarkMuted
  → exactly 5 swatches.
- Cache per `assetId` in zustand; compute lazily on color-picker open.
- Implementation note: at 200×200 the extraction is single-digit ms, so a Web Worker
  is OPTIONAL here (unlike Pass F where it's required) — decide at build time;
  don't add worker plumbing just for this.

#### UI

In the ColorInput popover, below "In this design": a "Photo colors" section —
vertical list, per image (heuristic order): small thumbnail + row of 5 swatches.
Click applies the color through the existing transient/commit path.

### Pass H — curved / bent text

Curve slider (−100…100) on text layers; 0 = straight. Characters positioned along
an invisible circle of radius R = W/Θ, Θ = (C/100)·2π.

- **Renderer: `Konva.TextPath`** (Option A) with a dynamically generated SVG arc
  `M x1 y1 A R R 0 0 sweep x2 y2`. LayerNode renders TextPath when `curve ≠ 0`,
  plain `Konva.Text` otherwise — shadow/stroke/transformer/export all keep working.
  (Option B, custom sceneFunc per-glyph rendering, is deferred unless we ever need
  per-letter effects.)
- **Data model**: `curve: number` on `TextLayer` (default 0). No schema break.
- Curve implies single-line (user decision: **no multiline bent text**): `wrapWidth`
  ignored while curved, newlines in the content are flattened to spaces when
  `curve ≠ 0`; side-middle anchors disabled when curved, corners scale normally
  (keeps v1.6 semantics coherent).
- **C < 0 (smile) gotcha**: sweep the arc so text still reads left-to-right and
  isn't upside-down.
- Edit-in-place falls back to flat while typing; curve reapplies on commit. Per
  Canva (user screenshot 2026-08-17): while editing, keep the curved render (with
  any effect) ghosted at low opacity behind the flat editable line; the bounding
  box continues to wrap the curved extent.

### Pass I — text effects (mutually exclusive)

One effect per text layer, or none (Canva model — replaces the current independent
shadow/stroke toggles on text layers).

- **Data model**: `effect` discriminated union on TextLayer:
  `none | shadow(color, distance, angle, blur, opacity) | outline(color, thickness)
  | echo(color, distance, angle) | background(color, spread, roundness, opacity)
  | glitch(colorPair, distance, angle)`. Migration on load: `shadow.enabled` →
  shadow effect (offsets → distance+angle), `stroke.enabled` → outline.
- **Rendering**: the text LayerNode becomes a Konva Group of stacked copies:
  outline = doubled-thickness stroke-only copy behind the fill copy; echo = 2–3
  trailing copies; glitch = two channel-split copies offset ±distance (cyan/magenta
  or red/blue pairs); **background = a thick round-capped stroke along the text's
  own line path(s)** (per Canva's actual behavior — verified against the user's
  2026-08-17 screenshot of curved text with a yellow background band). Flat text:
  one band per laid-out line. Curved text (Pass H): the same SVG arc data as the
  TextPath, stroked. Spread maps to band thickness, Roundness to caps/joins.
  Background effect colors are plain solids only (user requirement — reuse the
  palette/design-colors rows, no gradients).
  Group client rect gives expanded bounding box + proportional corner-scaling of
  effect params for free; side handles only change wrapWidth.
- **UI**: Effects section in the text inspector — grid of square effect buttons
  with mini "Ag"-style preview glyphs per effect (None highlighted by default),
  dynamic param panel below (reuse SliderField + ColorInput; angle is a −180…180
  slider, no custom dial). Clicking an effect injects curated good-looking
  defaults immediately.
- **Edit-in-place**: effect suspended while typing, reapplied on commit (the
  overlay is already flat text).

### Pass J — text-behind-subject (from IDEAS.md #2)

The editorial "magazine depth" effect — heading sits behind the photo's subject
but in front of its background. Reuses the Pass F RMBG-1.4 worker pipeline
as-is (same model, same cache), so this is mostly layer orchestration.

- **UX**: with an image layer selected, a "Text behind subject" action (ContextBar /
  context menu / image inspector). The app generates the subject cutout of that
  image and inserts it as a new image layer ("Subject cutout") at the exact same
  x/y/size/rotation, placed directly above the topmost text layer that sits above
  the source image — producing the sandwich: original image < text < cutout.
- The cutout goes through the normal asset pipeline (new asset, PNG with alpha),
  so it survives reload/export like anything else.
- Compromise (document): the cutout is a static copy — moving/editing the source
  image afterwards does not re-sync it (delete + re-run to refresh).

### Pass K — portrait mode / depth bokeh (from IDEAS.md #5)

One-click DSLR-style background blur on an image layer.

- **Model**: `onnx-community/depth-anything-v2-small` via transformers.js
  `depth-estimation` pipeline, in the same Web Worker pattern as Pass F
  (dynamic import, download progress, browser-cache persistence, WASM fallback).
- **Composite (keep it simple, 2D canvas — no custom WebGL shader)**: render the
  image at 2–3 blur levels (canvas `ctx.filter = blur(Npx)`), band them by depth
  thresholds with a feathered mask edge, output one flattened PNG asset that
  replaces the layer's asset (original kept in Uploads, so it's reversible by
  re-adding). Strength slider = max blur radius.
- If per-pixel variable blur proves cheap via a Konva custom filter later, upgrade
  then; the banded composite is the v1.

### Pass L — magic eraser / inpainting (from IDEAS.md #1) — parked

Needs a brush-mask UI over the image plus LaMa-style inpainting. LaMa is **not** a
supported transformers.js architecture, so this means adding `onnxruntime-web` and
custom pre/post-processing — a second inference stack. Revisit when the user asks
for it; brush UI alone is a meaningful chunk.

### Pass M — AI upscaling (from IDEAS.md #4) — parked

Real-ESRGAN via `onnxruntime-web` (not transformers.js), tiled inference for large
images, keep node w/h so exports get sharper. Same second-stack cost as Pass L.

### Pass N — smart crop / subject-aware framing (from IDEAS.md #3) — parked

Needs subject detection (MediaPipe face detector or a YOLO-nano ONNX). Our crop
model is the v1.6 middle-anchor crop, not Canva frames — a lighter version could
auto-center the detected subject inside the current crop rect. Low priority until
real frames/masks exist.

### Future — local generative model integration (user note)

The user runs local image models (Flux 2, Krea, others). A later integration could
generate images directly into Uploads from a prompt — design TBD with the user
(server-side proxy to the local runtime vs. direct calls; where generation UI
lives). Not started; parking L/M/N confirmed by the user.

### Pass O — frames (image containers)

~~Canva-style frames: shape layers that clip an image.~~ **Done** (unreleased,
post-2.0). `FrameLayer` (shape + width/height/cornerRadius + optional
`content: {asset, offsetX, offsetY, scale}`; optional → old designs valid).
Konva Group + clipFunc (rounded-path tracer — corner radius works on every
shape); instance-patched `getClientRect` reports the shape box (Konva unions
unclipped children otherwise — transformer/hover/marquee would overshoot).
Empty frames render the placeholder illustration (sky/cloud/hills Konva
shapes) which DOES export (it's real content, like Canva). Fills: Uploads
thumb drag (new `application/x-mycanva-asset` MIME), filesystem drop
(hit-tests frames first), inspector Choose/Replace/Remove picker. Cover-fit
`max(w/iw, h/ih)` centered; double-click → content edit (pan clamped to cover,
wheel zoom anchored at pointer, Enter/Escape/click-away commits once;
transformer + ContextBar suppressed, dashed outline + hint pill). Corners
scale frame+content via the group scale; middles resize + re-cover (zoom
ratio + center preserved, baseScale-safe). Copy/paste/lock/marquee/group ride
along as normal layer data.

### Drop-target cues (unreleased, post-2.0)

- The full-viewport `.drop-overlay` is gone. Drag feedback is contextual:
  hovering a FRAME during drag outlines it in accent + soft tint and previews
  the dragged bitmap cover-fitted inside at 60% (bitmap known only for Uploads
  drags — `getData` is unreadable during dragover, so the asset id travels via
  a module stash set on dragstart); the inner ~48px page edge zone previews
  "set as background" (full-page image at 50% for asset drags, accent tint +
  pill for file drags); mid-canvas shows nothing, Canva-style. Reject drags
  (non-image files) get a small floating pill below the context bar.
- Edge drop inserts a cover-fit image layer at the BOTTOM of the stack
  (`addImageLayerAsBackground`, image_N naming shared via `nextImageName`).
  Precedence frame > edge > plain, identical hit tests in dragover and drop.

## Working agreements

- ~~No git mutations until the user asks. Milestone: bump to 2.0 + commit~~ **Done
  (commit `6f4a6ca`, all package.jsons at 2.0.0).** IDEAS.md reviewed: J + K
  promoted and queued for implementation; L/M/N parked (need a second inference
  stack — onnxruntime-web — or frames that don't exist yet).
- Known issue to fix post-E (user-reported): applying curve to multiline text
  flattens the lines but the layer box doesn't resize to the flattened content,
  clipping it. Recompute bounds from the TextPath on curve/content change.
- Pre-commit refinement (user-requested): numeric params for effects (angle,
  distance, blur, thickness, spread, roundness) get the Canva-style slider +
  synced numeric stepper combo (− value +); precise fields (font size, X/Y,
  dims) keep plain inputs. Extend SliderField, keep transient-commit.
- ~~Post-v2.3 fixes (user-reported): (a) middle-anchor drags need real-time preview
  for images AND text — image currently shows a distorted stretch until release
  (v1.6 nit), text should re-wrap live while dragging instead of on commit;
  (b) the text-behind-subject cutout layer must be trimmed to its content bounds
  (alpha bbox), not the full source frame — a full-frame transparent layer blocks
  selecting anything underneath it.~~ **Done** (unreleased, post-2.0): (a) the
  transformer bakes scale into crop/wrap width on every `transform` frame
  (`bakeMiddleTransform` in CanvasStage) and commits once at `transformend`;
  (b) `produceCutout` trims the cutout PNG to its alpha bbox (+2px) and both
  callers map the trimmed layer back through the source's scale/rotation.
- ~~Queued small item (user-requested): **hover preview box**~~ **Done**
  (unreleased, post-2.0): hover shows the layer's `getClientRect` outline in
  the overlay layer (accent hairline, `listening: false`, never exported).
  Group members box the whole group (what a click selects); inside an entered
  group, the member. Suppressed while dragging/marquee-ing/transforming, for
  selected layers, and cleared on zoom/selection change. Locked layers get the
  plain box (recognition aid).
- ~~Queued bug (user-reported): **corner-scale then mid-drag makes text jump
  huge.**~~ **Done**: `bakeMiddleTransform` now applies the transformer's
  per-frame scale *delta* relative to the drag-start scale
  (`transformBaseScaleRef`, captured at transformstart) and restores the node
  scale after each bake — wrapWidth/crop are computed in unscaled units
  (visual ÷ baseScale), so a corner-scaled layer never re-renders at its
  stored font size. Commits read scale back from the node instead of forcing
  1. Rect/shape middles keep the old normalize-to-1 bake (uniform fill is
  scale-invariant; inspector shows true dims; stroked shapes renormalize
  stroke strength — pre-existing semantics, documented in code).
- ~~Queued verification (user-requested): re-run the cutout-trim check with the
  USER'S real image `47cd6e81f194f81c.png` in a throwaway design~~ **Done**:
  cutout bbox hugged the subject (right edge trimmed ~220 display px of empty
  frame); throwaway design + generated assets deleted afterwards.
- ~~Queued (user-requested, Canva screenshot 2026-08-17 20:32): **multi-select
  boundaries**~~ **Done** (unreleased, post-2.0): with >1 layer selected, each
  member gets an accent hairline box (getClientRect — rotation/effects honored,
  group members collapse into one group box, locked members keep their box) and
  the unified extent draws as a dashed theme-gray outline; the transformer's own
  border is suppressed in multi-select (anchors + rotate handle stay). Boxes
  track live via dragmove/transform hooks. Single selection unchanged.
- ~~Queued (user-requested): **bigger color swatches**~~ **Done**: 30×30px
  circles, 8px gaps, 5 per row inside the existing 216px popover (no horizontal
  scroll); active ring offset bumped to 2px. Photo-row thumbnails unchanged.
- **Project renamed `mycanva` → `mycanvas`** (display name "MyCanvas" unchanged):
  workspace scopes (`@mycanvas/*`), root package name, the asset-drag MIME, and
  the server log line. Deliberately untouched: the `mycanva-theme` localStorage
  key (renaming it would silently lose the saved theme), README.md (being
  rewritten separately), `apps/server/data/`, and historical entries above that
  record the old name (v2.4 rebrand notes, Pass O MIME mention).
- Every UI change: Playwright screenshots in both themes, self-reviewed, then final review
  by the orchestrator. `npm run check` + `npm run build` stay green.
- Never touch the user's real design `c6857deda3f89d2d` / asset `47cd6e81f194f81c.png`
  in `apps/server/data/` during testing; clean up test data afterwards.
