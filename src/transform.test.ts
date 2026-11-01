import { expect, it } from "vitest";
import {
  gestureTransform,
  metrics,
  minimumZoom,
  normalizeAngle,
} from "./transform";
import { initialTransform } from "./layout";
const r = { x: 0, y: 0, w: 1, h: 1 };
it("one finger translates freely without scaling or rotation", () => {
  const start = { zoom: 0.3, x: 2, y: -3, rotation: 48 };
  const t = gestureTransform(
    start,
    metrics([{ x: 0.2, y: 0.2 }]),
    metrics([{ x: 0.6, y: 0.1 }]),
    r,
    0.01,
  );
  expect(t.x).toBeCloseTo(2.4);
  expect(t.y).toBeCloseTo(-3.1);
  expect(t.zoom).toBe(0.3);
  expect(t.rotation).toBe(48);
});
it("simultaneously pans, scales and twists around the finger midpoint", () => {
  const a = metrics([
    { x: 0.4, y: 0.5 },
    { x: 0.6, y: 0.5 },
  ]);
  const b = metrics([
    { x: 0.6, y: 0.4 },
    { x: 0.6, y: 0.8 },
  ]);
  const t = gestureTransform({ ...initialTransform(), x: 0.1 }, a, b, r, 0.01);
  expect(t.zoom).toBeCloseTo(2);
  expect(t.rotation).toBeCloseTo(90);
  expect(t.x).toBeCloseTo(0.1);
  expect(t.y).toBeCloseTo(0.3);
});
it("preserves the image point under an off-center pinch", () => {
  const from = metrics([
    { x: 0.6, y: 0.6 },
    { x: 0.8, y: 0.6 },
  ]);
  const to = metrics([
    { x: 0.5, y: 0.6 },
    { x: 0.9, y: 0.6 },
  ]);
  const t = gestureTransform(initialTransform(), from, to, r, 0.01);
  expect(t.x).toBeCloseTo(-0.2);
  expect(t.y).toBeCloseTo(-0.1);
});
it("rebasing when a finger is lifted does not change the transform", () => {
  const t = { zoom: 2, x: 0.1, y: -0.2, rotation: 123 };
  const m = metrics([{ x: 0.6, y: 0.8 }]);
  const result = gestureTransform(t, m, m, r, 0.01);
  expect(result.x).toBeCloseTo(t.x, 12);
  expect(result.y).toBeCloseTo(t.y, 12);
  expect(result.zoom).toBe(t.zoom);
  expect(result.rotation).toBe(t.rotation);
});
it("handles the atan2 boundary without a 358 degree jump", () => {
  const a = { cx: 0.5, cy: 0.5, distance: 0.2, angle: 179 },
    b = { ...a, angle: -179 };
  expect(gestureTransform(initialTransform(), a, b, r, 0.01).rotation).toBe(2);
  expect(normalizeAngle(270)).toBe(-90);
});
it("allows the entire panorama to fit at any angle", () => {
  for (const [iw, ih] of [
    [4000, 100],
    [100, 4000],
    [100, 100],
  ]) {
    const frame = { x: 0, y: 0, w: 0.2, h: 0.8 };
    const z = minimumZoom(iw, ih, frame);
    const scale = Math.max(frame.w / iw, frame.h / ih) * z;
    expect(Math.hypot(iw, ih) * scale).toBeLessThanOrEqual(
      Math.min(frame.w, frame.h),
    );
  }
});
it("clamps zoom while applying the actual scale to the anchor", () => {
  const a = { cx: 0.5, cy: 0.5, distance: 0.1, angle: 0 };
  const t = gestureTransform(
    { ...initialTransform(), zoom: 5, x: 0.1 },
    a,
    { ...a, distance: 1 },
    r,
    0.05,
  );
  expect(t.zoom).toBe(6);
  expect(t.x).toBeCloseTo(0.12);
});
