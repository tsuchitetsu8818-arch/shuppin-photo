import type { Rect, Transform } from "./layout";
export type Point = { x: number; y: number };
export type GestureMetrics = {
  cx: number;
  cy: number;
  distance: number;
  angle: number;
};
export function normalizeAngle(degrees: number) {
  return ((((degrees + 180) % 360) + 360) % 360) - 180;
}
export function metrics(points: Point[]): GestureMetrics {
  const [a, b] = points;
  return {
    cx: points.reduce((s, p) => s + p.x, 0) / points.length,
    cy: points.reduce((s, p) => s + p.y, 0) / points.length,
    distance: b ? Math.hypot(b.x - a.x, b.y - a.y) : 0,
    angle: b ? (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI : 0,
  };
}
// Small enough to show the entire image, even for panoramas and any rotation.
export function minimumZoom(iw: number, ih: number, r: Rect) {
  const cover = Math.max(r.w / iw, r.h / ih);
  return Math.min(
    0.05,
    (Math.min(r.w, r.h) / (Math.hypot(iw, ih) * cover)) * 0.5,
  );
}
export function gestureTransform(
  start: Transform,
  from: GestureMetrics,
  to: GestureMetrics,
  r: Rect,
  minZoom: number,
): Transform {
  const ratio =
    from.distance > 0.0001 && to.distance > 0 ? to.distance / from.distance : 1;
  const zoom = Math.max(minZoom, Math.min(6, start.zoom * ratio));
  const delta =
    from.distance > 0 && to.distance > 0
      ? normalizeAngle(to.angle - from.angle)
      : 0;
  const rad = (delta * Math.PI) / 180,
    scale = zoom / start.zoom;
  const dx = r.x + r.w / 2 + start.x - from.cx,
    dy = r.y + r.h / 2 + start.y - from.cy;
  return {
    zoom,
    rotation: normalizeAngle(start.rotation + delta),
    x:
      to.cx + scale * (Math.cos(rad) * dx - Math.sin(rad) * dy) - r.x - r.w / 2,
    y:
      to.cy + scale * (Math.sin(rad) * dx + Math.cos(rad) * dy) - r.y - r.h / 2,
  };
}
