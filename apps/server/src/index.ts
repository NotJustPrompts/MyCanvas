import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { readdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import { type Design, type DesignSummary, ASPECT_RATIOS } from "@mycanva/shared";

import { listSystemFonts } from "./system-fonts";
import {
  assetsDir,
  assetsManifestFile,
  designsDir,
  ensureDataDirs,
  isSafeId,
  newId,
  readJsonFile,
  settingsFile,
  writeJsonFile,
} from "./storage";

const PORT = Number(process.env.PORT ?? 3001);
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"]);

interface FavoritesSettings {
  googleFontFavorites: string[];
}

function designFile(id: string): string {
  return path.join(designsDir, `${id}.json`);
}

function toSummary(design: Design): DesignSummary {
  return {
    id: design.id,
    name: design.name,
    width: design.width,
    height: design.height,
    thumbnail: design.thumbnail,
    createdAt: design.createdAt,
    updatedAt: design.updatedAt,
  };
}

async function readDesign(id: string): Promise<Design | null> {
  if (!isSafeId(id)) {
    return null;
  }
  return readJsonFile<Design>(designFile(id));
}

async function readFavorites(): Promise<FavoritesSettings> {
  return (await readJsonFile<FavoritesSettings>(settingsFile)) ?? { googleFontFavorites: [] };
}

const app = new Hono();

app.use("/api/*", cors());

app.get("/api/designs", async (c) => {
  let files: string[];
  try {
    files = await readdir(designsDir);
  } catch {
    return c.json([]);
  }
  const summaries: DesignSummary[] = [];
  for (const file of files) {
    if (!file.endsWith(".json")) {
      continue;
    }
    const design = await readJsonFile<Design>(path.join(designsDir, file));
    if (design) {
      summaries.push(toSummary(design));
    }
  }
  summaries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return c.json(summaries);
});

app.post("/api/designs", async (c) => {
  const body = await c.req.json<{
    name?: string;
    aspectRatioId?: string;
    width?: number;
    height?: number;
    background?: string;
  }>();
  const preset = ASPECT_RATIOS.find((r) => r.id === body.aspectRatioId) ?? ASPECT_RATIOS[0];
  const width = body.width ?? preset?.width ?? 1280;
  const height = body.height ?? preset?.height ?? 720;
  if (width <= 0 || height <= 0 || width > 8192 || height > 8192) {
    return c.json({ error: "Invalid canvas size" }, 400);
  }
  const now = new Date().toISOString();
  const trimmedName = body.name?.trim();
  const design: Design = {
    id: newId(),
    name: trimmedName === undefined || trimmedName === "" ? "Untitled design" : trimmedName,
    width,
    height,
    background: body.background ?? "#ffffff",
    layers: [],
    createdAt: now,
    updatedAt: now,
  };
  await writeJsonFile(designFile(design.id), design);
  return c.json(design, 201);
});

app.get("/api/designs/:id", async (c) => {
  const design = await readDesign(c.req.param("id"));
  if (!design) {
    return c.json({ error: "Not found" }, 404);
  }
  return c.json(design);
});

app.put("/api/designs/:id", async (c) => {
  const existing = await readDesign(c.req.param("id"));
  if (!existing) {
    return c.json({ error: "Not found" }, 404);
  }
  const body = await c.req.json<Partial<Design>>();
  const design: Design = {
    ...existing,
    ...body,
    id: existing.id,
    createdAt: existing.createdAt,
    updatedAt: new Date().toISOString(),
  };
  await writeJsonFile(designFile(design.id), design);
  return c.json(design);
});

app.delete("/api/designs/:id", async (c) => {
  const id = c.req.param("id");
  if (!isSafeId(id)) {
    return c.json({ error: "Not found" }, 404);
  }
  try {
    await unlink(designFile(id));
  } catch {
    return c.json({ error: "Not found" }, 404);
  }
  return c.json({ ok: true });
});

app.post("/api/designs/:id/duplicate", async (c) => {
  const source = await readDesign(c.req.param("id"));
  if (!source) {
    return c.json({ error: "Not found" }, 404);
  }
  const now = new Date().toISOString();
  const copy: Design = {
    ...source,
    id: newId(),
    name: `${source.name} (copy)`,
    createdAt: now,
    updatedAt: now,
  };
  await writeJsonFile(designFile(copy.id), copy);
  return c.json(copy, 201);
});

app.get("/api/assets", async (c) => {
  try {
    const manifest = (await readJsonFile<Record<string, string>>(assetsManifestFile)) ?? {};
    const files = await readdir(assetsDir);
    return c.json(
      files
        .filter((f) => !f.startsWith("."))
        .map((asset) => ({ asset, name: manifest[asset] ?? asset })),
    );
  } catch {
    return c.json([]);
  }
});

app.post("/api/assets", async (c) => {
  const form = await c.req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return c.json({ error: "Missing file field" }, 400);
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return c.json({ error: "File too large (25 MB max)" }, 400);
  }
  const ext = path.extname(file.name).toLowerCase();
  if (!IMAGE_EXTENSIONS.has(ext)) {
    return c.json({ error: `Unsupported file type: ${ext || "(none)"}` }, 400);
  }
  const asset = `${newId()}${ext}`;
  await writeFile(path.join(assetsDir, asset), Buffer.from(await file.arrayBuffer()));
  const manifest = (await readJsonFile<Record<string, string>>(assetsManifestFile)) ?? {};
  manifest[asset] = file.name;
  await writeJsonFile(assetsManifestFile, manifest);
  return c.json({ asset, name: file.name }, 201);
});

app.delete("/api/assets/:file", async (c) => {
  const file = c.req.param("file");
  if (!isSafeId(path.basename(file, path.extname(file)))) {
    return c.json({ error: "Not found" }, 404);
  }
  try {
    await unlink(path.join(assetsDir, file));
    const manifest = (await readJsonFile<Record<string, string>>(assetsManifestFile)) ?? {};
    if (file in manifest) {
      delete manifest[file];
      await writeJsonFile(assetsManifestFile, manifest);
    }
  } catch {
    return c.json({ error: "Not found" }, 404);
  }
  return c.json({ ok: true });
});

app.use("/assets/*", serveStatic({ root: assetsDir, rewriteRequestPath: (p) => p.replace(/^\/assets/, "") }));

app.get("/api/fonts/system", async (c) => {
  return c.json(await listSystemFonts());
});

app.get("/api/fonts/favorites", async (c) => {
  return c.json(await readFavorites());
});

app.put("/api/fonts/favorites", async (c) => {
  const body = await c.req.json<Partial<FavoritesSettings>>();
  const settings: FavoritesSettings = {
    googleFontFavorites: Array.isArray(body.googleFontFavorites) ? body.googleFontFavorites : [],
  };
  await writeJsonFile(settingsFile, settings);
  return c.json(settings);
});

await ensureDataDirs();

serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`mycanva server listening on http://localhost:${info.port}`);
});

export { app };
