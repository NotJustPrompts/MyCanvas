<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="brand/logo-dark.svg" />
    <img src="brand/logo-light.svg" alt="MyCanvas" width="420" />
  </picture>
</p>

<p align="center">
  A local-first, Canva-lite thumbnail designer. Put text with real fonts and effects<br />
  (glow, shadow, stroke) over images, drop in shapes and logos, and export to PNG/JPG.<br />
  No subscription, no cloud — projects live as JSON on your disk.
</p>

## Quick start

```sh
npm install
npm run dev        # starts API (:3001) and web UI (:5173) together
```

Open http://localhost:5173, create a design (1:1, 16:9, 9:16, 21:9, 9:21, 4:3, 3:4),
and start layering. To run them separately: `npm run dev:server` / `npm run dev:web`.

## Features

- **Layers**: text, images (uploads + reusable asset library), rectangles, lines.
- **Text**: any font installed on your Mac plus a curated Google Fonts list with
  per-font favorites; bold/italic, alignment, line height, letter spacing, fill.
- **Effects**: drop shadow and glow (zero-offset shadow), stroke/outline, opacity,
  corner radius on rects.
- **Editing**: drag / resize / rotate on canvas, z-order reorder, duplicate,
  copy/paste (`Cmd/Ctrl+C`, `Cmd/Ctrl+V`), undo/redo (`Cmd+Z` / `Cmd+Shift+Z`),
  arrow-key nudge (Shift = 10px), Delete removes the selected layer.
- **Autosave**: debounced save with thumbnail; refresh-safe.
- **Export**: PNG or JPG, 0.25x–3x scale, JPG quality slider, live file-size
  estimate — handy when YouTube complains about file size.
- **Project list**: thumbnails, duplicate, delete, aspect-ratio picker for new designs.

## Layout

- `apps/server` — Hono API. Data in `apps/server/data/` (`designs/*.json`,
  `assets/*`, `settings.json`). Back it up or git-track it if you like.
- `apps/web` — React + react-konva editor (Vite).
- `packages/shared` — types, aspect-ratio presets, curated Google Fonts list.

## Checks

```sh
npm run check   # eslint (MoonBeat rule set) + tsc across workspaces
npm run build   # production build of all workspaces
```

Note: `konva@^10.3.1` is pinned past your `~/.npmrc` `min-release-age=7` window; if a
fresh install ever complains, run `npm install --min-release-age=0` once.
