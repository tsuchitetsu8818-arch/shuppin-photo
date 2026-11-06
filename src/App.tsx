import { useEffect, useMemo, useRef, useState } from "react";
import { EditorCanvas } from "./EditorCanvas";
import {
  initialTransform,
  layouts,
  swap,
  type Photo,
  type Settings,
  type Transform,
  type Layout,
} from "./model";
import { loadPhoto, dispose } from "./photos";
import { encode } from "./render";
const defaults: Settings = {
  background: "#ffffff",
  margin: 3,
  gap: 3,
  radius: 0,
};
function LayoutIcon({ layout }: { layout: Layout }) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      {layout.cells.map((r, i) => (
        <rect
          key={i}
          x={r.x * 44 + 2}
          y={r.y * 44 + 2}
          width={r.w * 44 - 3}
          height={r.h * 44 - 3}
          rx="2"
        />
      ))}
    </svg>
  );
}
function Slider({
  label,
  value,
  min = 0,
  max,
  step = 1,
  onChange,
  unit = "",
}: {
  label: string;
  value: number;
  min?: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  unit?: string;
}) {
  return (
    <label className="slider">
      <span>{label}</span>
      <input
        aria-label={label}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(+e.target.value)}
      />
      <output>
        {Math.round(value * 100) / 100}
        {unit}
      </output>
    </label>
  );
}
export default function App() {
  const [photos, setPhotos] = useState<(Photo | null)[]>([null, null]),
    [layoutId, setLayoutId] = useState("2tb"),
    [selected, setSelected] = useState(0),
    [settings, setSettings] = useState(defaults),
    [tab, setTab] = useState("layout"),
    [busy, setBusy] = useState(false),
    [active, setActive] = useState(false),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0),
    [sharing, setSharing] = useState(false),
    [saveOpen, setSaveOpen] = useState(false),
    [notice, setNotice] = useState(""),
    [result, setResult] = useState<{
      file: File;
      url: string;
    } | null>(null),
    [confirm, setConfirm] = useState<"new" | "batch" | null>(null),
    [swapMode, setSwapMode] = useState(false),
    [prepared, setPrepared] = useState<{
      revision: object;
      file: File;
    } | null>(null);
  const batch = useRef<HTMLInputElement>(null),
    single = useRef<HTMLInputElement>(null),
    target = useRef(0),
    photoRef = useRef(photos),
    resultRef = useRef(result);
  photoRef.current = photos;
  resultRef.current = result;
  const count = photos.length,
    layout = layouts[count].find((l) => l.id === layoutId) ?? layouts[count][0],
    hasPhotos = photos.some(Boolean),
    complete = photos.every(Boolean),
    photo = photos[selected];
  const revision = useMemo(
    () => ({ photos, layout, settings }),
    [photos, layout, settings],
  );
  useEffect(
    () => () => {
      photoRef.current.forEach(dispose);
      if (resultRef.current) URL.revokeObjectURL(resultRef.current.url);
    },
    [],
  );
  useEffect(() => {
    let cancelled = false;
    setPrepared(null);
    if (!complete || busy || active) return;
    const timer = setTimeout(() => {
      encode(photos, layout, settings)
        .then((file) => {
          if (!cancelled) setPrepared({ revision, file });
        })
        .catch((e) => {
          if (!cancelled) setError(e.message + "「再作成」で試してください。");
        });
    }, 180);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [revision, active, busy, retry]);
  useEffect(() => {
    const unload = (e: BeforeUnloadEvent) => {
      if (photoRef.current.some(Boolean)) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", unload);
    return () => window.removeEventListener("beforeunload", unload);
  }, []);
  function chooseBatch() {
    if (hasPhotos) setConfirm("batch");
    else batch.current?.click();
  }
  function select(n: number) {
    if (swapMode) {
      setPhotos((ps) => swap(ps, selected, n));
      setSwapMode(false);
    }
    setSelected(n);
  }
  function edit(t: Partial<Transform>) {
    setPhotos((ps) =>
      ps.map((p, i) =>
        p && i === selected ? { ...p, t: { ...p.t, ...t } } : p,
      ),
    );
  }
  async function read(files: FileList | null, isBatch: boolean) {
    if (!files?.length) return;
    const fs = Array.from(files);
    if (isBatch && (fs.length < 2 || fs.length > 5)) {
      setError("写真は2〜5枚まとめて選んでください（最大5枚）。");
      return;
    }
    setBusy(true);
    setError("");
    const next: Photo[] = [];
    try {
      for (const f of fs) next.push(await loadPhoto(f));
      if (isBatch) {
        photoRef.current.forEach(dispose);
        setPhotos(next);
        setLayoutId(layouts[next.length][0].id);
        setSelected(0);
      } else {
        const i = target.current;
        dispose(photoRef.current[i]);
        setPhotos((ps) => ps.map((p, j) => (j === i ? next[0] : p)));
        setSelected(i);
      }
      setSwapMode(false);
    } catch (e) {
      next.forEach(dispose);
      setError(e instanceof Error ? e.message : "写真を読み込めませんでした。");
    } finally {
      setBusy(false);
    }
  }
  function pickSingle(i: number) {
    target.current = i;
    single.current?.click();
  }
  function showResult(file: File) {
    if (result) URL.revokeObjectURL(result.url);
    setResult({ file, url: URL.createObjectURL(file) });
    setSaveOpen(true);
  }
  function share(file: File) {
    setSharing(true);
    setNotice("");
    let promise: Promise<void>;
    try {
      if (!navigator.canShare?.({ files: [file] }) || !navigator.share) {
        setNotice(
          "完成画像を長押しして「写真に保存」、またはJPEGをダウンロードしてください。",
        );
        setSharing(false);
        return;
      }
      promise = navigator.share({ files: [file] });
    } catch {
      setNotice(
        "共有を開けませんでした。画像の長押し保存かダウンロードをお試しください。",
      );
      setSharing(false);
      return;
    }
    promise
      .then(() =>
        setNotice("共有画面を閉じました。必要に応じてもう一度保存できます。"),
      )
      .catch((e) =>
        setNotice(
          e?.name === "AbortError"
            ? "共有をキャンセルしました。完成画像は残っています。"
            : "共有に失敗しました。再試行、または画像の長押し保存ができます。",
        ),
      )
      .finally(() => setSharing(false));
  }
  function save() {
    if (!prepared || prepared.revision !== revision || sharing) return;
    const file = prepared.file;
    share(file);
    showResult(file);
  }
  function confirmAction() {
    const action = confirm;
    setConfirm(null);
    if (action === "batch") {
      batch.current?.click();
    } else {
      photos.forEach(dispose);
      setPhotos([null, null]);
      setLayoutId("2tb");
      setSelected(0);
      setSettings(defaults);
      setError("");
      setSwapMode(false);
    }
  }
  return (
    <main className="app">
      <header>
        <button
          className="new-button"
          aria-label="新規作成"
          onClick={() => (hasPhotos ? setConfirm("new") : undefined)}
        >
          ＋<span>新規</span>
        </button>
        <h1>
          出品フォト<span className="version">1.0</span>
        </h1>
        <button
          className="save primary"
          aria-label="保存"
          onClick={save}
          disabled={
            !prepared ||
            prepared.revision !== revision ||
            busy ||
            active ||
            sharing
          }
        >
          <svg aria-hidden="true" viewBox="0 0 20 20" width="16" height="16">
            <path
              d="M10 13V2m-4 4 4-4 4 4M3 12v5h14v-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          {complete
            ? prepared?.revision === revision
              ? "保存"
              : "準備中"
            : "保存"}
        </button>
      </header>
      <div className="workspace">
        <div className="canvas-meta">
          <span>
            <i />{" "}
            {hasPhotos
              ? "写真をタップして調整"
              : "写真を選んで、すぐコラージュ"}
          </span>
          <span>1 : 1</span>
        </div>
        <section className="stage" aria-label="編集エリア">
          <EditorCanvas
            photos={photos}
            layout={layout}
            settings={settings}
            selected={selected}
            onSelect={select}
            onEmpty={pickSingle}
            onGesture={setActive}
            onTransform={(i, t) =>
              setPhotos((ps) =>
                ps.map((p, j) => (p && i === j ? { ...p, t } : p)),
              )
            }
          />
          {!hasPhotos && (
            <div className="welcome">
              <div className="collage-mark">
                <span />
                <span />
                <span />
              </div>
              <h2>ぱっと、ひとまとめ。</h2>
              <p>
                出品写真を選ぶだけ。
                <br />
                ちょうどいい1枚に。
              </p>
              <button className="primary choose" onClick={chooseBatch}>
                ＋ 写真を選ぶ
              </button>
              <small>2〜5枚をまとめて選択</small>
            </div>
          )}
          {busy && (
            <div className="loading" role="status">
              写真を読み込み中…
            </div>
          )}
        </section>
        <div className="under-canvas">
          <span>
            {hasPhotos
              ? swapMode
                ? "入れ替え先の写真をタップ"
                : "ドラッグで移動 · 2本指で拡大・回転"
              : "画像は端末内だけで処理します"}
          </span>
          <span className="resolution">2000px JPEG</span>
        </div>
      </div>
      <section className="tools">
        <div className="tabs" role="tablist" aria-label="編集メニュー">
          {[
            ["layout", "▦", "レイアウト"],
            ["space", "▣", "余白"],
            ["adjust", "☷", "調整"],
          ].map(([id, icon, name]) => (
            <button
              role="tab"
              aria-selected={tab === id}
              key={id}
              onClick={() => setTab(id)}
            >
              <b aria-hidden="true">{icon}</b>
              {name}
            </button>
          ))}
        </div>
        <div
          className="tool-content"
          role="tabpanel"
          aria-label={
            tab === "layout" ? "レイアウト" : tab === "space" ? "余白" : "調整"
          }
        >
          {tab === "layout" && (
            <>
              <div className="tool-heading">
                <strong>レイアウト</strong>
                <span>{count}枚の写真にぴったり</span>
              </div>
              <div className="layout-list">
                {layouts[count].map((l) => (
                  <button
                    key={l.id}
                    aria-label={l.name}
                    aria-pressed={l.id === layout.id}
                    className={
                      "layout-choice " + (l.id === layout.id ? "chosen" : "")
                    }
                    onClick={() => setLayoutId(l.id)}
                  >
                    <LayoutIcon layout={l} />
                    <span>{l.name}</span>
                  </button>
                ))}
              </div>
              <p className="tool-note">
                配置を変えても、写真の調整はそのまま。
              </p>
            </>
          )}
          {tab === "space" && (
            <>
              <div className="colors">
                <strong>背景</strong>
                {[
                  ["白", "#ffffff"],
                  ["黒", "#171717"],
                  ["グレー", "#d5d5d5"],
                ].map(([name, color]) => (
                  <button
                    key={name}
                    aria-pressed={settings.background === color}
                    onClick={() =>
                      setSettings((s) => ({ ...s, background: color }))
                    }
                  >
                    <i style={{ background: color }} />
                    {name}
                  </button>
                ))}
              </div>
              <Slider
                label="外側の余白"
                value={settings.margin}
                max={20}
                unit="px"
                onChange={(margin) => setSettings((s) => ({ ...s, margin }))}
              />
              <Slider
                label="枠の隙間"
                value={settings.gap}
                max={20}
                unit="px"
                onChange={(gap) => setSettings((s) => ({ ...s, gap }))}
              />
              <Slider
                label="角丸"
                value={settings.radius}
                max={30}
                unit="px"
                onChange={(radius) => setSettings((s) => ({ ...s, radius }))}
              />
            </>
          )}
          {tab === "adjust" && (
            <>
              <div className="photo-strip">
                {photos.map((p, i) => (
                  <button
                    key={i}
                    aria-label={`写真${i + 1}を選択`}
                    aria-pressed={selected === i}
                    onClick={() => select(i)}
                    className={selected === i ? "chosen" : ""}
                  >
                    {i + 1}
                    {!p && " ＋"}
                  </button>
                ))}
                <span>
                  {swapMode ? "入れ替え先を選択" : `写真${selected + 1}を調整`}
                </span>
              </div>
              {photo ? (
                <>
                  <Slider
                    label="拡大率"
                    value={photo.t.zoom}
                    min={0.001}
                    max={6}
                    step={0.001}
                    unit="×"
                    onChange={(zoom) => edit({ zoom })}
                  />
                  <Slider
                    label="回転角度"
                    value={photo.t.angle}
                    min={-180}
                    max={180}
                    step={0.1}
                    unit="°"
                    onChange={(angle) => edit({ angle })}
                  />
                  <div className="actions">
                    <button
                      onClick={() =>
                        edit({ angle: ((photo.t.angle + 270) % 360) - 180 })
                      }
                    >
                      90°回転
                    </button>
                    <button onClick={() => edit(initialTransform())}>
                      リセット
                    </button>
                    <button
                      aria-pressed={swapMode}
                      onClick={() => setSwapMode(!swapMode)}
                    >
                      入れ替え
                    </button>
                    <button onClick={() => pickSingle(selected)}>
                      差し替え
                    </button>
                    <button
                      className="danger"
                      onClick={() => {
                        dispose(photo);
                        setPhotos((ps) =>
                          ps.map((p, i) => (i === selected ? null : p)),
                        );
                      }}
                    >
                      削除
                    </button>
                  </div>
                </>
              ) : (
                <div className="add-slot">
                  <button onClick={() => pickSingle(selected)}>
                    ＋ この枠に写真を追加
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </section>
      <footer>
        <button className="batch-button" disabled={busy} onClick={chooseBatch}>
          ＋ {hasPhotos ? "写真をまとめて選び直す" : "写真を選ぶ"}
          <small>2〜5枚</small>
        </button>
        <p>
          広告なし <span>·</span> ログイン不要 <span>·</span> 外部送信なし
        </p>
      </footer>
      {error && (
        <div className="error" role="alert">
          <span>{error}</span>
          {complete && (
            <button
              onClick={() => {
                setError("");
                setRetry((n) => n + 1);
              }}
            >
              再作成
            </button>
          )}
          <button aria-label="案内を閉じる" onClick={() => setError("")}>
            ×
          </button>
        </div>
      )}
      <input
        ref={batch}
        aria-label="写真をまとめて選択"
        type="file"
        accept="image/*,.heic,.heif"
        multiple
        hidden
        onChange={(e) => {
          void read(e.target.files, true);
          e.target.value = "";
        }}
      />
      <input
        ref={single}
        aria-label="写真を個別に選択"
        type="file"
        accept="image/*,.heic,.heif"
        hidden
        onChange={(e) => {
          void read(e.target.files, false);
          e.target.value = "";
        }}
      />
      {confirm && (
        <div className="modal-backdrop">
          <section
            className="dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
          >
            <h2 id="confirm-title">
              {confirm === "new"
                ? "新しく作成しますか？"
                : "写真を選び直しますか？"}
            </h2>
            <p>
              {confirm === "new"
                ? "編集中の写真と調整内容を消去します。"
                : "新しい写真を読み込めた後に、現在の写真と調整内容を置き換えます。選択をキャンセルすると編集は残ります。"}
            </p>
            <button className="primary" autoFocus onClick={confirmAction}>
              {confirm === "new" ? "新しく作成" : "写真を選び直す"}
            </button>
            <button onClick={() => setConfirm(null)}>編集を続ける</button>
          </section>
        </div>
      )}
      {saveOpen && result && (
        <div className="modal-backdrop">
          <section
            className="dialog result"
            role="dialog"
            aria-modal="true"
            aria-labelledby="result-title"
          >
            <h2 id="result-title">完成しました</h2>
            <p>2000 × 2000px · 高画質JPEG</p>
            <img
              src={result.url}
              alt="保存用の完成画像。長押しで保存できます"
            />
            <p role="status">
              {notice || "共有画面の「画像を保存」を選んでください。"}
            </p>
            <button
              className="primary"
              disabled={sharing}
              onClick={() => share(result.file)}
            >
              もう一度共有する
            </button>
            <a href={result.url} download="shuppin-photo.jpg">
              JPEGをダウンロード
            </a>
            <button onClick={() => setSaveOpen(false)}>編集に戻る</button>
          </section>
        </div>
      )}
    </main>
  );
}
