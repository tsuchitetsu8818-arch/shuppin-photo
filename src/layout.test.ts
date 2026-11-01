import { describe, it, expect } from "vitest";
import { layouts, rectangles, geometry } from "./layout";
describe("all requested layouts", () => {
  for (const [count, options] of Object.entries(layouts))
    for (const layout of options)
      it(layout.id, () => {
        const rs = rectangles(layout, 0.04);
        expect(rs).toHaveLength(+count);
        for (const r of rs) {
          expect(r.x).toBeGreaterThanOrEqual(0);
          expect(r.y).toBeGreaterThanOrEqual(0);
          expect(r.w).toBeGreaterThan(0);
          expect(r.h).toBeGreaterThan(0);
          expect(r.x + r.w).toBeLessThanOrEqual(1);
          expect(r.y + r.h).toBeLessThanOrEqual(1);
        }
        for (let i = 0; i < rs.length; i++)
          for (let j = i + 1; j < rs.length; j++) {
            const a = rs[i],
              b = rs[j];
            expect(
              a.x + a.w <= b.x ||
                b.x + b.w <= a.x ||
                a.y + a.h <= b.y ||
                b.y + b.h <= a.y,
            ).toBe(true);
          }
      });
});
it("fills square with no gap", () => {
  for (const opts of Object.values(layouts))
    for (const l of opts)
      expect(rectangles(l, 0).reduce((s, r) => s + r.w * r.h, 0)).toBeCloseTo(
        1,
      );
});
it("allows free translation and shrinking below cover", () => {
  const r = { x: 0, y: 0, w: 0.4, h: 0.6 };
  const g = geometry(100, 200, r, { zoom: 0.2, x: 2, y: -3, rotation: 45 });
  expect(g.w).toBeCloseTo(0.08);
  expect(g.h).toBeCloseTo(0.16);
  expect(g.x).toBeCloseTo(2.16);
  expect(g.y).toBeCloseTo(-2.78);
});
