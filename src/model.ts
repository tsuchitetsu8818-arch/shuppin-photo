export type Rect = {
  x: number;
  y: number;
  w: number;
  h: number;
};
export type Transform = {
  x: number;
  y: number;
  zoom: number;
  angle: number;
};
export type Photo = {
  id: string;
  image: HTMLCanvasElement;
  t: Transform;
};
export type Layout = {
  id: string;
  name: string;
  cells: Rect[];
};
export type Settings = {
  background: string;
  margin: number;
  gap: number;
  radius: number;
};
const r = (x: number, y: number, w: number, h: number): Rect => ({
  x,
  y,
  w,
  h,
});
const rows = (...counts: number[]) =>
  counts.flatMap((n, j) =>
    Array.from({ length: n }, (_, i) =>
      r(i / n, j / counts.length, 1 / n, 1 / counts.length),
    ),
  );
const transpose = (cells: Rect[]) => cells.map((c) => r(c.y, c.x, c.h, c.w));
const l = (id: string, name: string, cells: Rect[]): Layout => ({
  id,
  name,
  cells,
});
export const layouts: Record<number, Layout[]> = {
  2: [l("2tb", "上下2分割", rows(1, 1)), l("2lr", "左右2分割", rows(2))],
  3: [
    l("3top", "上1枚＋下2枚", rows(1, 2)),
    l("3left", "左1枚＋右2枚", transpose(rows(1, 2))),
    l("3rows", "横3分割", rows(1, 1, 1)),
    l("3cols", "縦3分割", rows(3)),
  ],
  4: [
    l("4grid", "2×2", rows(2, 2)),
    l("4top", "上1枚＋下3枚", rows(1, 3)),
    l("4left", "左1枚＋右3枚", transpose(rows(1, 3))),
  ],
  5: [
    l("5top", "上2枚＋下3枚", rows(2, 3)),
    l("5bottom", "上3枚＋下2枚", rows(3, 2)),
    l("5hero", "上1枚＋下4枚", rows(1, 4)),
  ],
};
export const initialTransform = (): Transform => ({
  x: 0,
  y: 0,
  zoom: 1,
  angle: 0,
});
// Controls use px relative to a 360px square. Internal geometry is normalized.
export function frames(layout: Layout, s: Settings): Rect[] {
  const m = s.margin / 360,
    g = s.gap / 360;
  return layout.cells.map((c) =>
    r(
      m + c.x * (1 - 2 * m) + g / 2,
      m + c.y * (1 - 2 * m) + g / 2,
      c.w * (1 - 2 * m) - g,
      c.h * (1 - 2 * m) - g,
    ),
  );
}
export const normalizeAngle = (a: number) =>
  ((((a + 180) % 360) + 360) % 360) - 180;
export type Point = {
  x: number;
  y: number;
};
export function metrics(p: Point[]) {
  const [a, b] = p;
  return {
    x: b ? (a.x + b.x) / 2 : a.x,
    y: b ? (a.y + b.y) / 2 : a.y,
    d: b ? Math.hypot(b.x - a.x, b.y - a.y) : 0,
    a: b ? Math.atan2(b.y - a.y, b.x - a.x) : 0,
  };
}
export function minZoom(p: Photo, r: Rect) {
  return Math.min(
    0.05,
    Math.min(r.w, r.h) /
      Math.hypot(p.image.width, p.image.height) /
      Math.max(r.w / p.image.width, r.h / p.image.height) /
      2,
  );
}
export function transform(
  t: Transform,
  from: ReturnType<typeof metrics>,
  to: ReturnType<typeof metrics>,
  r: Rect,
  min: number,
): Transform {
  const zoom = Math.max(
    min,
    Math.min(6, t.zoom * (from.d && to.d ? to.d / from.d : 1)),
  );
  const a = from.d && to.d ? to.a - from.a : 0,
    k = zoom / t.zoom;
  const x = r.x + r.w / 2 + t.x - from.x,
    y = r.y + r.h / 2 + t.y - from.y;
  return {
    zoom,
    angle: normalizeAngle(t.angle + (a * 180) / Math.PI),
    x: to.x + k * (Math.cos(a) * x - Math.sin(a) * y) - r.x - r.w / 2,
    y: to.y + k * (Math.sin(a) * x + Math.cos(a) * y) - r.y - r.h / 2,
  };
}
export function swap<T>(items: T[], a: number, b: number) {
  const result = [...items];
  [result[a], result[b]] = [result[b], result[a]];
  return result;
}
