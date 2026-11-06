import { initialTransform, type Photo } from "./model";
export async function loadPhoto(file: File): Promise<Photo> {
  // Native decoders apply EXIF orientation and support HEIC when the OS/browser does.
  if (file.size > 60 * 1024 * 1024)
    throw new Error("1枚60MB以下の写真を選んでください。");
  const url = URL.createObjectURL(file),
    img = new Image();
  try {
    img.src = url;
    await img.decode();
    if (!img.naturalWidth) throw new Error();
    const canvas = document.createElement("canvas"),
      k = Math.min(1, 2400 / Math.max(img.naturalWidth, img.naturalHeight));
    canvas.width = Math.max(1, Math.round(img.naturalWidth * k));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * k));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error();
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return { id: crypto.randomUUID(), image: canvas, t: initialTransform() };
  } catch {
    throw new Error(
      "写真を読み込めません。HEICが開けない場合はJPEGまたはPNGで選び直してください。",
    );
  } finally {
    URL.revokeObjectURL(url);
    img.src = "";
  }
}
export function dispose(p: Photo | null) {
  if (p) p.image.width = p.image.height = 1;
}
