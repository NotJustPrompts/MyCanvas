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
