import { test, expect } from "@playwright/test";
test("mobile photo workflow exports 2000px JPEG and works offline", async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const outgoing: string[] = [];
  page.on("request", (r) => {
    if (
      !r.url().startsWith("http://127.0.0.1:4173") &&
      !r.url().startsWith("blob:") &&
      !r.url().startsWith("data:")
    )
      outgoing.push(r.url());
  });
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "↓ 画像を保存" }),
  ).toBeDisabled();
  const image = (color: string) => ({
    name: `${color}.svg`,
    mimeType: "image/svg+xml",
    buffer: Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><rect width="100" height="100" fill="${color}"/><rect x="100" width="100" height="100" fill="white"/></svg>`,
    ),
  });
  await page
    .locator("input[type=file]")
    .setInputFiles([image("red"), image("blue"), image("green")]);
  await expect(
    page.getByRole("button", { name: "上1＋下2", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".thumb")).toHaveCount(3);
  for (const label of ["上1＋下2", "左1＋右2", "縦3分割", "横3分割"])
    await page.getByRole("button", { name: label, exact: true }).click();
  await page.getByRole("button", { name: "写真3を選択", exact: true }).click();
  await page.getByRole("button", { name: "前に移動", exact: true }).click();
  await page.getByRole("button", { name: "差し替え", exact: true }).click();
  await page.locator("input[type=file]").setInputFiles(image("purple"));
  await page.locator("input[type=range]").first().fill("2");
  const c = page.locator("canvas"),
    box = (await c.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.6);
  await page.mouse.up();
  await page.getByRole("button", { name: "黒", exact: true }).click();
  await page.getByRole("button", { name: "↓ 画像を保存" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  const exported = await page.locator(".modal img").evaluate(async (el) => {
    const img = el as HTMLImageElement;
    await img.decode();
    const blob = await fetch(img.src).then((r) => r.blob());
    return {
      width: img.naturalWidth,
      height: img.naturalHeight,
      type: blob.type,
      size: blob.size,
    };
  });
  expect(exported.width).toBe(2000);
  expect(exported.height).toBe(2000);
  expect(exported.type).toBe("image/jpeg");
  expect(exported.size).toBeGreaterThan(1000);
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "JPEGをダウンロード" }).click();
  expect((await download).suggestedFilename()).toMatch(/\.jpg$/);
  await page.getByRole("button", { name: "編集に戻る" }).click();
  await page.getByRole("button", { name: "削除", exact: true }).click();
  await expect(page.locator(".thumb")).toHaveCount(2);
  await page.getByRole("button", { name: "＋ 追加", exact: true }).click();
  await page
    .locator("input[type=file]")
    .setInputFiles([image("pink"), image("yellow"), image("orange")]);
  await expect(page.locator(".thumb")).toHaveCount(5);
  for (const label of ["上2＋下3", "上3＋下2", "上1＋下4"])
    await page.getByRole("button", { name: label, exact: true }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "test-results/mobile.png", fullPage: true });
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "写真をひとつに。" }),
  ).toBeVisible();
  expect(errors).toEqual([]);
  expect(outgoing).toEqual([]);
});
test("rejects over five photos and invalid images", async ({ page }) => {
  await page.goto("/");
  const files = Array.from({ length: 6 }, (_, i) => ({
    name: `${i}.png`,
    mimeType: "image/png",
    buffer: Buffer.from("bad"),
  }));
  await page.locator("input[type=file]").setInputFiles(files);
  await expect(page.getByRole("alert")).toContainText("合計5枚");
  await page.locator("input[type=file]").setInputFiles(files.slice(0, 2));
  await expect(page.getByRole("alert")).toContainText("読み込めない");
  await expect(page.locator(".thumb")).toHaveCount(0);
});
test("two touch points zoom a photo and reset restores its scale", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await page
    .locator("input[type=file]")
    .setInputFiles(["public/icon-192.png", "public/icon-512.png"]);
  await expect(page.locator("canvas")).toBeVisible();
  await page.locator("canvas").scrollIntoViewIfNeeded();
  const b = (await page.locator("canvas").boundingBox())!;
  const client = await context.newCDPSession(page);
  const x = b.x + b.width / 2,
    y = b.y + b.height / 4;
  const touch = (id: number, x: number, y: number) => ({
    id,
    x,
    y,
    radiusX: 4,
    radiusY: 4,
    force: 1,
  });
  await client.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [touch(1, x - 20, y)],
  });
  await client.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [touch(1, x - 20, y), touch(2, x + 20, y)],
  });
  await client.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [touch(1, x - 45, y), touch(2, x + 45, y)],
  });
  await client.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await expect
    .poll(
      async () =>
        +(await page.locator("input[type=range]").first().inputValue()),
    )
    .toBeGreaterThan(1.5);
  await page.getByRole("button", { name: "リセット", exact: true }).click();
  await expect(page.locator("input[type=range]").first()).toHaveValue("1");
  expect(
    await page
      .locator("canvas")
      .evaluate((e) => getComputedStyle(e).touchAction),
  ).toBe("none");
});
