import { test, expect } from "@playwright/test";
const picture = (name: string) => ({
  name: `${name}.svg`,
  mimeType: "image/svg+xml",
  buffer: Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><rect width="100" height="100" fill="#e02020"/><rect x="100" width="100" height="100" fill="#2040e0"/></svg>',
  ),
});

test("per-photo rotation, free pan and shrinking are clipped and match JPEG export", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .locator("input[type=file]")
    .setInputFiles([picture("a"), picture("b")]);
  await page.getByRole("tab", { name: "調整", exact: true }).click();
  const lower = () =>
    page.locator("canvas").evaluate((e) => {
      const c = e as HTMLCanvasElement;
      return [
        ...c.getContext("2d")!.getImageData(100, 600, 800, 300).data,
      ].reduce((sum, v) => sum + v, 0);
    });
  const untouched = await lower();
  await page.getByRole("slider", { name: "拡大", exact: true }).fill("0.3");
  await page.getByRole("slider", { name: "回転角度" }).fill("37");
  const b = (await page.locator("canvas").boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 4);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width * 0.65, b.y + b.height * 0.35);
  await page.mouse.up();
  expect(await lower()).toBe(untouched);
  await page.getByRole("button", { name: "写真2を選択", exact: true }).click();
  await expect(page.getByRole("slider", { name: "回転角度" })).toHaveValue("0");
  await expect(
    page.getByRole("slider", { name: "拡大", exact: true }),
  ).toHaveValue("1");
  await page.getByRole("button", { name: "写真1を選択", exact: true }).click();
  await expect(page.getByRole("slider", { name: "回転角度" })).toHaveValue(
    "37",
  );
  await expect(
    page.getByRole("slider", { name: "拡大", exact: true }),
  ).toHaveValue("0.3");
  await page.getByRole("tab", { name: "枠線・余白" }).click();
  await page.getByRole("button", { name: "グレー", exact: true }).click();
  const preview = await page.locator("canvas").evaluate((e) => {
    const ctx = (e as HTMLCanvasElement).getContext("2d")!;
    return Array.from({ length: 81 }, (_, i) => {
      const x = 50 + (i % 9) * 100,
        y = 50 + Math.floor(i / 9) * 100;
      return { x, y, rgba: [...ctx.getImageData(x, y, 1, 1).data] };
    });
  });
  expect(preview[0].rgba.slice(0, 3)).toEqual([213, 213, 213]);
  await page.getByRole("button", { name: "保存", exact: true }).click();
  const exported = await page
    .locator(".modal img")
    .evaluate(async (e, points) => {
      const img = e as HTMLImageElement;
      await img.decode();
      const c = document.createElement("canvas");
      c.width = c.height = 2000;
      const ctx = c.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      return {
        w: img.naturalWidth,
        h: img.naturalHeight,
        pixels: points.map((p) => [
          ...ctx.getImageData(p.x * 2, p.y * 2, 1, 1).data,
        ]),
      };
    }, preview);
  expect([exported.w, exported.h]).toEqual([2000, 2000]);
  for (let i = 0; i < preview.length; i++)
    for (let c = 0; c < 3; c++)
      expect(Math.abs(exported.pixels[i][c] - preview[i].rgba[c])).toBeLessThan(
        25,
      );
  await page.getByRole("button", { name: "編集に戻る" }).click();
  await page.getByRole("tab", { name: "調整", exact: true }).click();
  await page.getByRole("button", { name: "90°回転", exact: true }).click();
  await expect(page.getByRole("slider", { name: "回転角度" })).toHaveValue(
    "127",
  );
  await page.getByRole("slider", { name: "回転角度" }).fill("-180");
  await expect(page.getByRole("slider", { name: "回転角度" })).toHaveValue(
    "-180",
  );
  await page.getByRole("slider", { name: "回転角度" }).fill("180");
  await expect(page.getByRole("slider", { name: "回転角度" })).toHaveValue(
    "180",
  );
  await page.getByRole("button", { name: "リセット", exact: true }).click();
  await expect(page.getByRole("slider", { name: "回転角度" })).toHaveValue("0");
  await expect(
    page.getByRole("slider", { name: "拡大", exact: true }),
  ).toHaveValue("1");
});

test("combined two-finger gesture rebases without jumps when a finger lifts", async ({
  page,
  context,
}) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.toBlob;
    Object.assign(window, { encodes: 0 });
    HTMLCanvasElement.prototype.toBlob = function (...args) {
      (window as unknown as { encodes: number }).encodes++;
      return original.apply(this, args);
    };
  });
  await page.goto("/");
  await page
    .locator("input[type=file]")
    .setInputFiles([picture("a"), picture("b")]);
  await page.getByRole("tab", { name: "調整", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "保存", exact: true }),
  ).toBeEnabled();
  const encodes = await page.evaluate(
    () => (window as unknown as { encodes: number }).encodes,
  );
  let pickers = 0;
  page.on("filechooser", () => pickers++);
  const b = (await page.locator("canvas").boundingBox())!,
    x = b.x + b.width / 2,
    y = b.y + b.height / 4;
  const client = await context.newCDPSession(page);
  const p = (id: number, x: number, y: number) => ({
    id,
    x,
    y,
    radiusX: 4,
    radiusY: 4,
    force: 1,
  });
  await client.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [p(1, x - 20, y)],
  });
  await client.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [p(1, x - 20, y), p(2, x + 20, y)],
  });
  await client.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [p(1, x + 15, y - 30), p(2, x + 65, y + 30)],
  });
  await expect
    .poll(
      async () =>
        +(await page
          .getByRole("slider", { name: "拡大", exact: true })
          .inputValue()),
    )
    .toBeGreaterThan(1.8);
  const angle = +(await page
    .getByRole("slider", { name: "回転角度" })
    .inputValue());
  expect(angle).toBeGreaterThan(45);
  expect(angle).toBeLessThan(55);
  await page.waitForTimeout(250);
  expect(
    await page.evaluate(
      () => (window as unknown as { encodes: number }).encodes,
    ),
  ).toBe(encodes);
  const snapshot = () =>
    page
      .locator("canvas")
      .evaluate((e) => (e as HTMLCanvasElement).toDataURL());
  const before = await snapshot();
  await client.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [p(1, x + 15, y - 30)],
  });
  await expect.poll(snapshot).toBe(before);
  await client.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [p(2, x + 90, y + 30)],
  });
  await expect.poll(async () => (await snapshot()) !== before).toBe(true);
  await expect(page.getByRole("slider", { name: "回転角度" })).toHaveValue(
    String(angle),
  );
  await client.send("Input.dispatchTouchEvent", {
    type: "touchCancel",
    touchPoints: [],
  });
  await client.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [p(3, x, y)],
  });
  await client.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [p(3, x - 20, y)],
  });
  await client.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  expect(pickers).toBe(0);
  expect(await page.evaluate(() => scrollY)).toBe(0);
  await expect(page.getByRole("slider", { name: "回転角度" })).toHaveValue(
    String(angle),
  );
});
