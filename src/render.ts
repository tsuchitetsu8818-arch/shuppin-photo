import { frames, type Layout, type Photo, type Settings } from "./model";
export function draw(
  canvas: HTMLCanvasElement,
  photos: (Photo | null)[],
  layout: Layout,
  settings: Settings,
  size: number,
) {
  if (canvas.width !== size) canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("画像を描画できません。");
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = settings.background;
  ctx.fillRect(0, 0, size, size);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  frames(layout, settings).forEach((r, i) => {
    const p = photos[i];
    if (!p) return;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(
      r.x * size,
      r.y * size,
      r.w * size,
      r.h * size,
      Math.min(settings.radius / 360, r.w / 2, r.h / 2) * size,
    );
    ctx.clip();
    const scale =
      Math.max(r.w / p.image.width, r.h / p.image.height) * p.t.zoom;
    ctx.translate(
      (r.x + r.w / 2 + p.t.x) * size,
      (r.y + r.h / 2 + p.t.y) * size,
    );
    ctx.rotate((p.t.angle * Math.PI) / 180);
    ctx.drawImage(
      p.image,
      (-p.image.width * scale * size) / 2,
      (-p.image.height * scale * size) / 2,
      p.image.width * scale * size,
      p.image.height * scale * size,
    );
    ctx.restore();
  });
}
export async function encode(
  photos: (Photo | null)[],
  layout: Layout,
  settings: Settings,
): Promise<File> {
  const canvas = document.createElement("canvas");
  draw(canvas, photos, layout, settings, 2000);
  try {
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) =>
          b ? resolve(b) : reject(new Error("JPEGを作成できませんでした。")),
        "image/jpeg",
        0.95,
      ),
    );
    return new File([blob], "shuppin-photo.jpg", { type: "image/jpeg" });
  } finally {
    canvas.width = canvas.height = 1;
  }
}
