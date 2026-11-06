import type { Point, Rect } from "./model";
export const HOLD_MS = 500;
export const HOLD_SLOP_PX = 8;
// Geometry uses canvas coordinates; movement tolerance stays constant in CSS px.
export function movedBeforeHold(start: Point, point: Point, width: number) {
  return (
    Math.hypot(point.x - start.x, point.y - start.y) * width > HOLD_SLOP_PX
  );
}
export function frameAt(point: Point, frames: Rect[]) {
  if (point.x < 0 || point.y < 0 || point.x > 1 || point.y > 1) return -1;
  return frames.findIndex(
    (r) =>
      point.x >= r.x &&
      point.x <= r.x + r.w &&
      point.y >= r.y &&
      point.y <= r.y + r.h,
  );
}
export function dropTarget(source: number, point: Point, frames: Rect[]) {
  const target = frameAt(point, frames);
  return target === source ? -1 : target;
}
