import { type Design, type DesignSummary } from "@mycanva/shared";

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) {
        message = body.error;
      }
    } catch {
      // Response had no JSON body; keep the status text.
    }
    throw new ApiError(res.status, message);
  }
  return (await res.json()) as T;
}

function jsonInit(method: string, body: unknown): RequestInit {
  return {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

export interface CreateDesignInput {
  name?: string;
  aspectRatioId?: string;
  width?: number;
  height?: number;
  background?: string;
}

export const api = {
  listDesigns: () => request<DesignSummary[]>("/api/designs"),
  createDesign: (input: CreateDesignInput) => request<Design>("/api/designs", jsonInit("POST", input)),
  getDesign: (id: string) => request<Design>(`/api/designs/${encodeURIComponent(id)}`),
  updateDesign: (id: string, design: Design) =>
    request<Design>(`/api/designs/${encodeURIComponent(id)}`, jsonInit("PUT", design)),
  deleteDesign: (id: string) =>
    request<{ ok: boolean }>(`/api/designs/${encodeURIComponent(id)}`, { method: "DELETE" }),
  duplicateDesign: (id: string) =>
    request<Design>(`/api/designs/${encodeURIComponent(id)}/duplicate`, { method: "POST" }),
  listAssets: () => request<string[]>("/api/assets"),
  uploadAsset: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<{ asset: string }>("/api/assets", { method: "POST", body: form });
  },
  deleteAsset: (file: string) =>
    request<{ ok: boolean }>(`/api/assets/${encodeURIComponent(file)}`, { method: "DELETE" }),
  systemFonts: () => request<string[]>("/api/fonts/system"),
  getFontFavorites: () => request<{ googleFontFavorites: string[] }>("/api/fonts/favorites"),
  setFontFavorites: (favorites: string[]) =>
    request<{ googleFontFavorites: string[] }>("/api/fonts/favorites", jsonInit("PUT", { googleFontFavorites: favorites })),
};
