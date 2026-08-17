/**
 * Rounded-corner polygon paths. Konva has no native corner radius for
 * polygons/stars, so each corner is cut by the radius (clamped to half of the
 * shorter adjacent edge) and rejoined with a quadratic through the original
 * vertex — the standard rounded-polygon construction.
 */

/** Points are flat x,y pairs; the polygon is closed implicitly. */
export function roundedPolygonPath(points: number[], radius: number): string {
  const count = points.length / 2;
  if (count < 3) {
    return "";
  }
  if (radius <= 0) {
    const [x0 = 0, y0 = 0] = points;
    const parts = [`M ${String(x0)} ${String(y0)}`];
    for (let i = 1; i < count; i += 1) {
      parts.push(`L ${String(points[i * 2] ?? 0)} ${String(points[i * 2 + 1] ?? 0)}`);
    }
    parts.push("Z");
    return parts.join(" ");
  }
  let d = "";
  for (let i = 0; i < count; i += 1) {
    const px = points[((i - 1 + count) % count) * 2] ?? 0;
    const py = points[((i - 1 + count) % count) * 2 + 1] ?? 0;
    const cx = points[i * 2] ?? 0;
    const cy = points[i * 2 + 1] ?? 0;
    const nx = points[((i + 1) % count) * 2] ?? 0;
    const ny = points[((i + 1) % count) * 2 + 1] ?? 0;
    const e1x = cx - px;
    const e1y = cy - py;
    const e2x = nx - cx;
    const e2y = ny - cy;
    const len1 = Math.hypot(e1x, e1y);
    const len2 = Math.hypot(e2x, e2y);
    if (len1 === 0 || len2 === 0) {
      continue;
    }
    const r = Math.min(radius, len1 / 2, len2 / 2);
    const p1x = cx - (e1x / len1) * r;
    const p1y = cy - (e1y / len1) * r;
    const p2x = cx + (e2x / len2) * r;
    const p2y = cy + (e2y / len2) * r;
    d += `${i === 0 ? "M" : "L"} ${String(p1x)} ${String(p1y)} Q ${String(cx)} ${String(cy)} ${String(p2x)} ${String(p2y)} `;
  }
  return `${d}Z`;
}

const SEMICIRCLE_SEGMENTS = 64;

/**
 * Semicircle as a fine polyline (dome over the bottom chord) so the same
 * rounded-corner helper applies: arc vertices clamp to a hair and render
 * identically to the arc; the two chord corners get the radius.
 */
export function semicirclePoints(width: number, height: number): number[] {
  const points: number[] = [];
  for (let i = 0; i <= SEMICIRCLE_SEGMENTS; i += 1) {
    const theta = Math.PI - (i / SEMICIRCLE_SEGMENTS) * Math.PI;
    points.push(width / 2 + (width / 2) * Math.cos(theta), height - height * Math.sin(theta));
  }
  return points;
}

/**
 * Star points normalized so the bounding box spans the full layer box — Konva
 * derives a shape's width/height from its geometry, and the resize math
 * depends on node dimensions matching the layer's declared box.
 */
export function starPoints(width: number, height: number): number[] {
  const raw: number[] = [];
  for (let i = 0; i < 10; i += 1) {
    const outer = i % 2 === 0;
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    const radius = outer ? 1 : 0.42;
    raw.push(radius * Math.cos(angle), radius * Math.sin(angle));
  }
  const xs = raw.filter((_, index) => index % 2 === 0);
  const ys = raw.filter((_, index) => index % 2 === 1);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const points: number[] = [];
  for (let i = 0; i < raw.length; i += 2) {
    const px = raw[i] ?? 0;
    const py = raw[i + 1] ?? 0;
    points.push(((px - minX) / (maxX - minX)) * width, ((py - minY) / (maxY - minY)) * height);
  }
  return points;
}

/** Corner points for the polygonal shapes (semicircle is a fine polyline). */
export function shapePoints(kind: "triangle" | "hexagon" | "star" | "semicircle", width: number, height: number): number[] {
  switch (kind) {
    case "triangle":
      return [width / 2, 0, width, height, 0, height];
    case "hexagon":
      return [
        width * 0.25, 0, width * 0.75, 0, width, height / 2,
        width * 0.75, height, width * 0.25, height, 0, height / 2,
      ];
    case "star":
      return starPoints(width, height);
    case "semicircle":
      return semicirclePoints(width, height);
  }
}

/** Canvas-context tracer for the same geometry — used by Konva clipFunc. */
export function traceRoundedPolygon(
  ctx: Pick<CanvasRenderingContext2D, "beginPath" | "moveTo" | "lineTo" | "quadraticCurveTo" | "closePath">,
  points: number[],
  radius: number,
): void {
  const count = points.length / 2;
  if (count < 3) {
    return;
  }
  ctx.beginPath();
  for (let i = 0; i < count; i += 1) {
    const px = points[((i - 1 + count) % count) * 2] ?? 0;
    const py = points[((i - 1 + count) % count) * 2 + 1] ?? 0;
    const cx = points[i * 2] ?? 0;
    const cy = points[i * 2 + 1] ?? 0;
    const nx = points[((i + 1) % count) * 2] ?? 0;
    const ny = points[((i + 1) % count) * 2 + 1] ?? 0;
    const e1x = cx - px;
    const e1y = cy - py;
    const e2x = nx - cx;
    const e2y = ny - cy;
    const len1 = Math.hypot(e1x, e1y);
    const len2 = Math.hypot(e2x, e2y);
    if (len1 === 0 || len2 === 0) {
      continue;
    }
    const r = Math.min(radius, len1 / 2, len2 / 2);
    const p1x = cx - (e1x / len1) * r;
    const p1y = cy - (e1y / len1) * r;
    const p2x = cx + (e2x / len2) * r;
    const p2y = cy + (e2y / len2) * r;
    if (i === 0) {
      ctx.moveTo(p1x, p1y);
    } else {
      ctx.lineTo(p1x, p1y);
    }
    ctx.quadraticCurveTo(cx, cy, p2x, p2y);
  }
  ctx.closePath();
}
