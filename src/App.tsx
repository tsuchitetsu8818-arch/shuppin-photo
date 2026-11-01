import { useEffect, useMemo, useRef, useState } from "react";
import {
  geometry,
  initialTransform,
  layouts,
  rectangles,
  type Transform,
  type Rect,
} from "./layout";
type Photo = { id: string; image: HTMLImageElement; url: string; t: Transform };
function draw(
  ctx: CanvasRenderingContext2D,
  size: number,
  photos: Photo[],
  rects: Rect[],
  bg: string,
  radius: number,
) {
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, size, size);
  photos.forEach((p, i) => {
    const r = rects[i];
    if (!r) return;
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
    ctx.drawImage(
      p.image,
      (r.x + g.x) * size,
      (r.y + g.y) * size,
      g.w * size,
      g.h * size,
    );
    ctx.restore();
  });
}
export default function App() {
  const [photos, setPhotos] = useState<Photo[]>([]),
    [layoutId, setLayoutId] = useState(""),
    [gap, setGap] = useState(0.012),
    [radius, setRadius] = useState(0),
    [bg, setBg] = useState("#ffffff"),
    [selected, setSelected] = useState(0),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [sharing, setSharing] = useState(false),
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
  photoRef.current = photos;
  resultRef.current = result;
  const pointers = useRef(new Map<number, { x: number; y: number }>()),
    gesture = useRef<{
      index: number;
      t: Transform;
      cx: number;
      cy: number;
      distance: number;
    } | null>(null);
  const choices = layouts[photos.length] ?? [],
    layout = choices.find((l) => l.id === layoutId) ?? choices[0],
    rects = layout ? rectangles(layout, gap) : [];
  // A different revision immediately makes an older JPEG ineligible for sharing.
  const revision = useMemo(() => ({}), [photos, layoutId, gap, radius, bg]);
  const ready = prepared?.revision === revision;
  useEffect(() => {
    let cancelled = false;
    setPrepared(null);
    if (photos.length < 2) {
      setBusy(false);
      return;
    }
    setBusy(true);
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
  }, [revision, retry]);
  useEffect(() => {
    const c = canvas.current;
    if (c) draw(c.getContext("2d")!, 1000, photos, rects, bg, radius);
  }, [photos, layoutId, gap, radius, bg]);
  useEffect(
    () => () => {
      photoRef.current.forEach((p) => URL.revokeObjectURL(p.url));
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
  function transform(t: Transform) {
    invalidate();
    setPhotos((old) => old.map((p, i) => (i === selected ? { ...p, t } : p)));
  }
  async function load(files: FileList | null) {
    if (!files?.length) return;
    const index = replacement.current;
    replacement.current = null;
    const list = Array.from(files);
    if (index === null ? photos.length + list.length > 5 : list.length !== 1) {
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
      if (index !== null) URL.revokeObjectURL(photos[index].url);
      setPhotos((old) =>
        index === null
          ? [...old, ...added]
          : old.map((p, i) => (i === index ? added[0] : p)),
      );
      setSelected(index ?? photos.length);
    } catch (e) {
      added.forEach((p) => URL.revokeObjectURL(p.url));
      setError((e as Error).message);
    } finally {
      setLoading(false);
      if (input.current) input.current.value = "";
    }
  }
  function pick(index: number | null) {
    replacement.current = index;
    if (input.current) {
      input.current.multiple = index === null;
      input.current.click();
    }
  }
  function move(delta: number) {
    const target = selected + delta;
    if (target < 0 || target >= photos.length) return;
    invalidate();
    setPhotos((old) => {
      const next = [...old];
      [next[selected], next[target]] = [next[target], next[selected]];
      return next;
    });
    setSelected(target);
  }
  function metrics() {
    const ps = [...pointers.current.values()];
    return {
      cx: ps.reduce((s, p) => s + p.x, 0) / ps.length,
      cy: ps.reduce((s, p) => s + p.y, 0) / ps.length,
      distance:
        ps.length > 1 ? Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y) : 0,
    };
  }
  function begin(index: number) {
    gesture.current = { index, t: { ...photos[index].t }, ...metrics() };
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
    if (sharing) return;
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
  return (
    <>
      <header>
        <a className="brand" href="./">
          <b>▦</b> 出品フォト <small>PHOTO COLLAGE</small>
        </a>
        <span>◉ 端末内で処理</span>
      </header>
      <main>
        <div className="intro">
          <small>かんたん、きれいに、出品準備。</small>
          <h1>写真をひとつに。</h1>
          <p>2〜5枚を選んで、並べて、保存するだけ。</p>
        </div>
        <div className="steps">
          01 写真を選ぶ <i>—</i> 02 かたちを選ぶ <i>—</i> 03 保存
        </div>
        <section className="workspace">
          <div className="preview-shell">
            {photos.length >= 2 ? (
              <canvas
                ref={canvas}
                aria-label="結合写真プレビュー。指で移動、2本指で拡大縮小"
                width="1000"
                height="1000"
                onPointerDown={(e) => {
                  if (pointers.current.size >= 2) return;
                  const b = e.currentTarget.getBoundingClientRect(),
                    x = (e.clientX - b.left) / b.width,
                    y = (e.clientY - b.top) / b.height;
                  const index = rects.findIndex(
                    (r) =>
                      x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h,
                  );
                  if (index < 0) return;
                  e.currentTarget.setPointerCapture(e.pointerId);
                  pointers.current.set(e.pointerId, { x, y });
                  const active = gesture.current?.index ?? index;
                  setSelected(active);
                  begin(active);
                }}
                onPointerMove={(e) => {
                  if (!pointers.current.has(e.pointerId) || !gesture.current)
                    return;
                  const b = e.currentTarget.getBoundingClientRect();
                  pointers.current.set(e.pointerId, {
                    x: (e.clientX - b.left) / b.width,
                    y: (e.clientY - b.top) / b.height,
                  });
                  const m = metrics(),
                    g = gesture.current,
                    zoom = Math.max(
                      1,
                      Math.min(
                        6,
                        g.t.zoom *
                          (g.distance && m.distance
                            ? m.distance / g.distance
                            : 1),
                      ),
                    );
                  invalidate();
                  setPhotos((old) =>
                    old.map((p, i) => {
                      if (i !== g.index) return p;
                      const r = rects[i],
                        pos = geometry(
                          p.image.naturalWidth,
                          p.image.naturalHeight,
                          r,
                          {
                            zoom,
                            x: g.t.x + m.cx - g.cx,
                            y: g.t.y + m.cy - g.cy,
                          },
                        );
                      return {
                        ...p,
                        t: {
                          zoom,
                          x: pos.x - (r.w - pos.w) / 2,
                          y: pos.y - (r.h - pos.h) / 2,
                        },
                      };
                    }),
                  );
                }}
                onPointerUp={(e) => {
                  pointers.current.delete(e.pointerId);
                  if (pointers.current.size && gesture.current)
                    begin(gesture.current.index);
                  else gesture.current = null;
                }}
                onPointerCancel={() => {
                  pointers.current.clear();
                  gesture.current = null;
                }}
              />
            ) : (
              <button
                className="empty"
                onClick={() => pick(null)}
                disabled={loading}
              >
                <span className="empty-art">▧ ＋</span>
                <strong>
                  {photos.length ? "もう1枚選びましょう" : "出品する写真を選ぶ"}
                </strong>
                <span>写真を2〜5枚、まとめて選択できます</span>
                <em>＋ 写真を選ぶ</em>
                <small>写真は外部に送信しません</small>
              </button>
            )}
            <span className="canvas-label">SQUARE · 1 : 1</span>
          </div>
          <p className="hint">
            {photos.length >= 2
              ? "☝ 写真を指で移動 · 2本指で拡大縮小"
              : "いつもの写真を、見やすい1枚に。"}
          </p>
        </section>
        <input
          ref={input}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => void load(e.target.files)}
        />
        <section className="panel">
          <div className="section-title">
            <h2>
              <span>01</span> 写真
            </h2>
            <small>{photos.length} / 5枚</small>
          </div>
          <div className="photos">
            {photos.map((p, i) => (
              <button
                key={p.id}
                className={`thumb ${selected === i ? "selected" : ""}`}
                aria-label={`写真${i + 1}を選択`}
                onClick={() => setSelected(i)}
              >
                <img src={p.url} alt={`選択した写真 ${i + 1}`} />
                <b>{i + 1}</b>
              </button>
            ))}
            {photos.length < 5 && (
              <button
                className="add-photo"
                disabled={loading}
                onClick={() => pick(null)}
              >
                <b>＋</b>
                <span>{loading ? "読込中…" : "追加"}</span>
              </button>
            )}
          </div>
          {photos.length > 0 && (
            <>
              <div className="photo-tools">
                <span>写真 {selected + 1}</span>
                <button onClick={() => pick(selected)} disabled={loading}>
                  差し替え
                </button>
                <button
                  onClick={() => move(-1)}
                  disabled={selected === 0 || loading}
                  aria-label="前に移動"
                >
                  ←
                </button>
                <button
                  onClick={() => move(1)}
                  disabled={selected === photos.length - 1 || loading}
                  aria-label="後ろに移動"
                >
                  →
                </button>
                <button
                  disabled={loading}
                  onClick={() => {
                    invalidate();
                    URL.revokeObjectURL(photos[selected].url);
                    setPhotos((p) => p.filter((_, i) => i !== selected));
                    setSelected(0);
                  }}
                >
                  削除
                </button>
              </div>
              <label className="slider">
                拡大
                <input
                  type="range"
                  min="1"
                  max="6"
                  step=".01"
                  value={photos[selected]?.t.zoom ?? 1}
                  onChange={(e) =>
                    transform({ ...photos[selected].t, zoom: +e.target.value })
                  }
                />
                <button onClick={() => transform(initialTransform())}>
                  リセット
                </button>
              </label>
            </>
          )}
        </section>
        <section className="panel">
          <div className="section-title">
            <h2>
              <span>02</span> レイアウト
            </h2>
            <small>タップで切り替え</small>
          </div>
          {choices.length ? (
            <div className="layouts">
              {choices.map((l) => (
                <button
                  key={l.id}
                  className={layout.id === l.id ? "chosen" : ""}
                  onClick={() => {
                    setLayoutId(l.id);
                    setPhotos((p) =>
                      p.map((v) => ({ ...v, t: initialTransform() })),
                    );
                    invalidate();
                  }}
                >
                  <svg viewBox="0 0 60 60" aria-hidden="true">
                    {rectangles(l, 0.055).map((r, i) => (
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
          ) : (
            <p className="muted">写真を2枚以上選ぶと表示されます</p>
          )}
        </section>
        <section className="panel">
          <div className="section-title">
            <h2>
              <span>03</span> 仕上げ
            </h2>
            <small>お好みで調整</small>
          </div>
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
                  className={bg === color ? "chosen" : ""}
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
        </section>
        <p className="privacy">
          ♧ 写真はこの端末の中だけで処理します。
          <br />
          登録不要・広告なし。色やロゴも、そのままに。
        </p>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {!result && saveNotice && (
          <p className="error" role="status">
            {saveNotice}
          </p>
        )}
      </main>
      <footer>
        <div>
          <strong>きれいな1枚で、出品しよう。</strong>
          <small>2000 × 2000 px · JPEG</small>
        </div>
        <button
          className="primary"
          disabled={photos.length < 2 || busy || loading || sharing}
          onClick={() => void save()}
        >
          {busy
            ? "画像を準備中…"
            : photos.length >= 2 && !ready
              ? "画像の作成を再試行"
              : "↓ 画像を保存"}
        </button>
      </footer>
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
    </>
  );
}
