import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  geometry,
  initialTransform,
  layouts,
  rectangles,
  type Transform,
  type Rect,
} from "./layout";
import {
  gestureTransform,
  metrics,
  minimumZoom,
  normalizeAngle,
  type GestureMetrics,
} from "./transform";
type Photo = { id: string; image: HTMLImageElement; url: string; t: Transform };
function draw(
  ctx: CanvasRenderingContext2D,
  size: number,
  photos: (Photo | null)[],
  rects: Rect[],
  bg: string,
  radius: number,
) {
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, size, size);
  photos.forEach((p, i) => {
    const r = rects[i];
    if (!r || !p) return;
    const g = geometry(p.image.naturalWidth, p.image.naturalHeight, r, p.t);
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(
      r.x * size,
      r.y * size,
      r.w * size,
      r.h * size,
      Math.min(radius, r.w / 2, r.h / 2) * size,
    );
    ctx.clip();
    ctx.translate(
      (r.x + r.w / 2 + p.t.x) * size,
      (r.y + r.h / 2 + p.t.y) * size,
    );
    ctx.rotate((p.t.rotation * Math.PI) / 180);
    ctx.drawImage(
      p.image,
      (-g.w * size) / 2,
      (-g.h * size) / 2,
      g.w * size,
      g.h * size,
    );
    ctx.restore();
  });
}
export default function App() {
  const [photos, commitPhotos] = useState<(Photo | null)[]>(
      Array(5).fill(null),
    ),
    [count, setCount] = useState(2),
    [tab, setTab] = useState("layout"),
    [layoutId, setLayoutId] = useState(""),
    [gap, setGap] = useState(0.012),
    [radius, setRadius] = useState(0),
    [bg, setBg] = useState("#ffffff"),
    [selected, setSelected] = useState(0),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [sharing, setSharing] = useState(false),
    [gestureActive, setGestureActive] = useState(false),
    [saveNotice, setSaveNotice] = useState(""),
    [retry, setRetry] = useState(0),
    [prepared, setPrepared] = useState<{ revision: object; file: File } | null>(
      null,
    ),
    [loading, setLoading] = useState(false),
    [result, setResult] = useState<{ url: string; file: File } | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null),
    input = useRef<HTMLInputElement>(null),
    replacement = useRef<number | null>(null),
    photoRef = useRef(photos),
    resultRef = useRef(result);
  resultRef.current = result;
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{
    index: number;
    t: Transform;
    metrics: GestureMetrics;
  } | null>(null);
  const frame = useRef<number | null>(null);
  const suppressEmptyTap = useRef(false);
  const choices = layouts[count] ?? [],
    layout = choices.find((l) => l.id === layoutId) ?? choices[0],
    rects = layout ? rectangles(layout, gap) : [];
  const selectedPhoto = photos[selected];
  const minZoom = selectedPhoto
    ? minimumZoom(
        selectedPhoto.image.naturalWidth,
        selectedPhoto.image.naturalHeight,
        rects[selected],
      )
    : 0.05;
  const complete = photos.slice(0, count).every(Boolean);
  const hiddenCount = photos.slice(count).filter(Boolean).length;
  // A different revision immediately makes an older JPEG ineligible for sharing.
  const revision = useMemo(
    () => ({}),
    [photos, count, layoutId, gap, radius, bg],
  );
  const ready = prepared?.revision === revision;
  useEffect(() => {
    let cancelled = false;
    setPrepared(null);
    if (!complete) {
      setBusy(false);
      return;
    }
    setBusy(true);
    if (gestureActive) return;
    // Debounce editing; never encode inside the save button's user gesture.
    const timer = window.setTimeout(() => {
      try {
        const c = document.createElement("canvas");
        c.width = c.height = 2000;
        draw(c.getContext("2d")!, 2000, photos, rects, bg, radius);
        c.toBlob(
          (blob) => {
            if (cancelled) return;
            if (blob) {
              setPrepared({
                revision,
                file: new File([blob], `shuppin-photo-${Date.now()}.jpg`, {
                  type: "image/jpeg",
                }),
              });
              setSaveNotice("");
            } else {
              setSaveNotice(
                "画像を作成できませんでした。編集内容は残っています。もう一度お試しください。",
              );
            }
            setBusy(false);
          },
          "image/jpeg",
          0.95,
        );
      } catch {
        if (!cancelled) {
          setSaveNotice(
            "画像を作成できませんでした。編集内容は残っています。もう一度お試しください。",
          );
          setBusy(false);
        }
      }
    }, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [revision, retry, gestureActive]);
  useLayoutEffect(() => {
    const c = canvas.current;
    if (c) draw(c.getContext("2d")!, 1000, photos, rects, bg, radius);
  }, [photos, count, layoutId, gap, radius, bg]);
  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      photoRef.current.forEach((p) => {
        if (p) URL.revokeObjectURL(p.url);
      });
      if (resultRef.current) URL.revokeObjectURL(resultRef.current.url);
    },
    [],
  );
  function invalidate() {
    setResult((old) => {
      if (old) URL.revokeObjectURL(old.url);
      return null;
    });
  }
  function setPhotos(
    update: (Photo | null)[] | ((old: (Photo | null)[]) => (Photo | null)[]),
  ) {
    const next =
      typeof update === "function" ? update(photoRef.current) : update;
    photoRef.current = next;
    commitPhotos(next);
  }
  function updateTransform(index: number, t: Transform, immediate = false) {
    invalidate();
    photoRef.current = photoRef.current.map((p, i) =>
      i === index && p ? { ...p, t } : p,
    );
    if (immediate) {
      flushFrame();
      return;
    }
    if (frame.current === null)
      frame.current = requestAnimationFrame(() => {
        frame.current = null;
        setPhotos(photoRef.current);
      });
  }
  function flushFrame() {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    setPhotos(photoRef.current);
  }
  function transform(t: Transform) {
    stopGesture();
    updateTransform(selected, t, true);
  }
  async function load(files: FileList | null) {
    if (!files?.length) return;
    const index = replacement.current;
    replacement.current = null;
    const list = Array.from(files);
    if (
      index === null
        ? photos.filter(Boolean).length + list.length > 5
        : list.length !== 1
    ) {
      setError("写真は合計5枚まで。差し替えは1枚選んでください。");
      return;
    }
    setLoading(true);
    setError("");
    const added: Photo[] = [];
    try {
      for (const file of list) {
        if (!file.type.startsWith("image/"))
          throw Error("画像ファイルを選んでください。");
        const url = URL.createObjectURL(file);
        try {
          const image = new Image();
          image.src = url;
          await image.decode();
          added.push({
            id: crypto.randomUUID(),
            image,
            url,
            t: initialTransform(),
          });
        } catch {
          URL.revokeObjectURL(url);
          throw Error(
            "読み込めない写真があります。JPEG・PNG形式でお試しください。",
          );
        }
      }
      invalidate();
      const next = [...photos];
      let first = index ?? next.findIndex((p) => !p);
      if (index !== null) {
        if (next[index]) URL.revokeObjectURL(next[index]!.url);
        next[index] = added[0];
      } else {
        for (const photo of added) next[next.findIndex((p) => !p)] = photo;
        const last = next.reduce((last, p, i) => (p ? i : last), 1);
        setCount(Math.max(count, last + 1));
      }
      setPhotos(next);
      setSelected(first);
    } catch (e) {
      added.forEach((p) => URL.revokeObjectURL(p.url));
      setError((e as Error).message);
    } finally {
      setLoading(false);
      if (input.current) input.current.value = "";
    }
  }
  function pick(index: number | null) {
    stopGesture();
    replacement.current = index;
    if (input.current) {
      input.current.multiple = index === null;
      input.current.click();
    }
  }
  function move(delta: number) {
    stopGesture();
    const target = selected + delta;
    if (target < 0 || target >= count) return;
    invalidate();
    setPhotos((old) => {
      const next = [...old];
      [next[selected], next[target]] = [next[target], next[selected]];
      return next;
    });
    setSelected(target);
  }
  function begin(index: number) {
    gesture.current = {
      index,
      t: { ...photoRef.current[index]!.t },
      metrics: metrics([...pointers.current.values()]),
    };
  }
  function releasePointer(id: number) {
    if (!pointers.current.delete(id)) return;
    flushFrame();
    if (pointers.current.size && gesture.current) begin(gesture.current.index);
    else {
      gesture.current = null;
      setGestureActive(false);
    }
  }
  function stopGesture() {
    flushFrame();
    pointers.current.clear();
    gesture.current = null;
    setGestureActive(false);
  }
  function canShare(file: File) {
    try {
      return (
        typeof navigator.share === "function" &&
        typeof navigator.canShare === "function" &&
        navigator.canShare({ files: [file] })
      );
    } catch {
      return false;
    }
  }
  function save() {
    if (sharing || pointers.current.size) return;
    if (!ready || !prepared) {
      setRetry((n) => n + 1);
      return;
    }
    const file = prepared.file;
    // Keep a separately owned preview URL until the user closes/edits it.
    if (resultRef.current) URL.revokeObjectURL(resultRef.current.url);
    const next = { file, url: URL.createObjectURL(file) };
    resultRef.current = next;
    setResult(next);
    setSaveNotice("");
    if (canShare(file)) void share(file);
    else
      setSaveNotice(
        "完成画像を長押しして保存、またはJPEGをダウンロードしてください。",
      );
  }
  async function share(file: File) {
    if (sharing) return;
    setSharing(true);
    setSaveNotice("");
    try {
      // Call synchronously from the tap handler: no encoding/await before share.
      await navigator.share({ files: [file] });
      setSaveNotice(
        "「画像を保存」が見つからない場合は、下の画像を長押しして保存してください。",
      );
    } catch (e) {
      setSaveNotice(
        (e as Error).name === "AbortError"
          ? "共有を終了しました。画像は残っています。再共有、または長押しで保存できます。"
          : "共有できませんでした。画像は残っています。再共有、または長押しで保存してください。",
      );
    } finally {
      setSharing(false);
    }
  }
  function selectCount(next: number) {
    setCount(next);
    setSelected((i) => Math.min(i, next - 1));
    stopGesture();
    invalidate();
  }
  return (
    <div className="editor">
      <header className="toolbar">
        <a className="brand" href="./">
          <span className="brand-mark">▦</span> 出品フォト
        </a>
        <span className="output-label">2000 × 2000</span>
        <button
          className="primary save-button"
          disabled={!complete || busy || loading || sharing || gestureActive}
          onClick={save}
        >
          {busy ? "準備中…" : complete && !ready ? "再試行" : "保存"}
        </button>
      </header>
      <main className="stage">
        <div
          className="canvas-area"
          onPointerDown={(e) => {
            if (pointers.current.size >= 2 || loading) return;
            const b = e.currentTarget.getBoundingClientRect();
            const point = {
              x: (e.clientX - b.left) / b.width,
              y: (e.clientY - b.top) / b.height,
            };
            let index = gesture.current?.index;
            if (index === undefined) {
              suppressEmptyTap.current = false;
              index = rects.findIndex(
                (r) =>
                  point.x >= r.x &&
                  point.x <= r.x + r.w &&
                  point.y >= r.y &&
                  point.y <= r.y + r.h,
              );
              if (index < 0 || !photoRef.current[index]) return;
            } else suppressEmptyTap.current = true;
            e.preventDefault();
            e.currentTarget.setPointerCapture(e.pointerId);
            pointers.current.set(e.pointerId, point);
            setGestureActive(true);
            setSelected(index);
            begin(index);
          }}
          onPointerMove={(e) => {
            const g = gesture.current;
            if (!pointers.current.has(e.pointerId) || !g) return;
            e.preventDefault();
            const b = e.currentTarget.getBoundingClientRect();
            pointers.current.set(e.pointerId, {
              x: (e.clientX - b.left) / b.width,
              y: (e.clientY - b.top) / b.height,
            });
            const p = photoRef.current[g.index]!,
              r = rects[g.index];
            updateTransform(
              g.index,
              gestureTransform(
                g.t,
                g.metrics,
                metrics([...pointers.current.values()]),
                r,
                minimumZoom(p.image.naturalWidth, p.image.naturalHeight, r),
              ),
            );
          }}
          onPointerUp={(e) => releasePointer(e.pointerId)}
          onPointerCancel={(e) => releasePointer(e.pointerId)}
          onLostPointerCapture={(e) => releasePointer(e.pointerId)}
        >
          <canvas
            ref={canvas}
            aria-label="結合写真プレビュー。指で移動、2本指で拡大縮小・回転"
            width="1000"
            height="1000"
          />
          <div className="slot-overlays">
            {rects.map((r, i) => (
              <div
                key={i}
                className={`slot ${selected === i && photos[i] ? "selected" : ""}`}
                style={{
                  left: `${r.x * 100}%`,
                  top: `${r.y * 100}%`,
                  width: `${r.w * 100}%`,
                  height: `${r.h * 100}%`,
                }}
              >
                {photos[i] ? (
                  <span className="slot-number">{i + 1}</span>
                ) : (
                  <button
                    className="empty-slot"
                    disabled={loading}
                    aria-label={`枠${i + 1}に写真を追加`}
                    onClick={() => {
                      if (!suppressEmptyTap.current) pick(i);
                    }}
                  >
                    <span>＋</span>
                    <small>写真を追加</small>
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
        <div className="stage-caption">
          <span>
            {photos[selected]
              ? `写真 ${selected + 1} を編集中`
              : "空いている枠をタップ"}
          </span>
          <button
            className="replace-button"
            disabled={loading}
            onClick={() => pick(selected)}
          >
            {photos[selected] ? "写真を差し替え" : "この枠に追加"}
          </button>
        </div>
        <p className="gesture-hint">ドラッグで移動 · 2本指で拡大縮小・回転</p>
        {error && (
          <p className="notice error" role="alert">
            {error}
            <button aria-label="エラーを閉じる" onClick={() => setError("")}>
              ×
            </button>
          </p>
        )}
        {!result && saveNotice && (
          <p className="notice" role="status">
            {saveNotice}
          </p>
        )}
      </main>
      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => void load(e.target.files)}
      />
      <section className="dock" aria-label="編集メニュー">
        <div className="count-bar">
          <span>写真の枚数</span>
          <div className="count-options">
            {[2, 3, 4, 5].map((n) => (
              <button
                key={n}
                aria-pressed={count === n}
                disabled={loading}
                onClick={() => selectCount(n)}
              >
                {n}枚
              </button>
            ))}
          </div>
          <button
            className="batch-add"
            onClick={() => pick(null)}
            disabled={loading || photos.every(Boolean)}
            aria-label="写真をまとめて追加"
          >
            ＋ まとめて
          </button>
        </div>
        <div
          className="tool-panel"
          role="tabpanel"
          id={`panel-${tab}`}
          aria-labelledby={`tab-${tab}`}
        >
          {tab === "layout" && (
            <>
              <div className="panel-heading">
                <span>レイアウトを選択</span>
                <small>
                  {hiddenCount
                    ? `枠の外に${hiddenCount}枚保持中`
                    : "写真は端末内だけで処理"}
                </small>
              </div>
              <div className="layouts">
                {choices.map((l) => (
                  <button
                    key={l.id}
                    className={layout.id === l.id ? "chosen" : ""}
                    aria-pressed={layout.id === l.id}
                    onClick={() => {
                      setLayoutId(l.id);
                      stopGesture();
                      invalidate();
                    }}
                  >
                    <svg viewBox="0 0 60 60" aria-hidden="true">
                      {rectangles(l, 0.045).map((r, i) => (
                        <rect
                          key={i}
                          x={r.x * 60}
                          y={r.y * 60}
                          width={r.w * 60}
                          height={r.h * 60}
                          rx="2"
                        />
                      ))}
                    </svg>
                    <span>{l.name}</span>
                  </button>
                ))}
              </div>
            </>
          )}
          {tab === "border" && (
            <>
              <div className="background">
                <span>背景</span>
                <div>
                  {[
                    ["#ffffff", "白"],
                    ["#222222", "黒"],
                    ["#d5d5d5", "グレー"],
                  ].map(([color, name]) => (
                    <button
                      key={color}
                      aria-pressed={bg === color}
                      onClick={() => {
                        setBg(color);
                        invalidate();
                      }}
                    >
                      <i style={{ background: color }} />
                      {name}
                    </button>
                  ))}
                </div>
              </div>
              <label className="slider">
                余白
                <input
                  type="range"
                  min="0"
                  max=".04"
                  step=".002"
                  value={gap}
                  onChange={(e) => {
                    setGap(+e.target.value);
                    invalidate();
                  }}
                />
                <span>{Math.round(gap * 2000)}px</span>
              </label>
              <label className="slider">
                角丸
                <input
                  type="range"
                  min="0"
                  max=".05"
                  step=".002"
                  value={radius}
                  onChange={(e) => {
                    setRadius(+e.target.value);
                    invalidate();
                  }}
                />
                <span>{Math.round(radius * 2000)}px</span>
              </label>
            </>
          )}
          {tab === "adjust" && (
            <>
              <div className="photos">
                {photos.slice(0, count).map((p, i) => (
                  <button
                    key={i}
                    className={`thumb ${selected === i ? "selected" : ""}`}
                    aria-label={`写真${i + 1}を選択`}
                    onClick={() => {
                      stopGesture();
                      setSelected(i);
                    }}
                  >
                    {p ? (
                      <img src={p.url} alt={`選択した写真 ${i + 1}`} />
                    ) : (
                      <span>＋</span>
                    )}
                    <b>{i + 1}</b>
                  </button>
                ))}
              </div>
              <label className="slider">
                拡大
                <input
                  type="range"
                  aria-label="拡大"
                  min={minZoom}
                  max="6"
                  step="any"
                  disabled={!photos[selected]}
                  value={photos[selected]?.t.zoom ?? 1}
                  onChange={(e) =>
                    transform({ ...photos[selected]!.t, zoom: +e.target.value })
                  }
                />
                <button
                  disabled={!photos[selected]}
                  onClick={() => transform(initialTransform())}
                >
                  リセット
                </button>
              </label>
              <label className="slider">
                回転
                <input
                  aria-label="回転角度"
                  type="range"
                  min="-180"
                  max="180"
                  step="1"
                  disabled={!selectedPhoto}
                  value={selectedPhoto?.t.rotation ?? 0}
                  onChange={(e) =>
                    transform({
                      ...selectedPhoto!.t,
                      rotation: +e.target.value,
                    })
                  }
                />
                <span>{Math.round(selectedPhoto?.t.rotation ?? 0)}°</span>
                <button
                  disabled={!selectedPhoto}
                  onClick={() =>
                    transform({
                      ...selectedPhoto!.t,
                      rotation: normalizeAngle(selectedPhoto!.t.rotation + 90),
                    })
                  }
                >
                  90°回転
                </button>
              </label>
              <div className="photo-tools">
                <span>写真 {selected + 1}</span>
                <button
                  onClick={() => move(-1)}
                  disabled={selected === 0 || loading}
                  aria-label="前に移動"
                >
                  ←
                </button>
                <button
                  onClick={() => move(1)}
                  disabled={selected === count - 1 || loading}
                  aria-label="後ろに移動"
                >
                  →
                </button>
                <button
                  disabled={!photos[selected] || loading}
                  onClick={() => {
                    stopGesture();
                    invalidate();
                    URL.revokeObjectURL(photos[selected]!.url);
                    setPhotos((old) =>
                      old.map((p, i) => (i === selected ? null : p)),
                    );
                  }}
                >
                  削除
                </button>
              </div>
            </>
          )}
        </div>
        <nav className="tool-tabs" role="tablist" aria-label="編集ツール">
          {[
            ["layout", "▦", "レイアウト"],
            ["border", "▣", "枠線・余白"],
            ["adjust", "☷", "調整"],
          ].map(([id, icon, name]) => (
            <button
              key={id}
              role="tab"
              id={`tab-${id}`}
              aria-selected={tab === id}
              aria-controls={`panel-${id}`}
              onClick={() => setTab(id)}
            >
              <span aria-hidden="true">{icon}</span>
              {name}
            </button>
          ))}
        </nav>
      </section>
      {result && (
        <div className="modal-backdrop">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="画像を保存"
          >
            <button
              className="close"
              autoFocus
              onClick={invalidate}
              aria-label="閉じる"
            >
              ×
            </button>
            <h2>出品の準備ができました。</h2>
            <p>2000 × 2000 px・JPEG</p>
            <img
              src={result.url}
              alt="完成した結合写真。長押しで保存できます"
            />
            <p className="save-help">
              共有画面で「画像を保存」を選んでください。
              <br />
              見つからない場合は、この画像を長押しして保存できます。
            </p>
            {saveNotice && (
              <p className="save-notice" role="status">
                {saveNotice}
              </p>
            )}
            {canShare(result.file) && (
              <button
                className="primary"
                disabled={sharing}
                onClick={() => void share(result.file)}
              >
                {sharing ? "共有中…" : "もう一度共有する"}
              </button>
            )}
            <a
              className="download"
              href={result.url}
              download={result.file.name}
            >
              JPEGをダウンロード
            </a>
            <small>
              iPhoneは共有メニューの「画像を保存」、
              <br />
              または画像を長押しして保存できます。
            </small>
            <button className="text-button" onClick={invalidate}>
              編集に戻る
            </button>
          </section>
        </div>
      )}
    </div>
  );
}
