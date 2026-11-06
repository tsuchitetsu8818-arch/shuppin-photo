import { expect, it } from "vitest";
import {
  frames,
  layouts,
  initialTransform,
  metrics,
  transform,
  swap,
} from "./model";
const settings = { background: "#fff", margin: 0, gap: 0, radius: 0 };
for (const [count, ls] of Object.entries(layouts))
  for (const l of ls)
    it(`${l.name}: ${count} cells cover square without overlap`, () => {
      const rs = frames(l, settings);
      expect(rs).toHaveLength(+count);
      expect(rs.reduce((s, r) => s + r.w * r.h, 0)).toBeCloseTo(1);
      for (const a of rs) {
        expect(a.x).toBeGreaterThanOrEqual(0);
        expect(a.y).toBeGreaterThanOrEqual(0);
        expect(a.x + a.w).toBeLessThanOrEqual(1.00001);
        expect(a.y + a.h).toBeLessThanOrEqual(1.00001);
        for (const b of rs)
          if (a !== b)
            expect(
              Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) *
                Math.max(
                  0,
                  Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y),
                ),
            ).toBeCloseTo(0);
      }
    });
it("gaps and margins leave positive cells at maxima", () => {
  for (const ls of Object.values(layouts))
    for (const l of ls)
      for (const r of frames(l, { ...settings, margin: 20, gap: 20 })) {
        expect(r.w).toBeGreaterThan(0);
        expect(r.h).toBeGreaterThan(0);
      }
});
it("one finger moves without bounding the image", () => {
  const r = { x: 0, y: 0, w: 1, h: 1 };
  const t = transform(
    initialTransform(),
    metrics([{ x: 0.2, y: 0.2 }]),
    metrics([{ x: 2, y: -1 }]),
    r,
    0.01,
  );
  expect(t.x).toBeCloseTo(1.8);
  expect(t.y).toBeCloseTo(-1.2);
  expect(t.angle).toBe(0);
});
it("two fingers scale rotate and translate around midpoint", () => {
  const t = transform(
    initialTransform(),
    metrics([
      { x: 0.4, y: 0.5 },
      { x: 0.6, y: 0.5 },
    ]),
    metrics([
      { x: 0.6, y: 0.4 },
      { x: 0.6, y: 0.8 },
    ]),
    { x: 0, y: 0, w: 1, h: 1 },
    0.01,
  );
  expect(t.zoom).toBeCloseTo(2);
  expect(t.angle).toBeCloseTo(90);
  expect(t.x).toBeCloseTo(0.1);
  expect(t.y).toBeCloseTo(0.1);
});
it("rebasing a gesture preserves transformation", () => {
  const t = { x: 0.1, y: -0.2, zoom: 0.3, angle: 170 },
    m = metrics([{ x: 0.2, y: 0.4 }]);
  const result = transform(t, m, m, { x: 0, y: 0, w: 1, h: 1 }, 0.01);
  expect(result.x).toBeCloseTo(t.x, 12);
  expect(result.y).toBeCloseTo(t.y, 12);
  expect(result.zoom).toBe(t.zoom);
  expect(result.angle).toBe(t.angle);
});
it("swap moves the complete photo state without mutating original", () => {
  const a = { id: "a", t: { ...initialTransform(), angle: 34 } },
    b = { id: "b", t: initialTransform() },
    ps = [a, b];
  expect(swap(ps, 0, 1)).toEqual([b, a]);
  expect(ps).toEqual([a, b]);
});
