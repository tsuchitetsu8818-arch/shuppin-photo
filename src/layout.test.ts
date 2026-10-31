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
it("clamps image pan to prevent exposed edges", () => {
  for (const [iw, ih] of [
    [100, 200],
    [200, 100],
    [100, 100],
  ])
    for (const zoom of [1, 3, 6]) {
      const r = { x: 0, y: 0, w: 0.4, h: 0.6 };
      for (const v of [-100, 100]) {
        const g = geometry(iw, ih, r, { zoom, x: v, y: v });
        expect(g.x).toBeLessThanOrEqual(0.000001);
        expect(g.y).toBeLessThanOrEqual(0.000001);
        expect(g.x + g.w).toBeGreaterThanOrEqual(r.w - 0.000001);
        expect(g.y + g.h).toBeGreaterThanOrEqual(r.h - 0.000001);
      }
    }
});
