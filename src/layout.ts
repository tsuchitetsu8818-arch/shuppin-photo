export type Rect = { x: number; y: number; w: number; h: number };
export type Layout = {
  id: string;
  name: string;
  rows?: number[];
  cols?: number[];
};
export const layouts: Record<number, Layout[]> = {
  2: [
    { id: "2v", name: "上下", rows: [1, 1] },
    { id: "2h", name: "左右", rows: [2] },
  ],
  3: [
    { id: "3a", name: "上1＋下2", rows: [1, 2] },
    { id: "3b", name: "左1＋右2", cols: [1, 2] },
    { id: "3v", name: "縦3分割", rows: [1, 1, 1] },
    { id: "3h", name: "横3分割", rows: [3] },
  ],
  4: [
    { id: "4a", name: "2 × 2", rows: [2, 2] },
    { id: "4b", name: "上1＋下3", rows: [1, 3] },
  ],
  5: [
    { id: "5a", name: "上2＋下3", rows: [2, 3] },
    { id: "5b", name: "上3＋下2", rows: [3, 2] },
    { id: "5c", name: "上1＋下4", rows: [1, 4] },
  ],
};
export function rectangles(layout: Layout, gap: number): Rect[] {
  const groups = layout.rows ?? layout.cols!;
  const vertical = !!layout.rows;
  const size = (1 - gap * (groups.length + 1)) / groups.length;
  return groups.flatMap((count, i) =>
    Array.from({ length: count }, (_, j) => {
      const cross = (1 - gap * (count + 1)) / count;
      return vertical
        ? {
            x: gap + j * (cross + gap),
            y: gap + i * (size + gap),
            w: cross,
            h: size,
          }
        : {
            x: gap + i * (size + gap),
            y: gap + j * (cross + gap),
            w: size,
            h: cross,
          };
    }),
  );
}
export type Transform = { zoom: number; x: number; y: number };
export const initialTransform = (): Transform => ({ zoom: 1, x: 0, y: 0 });
export function geometry(iw: number, ih: number, r: Rect, t: Transform) {
  const scale = Math.max(r.w / iw, r.h / ih) * t.zoom;
  const w = iw * scale,
    h = ih * scale;
  const x = Math.max(-(w - r.w) / 2, Math.min((w - r.w) / 2, t.x));
  const y = Math.max(-(h - r.h) / 2, Math.min((h - r.h) / 2, t.y));
  return { w, h, x: (r.w - w) / 2 + x, y: (r.h - h) / 2 + y };
}
