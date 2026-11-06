import { useLayoutEffect, useRef, type PointerEvent } from "react";
import {
  frames,
  metrics,
  minZoom,
  transform,
  type Photo,
  type Layout,
  type Settings,
  type Point,
  type Transform,
} from "./model";
import { draw } from "./render";
type Props = {
  photos: (Photo | null)[];
  layout: Layout;
  settings: Settings;
  selected: number;
  onSelect: (n: number) => void;
  onEmpty: (n: number) => void;
  onTransform: (n: number, t: Transform) => void;
  onGesture: (v: boolean) => void;
};
export function EditorCanvas(p: Props) {
  const canvas = useRef<HTMLCanvasElement>(null),
    points = useRef(new Map<number, Point>()),
    gesture = useRef<{
      index: number;
      t: Transform;
      m: ReturnType<typeof metrics>;
    } | null>(null),
    empty = useRef<{
      index: number;
      start: Point;
    } | null>(null),
    rs = frames(p.layout, p.settings);
  useLayoutEffect(() => {
    if (canvas.current)
      draw(canvas.current, p.photos, p.layout, p.settings, 1000);
  }, [p.photos, p.layout, p.settings]);
  const point = (e: PointerEvent) => {
    const b = e.currentTarget.getBoundingClientRect();
    return {
      x: (e.clientX - b.left) / b.width,
      y: (e.clientY - b.top) / b.height,
    };
  };
  function rebase() {
    const g = gesture.current;
    if (g && points.current.size) {
      const photo = p.photos[g.index];
      if (photo)
        gesture.current = {
          index: g.index,
          t: photo.t,
          m: metrics([...points.current.values()]),
        };
    }
  }
  function down(e: PointerEvent<HTMLDivElement>) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (points.current.size >= 2) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const pt = point(e);
    points.current.set(e.pointerId, pt);
    if (points.current.size === 1) {
      const i = rs.findIndex(
        (r) =>
          pt.x >= r.x && pt.x <= r.x + r.w && pt.y >= r.y && pt.y <= r.y + r.h,
      );
      if (i < 0) return;
      p.onSelect(i);
      const photo = p.photos[i];
      if (photo) {
        gesture.current = { index: i, t: photo.t, m: metrics([pt]) };
        p.onGesture(true);
      } else empty.current = { index: i, start: pt };
    } else {
      empty.current = null;
      rebase();
    }
  }
  function move(e: PointerEvent<HTMLDivElement>) {
    if (!points.current.has(e.pointerId)) return;
    const pt = point(e);
    points.current.set(e.pointerId, pt);
    const g = gesture.current;
    if (g) {
      const photo = p.photos[g.index];
      if (photo)
        p.onTransform(
          g.index,
          transform(
            g.t,
            g.m,
            metrics([...points.current.values()]),
            rs[g.index],
            minZoom(photo, rs[g.index]),
          ),
        );
    }
  }
  function up(e: PointerEvent<HTMLDivElement>) {
    if (!points.current.has(e.pointerId)) return;
    const was = points.current.size;
    points.current.delete(e.pointerId);
    if (!points.current.size) {
      const em = empty.current,
        pt = point(e);
      if (
        em &&
        was === 1 &&
        e.type === "pointerup" &&
        Math.hypot(pt.x - em.start.x, pt.y - em.start.y) < 0.025
      )
        p.onEmpty(em.index);
      empty.current = null;
      gesture.current = null;
      p.onGesture(false);
    } else rebase();
  }
  return (
    <div
      className="canvas-wrap"
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onLostPointerCapture={up}
    >
      <canvas ref={canvas} aria-label="写真編集キャンバス" />
      <div className="frame-overlays" aria-hidden="true">
        {rs.map((r, i) => (
          <div
            key={i}
            className={
              "frame " + (p.selected === i && p.photos[i] ? "selected" : "")
            }
            style={{
              left: r.x * 100 + "%",
              top: r.y * 100 + "%",
              width: r.w * 100 + "%",
              height: r.h * 100 + "%",
              borderRadius: (p.settings.radius / 360) * 100 + "cqw",
            }}
          >
            {p.photos[i] ? (
              <span className="frame-number">{i + 1}</span>
            ) : (
              <span className="empty-frame">
                ＋<small>写真を追加</small>
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
