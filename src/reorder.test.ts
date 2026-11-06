import { expect, it } from "vitest";
import { layouts, frames, swap, initialTransform } from "./model";
import { movedBeforeHold, frameAt, dropTarget } from "./reorder";
const settings = { background: "#fff", margin: 3, gap: 3, radius: 0 };
for (const ls of Object.values(layouts))
  for (const layout of ls)
    it(`${layout.id}: every frame can be a drop target`, () => {
      const rs = frames(layout, settings);
      rs.forEach((r, target) => {
        const point = { x: r.x + r.w / 2, y: r.y + r.h / 2 };
        expect(frameAt(point, rs)).toBe(target);
        expect(dropTarget((target + 1) % rs.length, point, rs)).toBe(target);
        expect(dropTarget(target, point, rs)).toBe(-1);
      });
    });
it("slop uses CSS pixels at any canvas width and never reinterprets scale", () => {
  for (const width of [214, 320, 390, 480]) {
    expect(movedBeforeHold({ x: 0, y: 0 }, { x: 7 / width, y: 0 }, width)).toBe(
      false,
    );
    expect(movedBeforeHold({ x: 0, y: 0 }, { x: 9 / width, y: 0 }, width)).toBe(
      true,
    );
  }
});
it("outside canvas, margins and frame gaps are not drop targets", () => {
  const rs = frames(layouts[4][0], settings);
  for (const point of [
    { x: -0.1, y: 0.2 },
    { x: 1.1, y: 0.2 },
    { x: 0.2, y: -0.1 },
    { x: 0.2, y: 1.1 },
    { x: 0.5, y: 0.5 },
    { x: 0, y: 0 },
  ])
    expect(dropTarget(0, point, rs)).toBe(-1);
});
it("swapping with an empty frame moves the full photo object", () => {
  const photo = {
    id: "original",
    t: { ...initialTransform(), x: 0.2, y: -0.3, zoom: 0.4, angle: 37 },
  };
  const result = swap([photo, null], 0, 1);
  expect(result[0]).toBeNull();
  expect(result[1]).toBe(photo);
});
