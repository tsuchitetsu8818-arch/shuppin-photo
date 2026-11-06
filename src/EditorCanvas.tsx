import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent,
} from "react";
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
import { HOLD_MS, movedBeforeHold, frameAt, dropTarget } from "./reorder";
type Props = {
  photos: (Photo | null)[];
  layout: Layout;
  settings: Settings;
  selected: number;
  selectOnly?: boolean;
  onSelect: (n: number) => void;
  onEmpty: (n: number) => void;
  onTransform: (n: number, t: Transform) => void;
  onSwap: (source: number, target: number) => void;
  onGesture: (v: boolean) => void;
};
type Drag = { source: number; target: number; point: Point };
export function EditorCanvas(p: Props) {
  const canvas = useRef<HTMLCanvasElement>(null),
    ghost = useRef<HTMLCanvasElement>(null),
    points = useRef(new Map<number, Point>()),
    gesture = useRef<{
      index: number;
      t: Transform;
      current: Transform;
      m: ReturnType<typeof metrics>;
    } | null>(null),
    empty = useRef<{ index: number; start: Point } | null>(null),
    hold = useRef<{
      pointer: number;
      index: number;
      start: Point;
      width: number;
      timer: ReturnType<typeof setTimeout>;
    } | null>(null),
    dragging = useRef<Drag | null>(null),
    blocked = useRef(false),
    latest = useRef(p);
  const [drag, setDrag] = useState<Drag | null>(null),
    rs = frames(p.layout, p.settings);
  latest.current = p;
  function clearHold() {
    if (hold.current) clearTimeout(hold.current.timer);
    hold.current = null;
  }
  function showDrag(next: Drag | null) {
    dragging.current = next;
    setDrag(next);
  }
  function abort() {
    clearHold();
    gesture.current = null;
    empty.current = null;
    showDrag(null);
    blocked.current = true;
    latest.current.onGesture(false);
  }
  // Changing geometry or photo identities invalidates any pending drop. Transform
  // changes are deliberately excluded, so normal pointer updates do not reset input.
  const photoIds = p.photos.map((photo) => photo?.id ?? "-").join(",");
  useLayoutEffect(() => {
    abort();
    points.current.clear();
    blocked.current = false;
  }, [p.layout, p.settings, photoIds, p.selectOnly]);
  useEffect(() => {
    const suspend = () => {
      abort();
      points.current.clear();
      blocked.current = false;
    };
    const hidden = () => {
      if (document.hidden) suspend();
    };
    window.addEventListener("blur", suspend);
    window.addEventListener("resize", suspend);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      clearHold();
      points.current.clear();
      gesture.current = null;
      dragging.current = null;
      empty.current = null;
      latest.current.onGesture(false);
      window.removeEventListener("blur", suspend);
      window.removeEventListener("resize", suspend);
      document.removeEventListener("visibilitychange", hidden);
    };
  }, []);
  useLayoutEffect(() => {
    if (canvas.current)
      draw(canvas.current, p.photos, p.layout, p.settings, 1000);
  }, [p.photos, p.layout, p.settings]);
  useLayoutEffect(() => {
    if (!drag || !ghost.current || !canvas.current) return;
    const r = rs[drag.source],
      g = ghost.current;
    g.width = Math.round(r.w * 1000);
    g.height = Math.round(r.h * 1000);
    g.getContext("2d")?.drawImage(
      canvas.current,
      r.x * 1000,
      r.y * 1000,
      r.w * 1000,
      r.h * 1000,
      0,
      0,
      g.width,
      g.height,
    );
  }, [drag?.source]);
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
      gesture.current = {
        ...g,
        t: g.current,
        m: metrics([...points.current.values()].slice(0, 2)),
      };
    }
  }
  function down(e: PointerEvent<HTMLDivElement>) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const pt = point(e);
    points.current.set(e.pointerId, pt);
    if (blocked.current) return;
    if (points.current.size > 1) {
      clearHold();
      empty.current = null;
      if (dragging.current) {
        abort();
        return;
      }
      rebase();
      return;
    }
    const i = frameAt(pt, rs);
    if (i < 0) return;
    p.onSelect(i);
    if (p.selectOnly) {
      blocked.current = true;
      return;
    }
    const photo = p.photos[i];
    if (!photo) {
      empty.current = { index: i, start: pt };
      return;
    }
    gesture.current = {
      index: i,
      t: photo.t,
      current: photo.t,
      m: metrics([pt]),
    };
    p.onGesture(true);
    const width = e.currentTarget.getBoundingClientRect().width;
    hold.current = {
      pointer: e.pointerId,
      index: i,
      start: pt,
      width,
      timer: setTimeout(() => {
        const candidate = hold.current;
        if (!candidate || points.current.size !== 1 || blocked.current) return;
        const current = points.current.get(candidate.pointer);
        if (
          !current ||
          movedBeforeHold(candidate.start, current, candidate.width)
        ) {
          clearHold();
          return;
        }
        clearHold();
        gesture.current = null;
        showDrag({ source: i, target: -1, point: current });
      }, HOLD_MS),
    };
  }
  function move(e: PointerEvent<HTMLDivElement>) {
    if (!points.current.has(e.pointerId)) return;
    const pt = point(e);
    points.current.set(e.pointerId, pt);
    if (blocked.current) return;
    const d = dragging.current;
    if (d) {
      showDrag({ ...d, point: pt, target: dropTarget(d.source, pt, rs) });
      return;
    }
    const h = hold.current;
    if (h) {
      if (!movedBeforeHold(h.start, pt, h.width)) return;
      clearHold(); // Once movement wins, returning to the start cannot re-arm hold.
    }
    const g = gesture.current,
      photo = g && p.photos[g.index];
    if (g && photo) {
      const t = transform(
        g.t,
        g.m,
        metrics([...points.current.values()].slice(0, 2)),
        rs[g.index],
        minZoom(photo, rs[g.index]),
      );
      g.current = t;
      p.onTransform(g.index, t);
    }
    if (
      empty.current &&
      movedBeforeHold(
        empty.current.start,
        pt,
        e.currentTarget.getBoundingClientRect().width,
      )
    )
      empty.current = null;
  }
  function up(e: PointerEvent<HTMLDivElement>) {
    if (!points.current.has(e.pointerId)) return;
    const was = points.current.size,
      pt = point(e),
      d = dragging.current;
    clearHold();
    points.current.delete(e.pointerId);
    if (e.type !== "pointerup") {
      abort();
    } else if (d && !blocked.current) {
      // Resolve the actual release point, including releases outside the canvas.
      const target = dropTarget(d.source, pt, rs);
      abort();
      if (target >= 0) p.onSwap(d.source, target);
    } else if (!blocked.current && points.current.size === 0) {
      const em = empty.current;
      if (em && was === 1 && frameAt(pt, rs) === em.index) p.onEmpty(em.index);
    }
    if (!points.current.size) {
      empty.current = null;
      gesture.current = null;
      showDrag(null);
      blocked.current = false;
      p.onGesture(false);
    } else if (!blocked.current) rebase();
  }
  const sourceRect = drag && rs[drag.source];
  return (
    <div
      className={"canvas-wrap" + (drag ? " swapping" : "")}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onLostPointerCapture={up}
      onContextMenu={(e) => e.preventDefault()}
      onDragStart={(e) => e.preventDefault()}
    >
      <canvas ref={canvas} aria-label="写真編集キャンバス" />
      <div className="frame-overlays" aria-hidden="true">
        {rs.map((r, i) => (
          <div
            key={i}
            className={
              "frame " +
              (p.selected === i && p.photos[i] ? "selected " : "") +
              (drag?.source === i ? "swap-source " : "") +
              (drag?.target === i ? "swap-target" : "")
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
            {drag?.target === i && (
              <span className="drop-label">
                {p.photos[i] ? "ここで入れ替え" : "ここへ移動"}
              </span>
            )}
          </div>
        ))}
      </div>
      {drag && sourceRect && (
        <>
          <canvas
            ref={ghost}
            className="swap-ghost"
            aria-hidden="true"
            style={{
              left: drag.point.x * 100 + "%",
              top: drag.point.y * 100 + "%",
              width:
                Math.min(0.3, (0.3 * sourceRect.w) / sourceRect.h) * 100 + "%",
              height: "auto",
              aspectRatio: sourceRect.w / sourceRect.h,
            }}
          />
          <div className="swap-hint" role="status">
            別の枠で離すと
            {drag.target >= 0 && !p.photos[drag.target] ? "移動" : "入れ替え"}
          </div>
        </>
      )}
    </div>
  );
}
