import { test, expect } from "@playwright/test";
const files = ["public/icon-192.png", "public/icon-512.png"];
test("empty slots open picker for that slot, replacing never opens on drag", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "保存", exact: true }),
  ).toBeDisabled();
  for (const i of [2, 1]) {
    const picker = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: `枠${i}に写真を追加` }).click();
    const chooser = await picker;
    expect(chooser.isMultiple()).toBe(false);
    await chooser.setFiles(files[i - 1]);
    await expect(
      page.getByRole("button", { name: `枠${i}に写真を追加` }),
    ).toHaveCount(0);
  }
  await expect(
    page.getByRole("button", { name: "保存", exact: true }),
  ).toBeEnabled();
  let pickerCount = 0;
  page.on("filechooser", () => pickerCount++);
  const b = (await page.locator("canvas").boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 4);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2 + 20, b.y + b.height / 4 + 10);
  await page.mouse.up();
  expect(pickerCount).toBe(0);
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "写真を差し替え" }).click();
  await (await chooser).setFiles(files[1]);
  await expect(
    page.getByRole("button", { name: "保存", exact: true }),
  ).toBeEnabled();
});

test("layouts and count changes keep all photos and their transforms", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .locator("input[type=file]")
    .setInputFiles([...files, ...files, files[0]]);
  await expect(
    page.getByRole("button", { name: "5枚", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("tab", { name: "調整", exact: true }).click();
  const before = await page
    .locator(".thumb img")
    .evaluateAll((es) => es.map((e) => (e as HTMLImageElement).src));
  await page.getByRole("slider", { name: "拡大", exact: true }).fill("2");
  await page.getByRole("tab", { name: "レイアウト", exact: true }).click();
  for (const name of ["上2＋下3", "上3＋下2", "上1＋下4"])
    await page.getByRole("button", { name, exact: true }).click();
  await page.getByRole("button", { name: "2枚", exact: true }).click();
  await expect(page.getByText("枠の外に3枚保持中")).toBeVisible();
  await expect(page.locator(".slot")).toHaveCount(2);
  for (const name of ["上下", "左右"])
    await page.getByRole("button", { name, exact: true }).click();
  await page.getByRole("button", { name: "3枚", exact: true }).click();
  for (const name of ["上1＋下2", "左1＋右2", "縦3分割", "横3分割"])
    await page.getByRole("button", { name, exact: true }).click();
  await page.getByRole("button", { name: "4枚", exact: true }).click();
  for (const name of ["2 × 2", "上1＋下3"])
    await page.getByRole("button", { name, exact: true }).click();
  await page.getByRole("button", { name: "5枚", exact: true }).click();
  await page.getByRole("tab", { name: "調整", exact: true }).click();
  expect(
    await page
      .locator(".thumb img")
      .evaluateAll((es) => es.map((e) => (e as HTMLImageElement).src)),
  ).toEqual(before);
  await expect(
    page.getByRole("slider", { name: "拡大", exact: true }),
  ).toHaveValue("2");
  await page.getByRole("button", { name: "後ろに移動" }).click();
  const after = await page
    .locator(".thumb img")
    .evaluateAll((es) => es.map((e) => (e as HTMLImageElement).src));
  expect(after[1]).toBe(before[0]);
  await page.getByRole("button", { name: "削除", exact: true }).click();
  await expect(page.locator(".empty-slot")).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "保存", exact: true }),
  ).toBeDisabled();
});

for (const [width, height] of [
  [320, 568],
  [375, 667],
  [390, 844],
  [430, 932],
])
  test(`editor fits ${width}x${height}, only layout strip scrolls`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    await page.getByRole("button", { name: "3枚", exact: true }).click();
    for (const tab of ["レイアウト", "枠線・余白", "調整"]) {
      await page.getByRole("tab", { name: tab, exact: true }).click();
      expect(
        await page.evaluate(
          ({ width, height }) => ({
            horizontal: document.documentElement.scrollWidth <= width,
            vertical: document.documentElement.scrollHeight <= height,
          }),
          { width, height },
        ),
      ).toEqual({ horizontal: true, vertical: true });
      const b = (await page
        .getByRole("button", { name: "保存", exact: true })
        .boundingBox())!;
      expect(b.y + b.height).toBeLessThanOrEqual(height);
      const menu = (await page
        .getByRole("tab", { name: tab, exact: true })
        .boundingBox())!;
      expect(menu.y + menu.height).toBeLessThanOrEqual(height);
    }
    await page.getByRole("tab", { name: "レイアウト", exact: true }).click();
    const strip = page.locator(".layouts");
    const overflows = await strip.evaluate(
      (e) => e.scrollWidth > e.clientWidth,
    );
    expect(overflows).toBe(width < 404);
    if (overflows) {
      await strip.evaluate((e) => (e.scrollLeft = e.scrollWidth));
      expect(await strip.evaluate((e) => e.scrollLeft)).toBeGreaterThan(0);
    }
    await page.getByRole("button", { name: "横3分割", exact: true }).click();
    await page.screenshot({ path: `test-results/editor-${width}.png` });
  });

test("two touch points zoom and reset without opening a picker", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await page.locator("input[type=file]").setInputFiles(files);
  await page.getByRole("tab", { name: "調整", exact: true }).click();
  let pickers = 0;
  page.on("filechooser", () => pickers++);
  const b = (await page.locator("canvas").boundingBox())!,
    x = b.x + b.width / 2,
    y = b.y + b.height / 4;
  const client = await context.newCDPSession(page);
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
        +(await page
          .getByRole("slider", { name: "拡大", exact: true })
          .inputValue()),
    )
    .toBeGreaterThan(1.5);
  expect(pickers).toBe(0);
  await page.getByRole("button", { name: "リセット", exact: true }).click();
  await expect(
    page.getByRole("slider", { name: "拡大", exact: true }),
  ).toHaveValue("1");
});

test("JPEG download, offline startup, and no external requests", async ({
  page,
  context,
}) => {
  const errors: string[] = [],
    external: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    if (!/^(http:\/\/127\.0\.0\.1:4173|blob:|data:)/.test(r.url()))
      external.push(r.url());
  });
  await page.goto("/");
  await page.locator("input[type=file]").setInputFiles(files);
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  const img = page.locator(".modal img");
  expect(
    await img.evaluate(async (e) => {
      const i = e as HTMLImageElement;
      await i.decode();
      return [
        i.naturalWidth,
        i.naturalHeight,
        (await fetch(i.src).then((r) => r.blob())).type,
      ];
    }),
  ).toEqual([2000, 2000, "image/jpeg"]);
  const pending = page.waitForEvent("download");
  await page.getByRole("link", { name: "JPEGをダウンロード" }).click();
  expect((await pending).suggestedFilename()).toMatch(/\.jpg$/);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "枠1に写真を追加" }),
  ).toBeVisible();
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
});

test("invalid and excess photos do not overwrite slots", async ({ page }) => {
  await page.goto("/");
  const bad = {
    name: "bad.png",
    mimeType: "image/png",
    buffer: Buffer.from("bad"),
  };
  await page.locator("input[type=file]").setInputFiles(Array(6).fill(bad));
  await expect(page.getByRole("alert")).toContainText("合計5枚");
  await page.locator("input[type=file]").setInputFiles(bad);
  await expect(page.getByRole("alert")).toContainText("読み込めない");
  await expect(page.locator(".empty-slot")).toHaveCount(2);
});
