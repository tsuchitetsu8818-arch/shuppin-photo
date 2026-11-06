import { test, expect, type Page, type CDPSession } from "@playwright/test";
import { layouts } from "../src/model";
const picture = (n: number) => ({
  name: `${n}.svg`,
  mimeType: "image/svg+xml",
  buffer: Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="${["#e03030", "#30a040", "#3040e0", "#b09020", "#a020b0"][n]}"/></svg>`,
  ),
});
const canvas = (page: Page) => page.locator(".canvas-wrap > canvas").first();
const snapshot = (page: Page) =>
  canvas(page).evaluate((c: HTMLCanvasElement) => c.toDataURL());
async function center(page: Page, n: number) {
  const b = (await page.locator(".frame").nth(n).boundingBox())!;
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}
async function load(page: Page, n = 4) {
  await page.goto("./");
  await page
    .getByLabel("写真をまとめて選択", { exact: true })
    .setInputFiles(Array.from({ length: n }, (_, i) => picture(i)));
  await expect(
    page.getByRole("button", { name: "保存", exact: true }),
  ).toBeEnabled();
}
const point = (id: number, p: { x: number; y: number }) => ({
  id,
  ...p,
  radiusX: 3,
  radiusY: 3,
  force: 1,
});
async function send(
  cdp: CDPSession,
  type: string,
  touchPoints: ReturnType<typeof point>[],
) {
  await cdp.send("Input.dispatchTouchEvent", { type, touchPoints });
}
async function colors(page: Page) {
  return page.locator(".frame").evaluateAll((els) => {
    const canvas = document.querySelector(
        ".canvas-wrap > canvas",
      ) as HTMLCanvasElement,
      b = canvas.getBoundingClientRect(),
      ctx = canvas.getContext("2d")!;
    return els.map((el) => {
      const r = el.getBoundingClientRect();
      return [
        ...ctx.getImageData(
          Math.round(((r.x + r.width / 2 - b.x) / b.width) * 1000),
          Math.round(((r.y + r.height / 2 - b.y) / b.height) * 1000),
          1,
          1,
        ).data,
      ].slice(0, 3);
    });
  });
}
for (const [count, choices] of Object.entries(layouts))
  for (const layout of choices)
    test(`${count} photos: long press swaps on ${layout.id}`, async ({
      page,
      context,
    }) => {
      await load(page, +count);
      await page
        .getByRole("button", { name: layout.name, exact: true })
        .click();
      const before = await colors(page),
        a = await center(page, 0),
        b = await center(page, +count - 1),
        cdp = await context.newCDPSession(page);
      await send(cdp, "touchStart", [point(1, a)]);
      await expect(page.locator(".swap-ghost")).toBeVisible();
      await send(cdp, "touchMove", [point(1, b)]);
      await expect(page.locator(".swap-target")).toHaveCount(1);
      await send(cdp, "touchEnd", []);
      await expect(page.locator(".swap-ghost")).toHaveCount(0);
      const expected = [...before];
      [expected[0], expected[+count - 1]] = [expected[+count - 1], expected[0]];
      expect(await colors(page)).toEqual(expected);
    });
test("ordinary movement disables long press even if the finger returns", async ({
  page,
  context,
}) => {
  await load(page);
  const a = await center(page, 0),
    b = await center(page, 3),
    before = await snapshot(page),
    cdp = await context.newCDPSession(page);
  await send(cdp, "touchStart", [point(1, a)]);
  await send(cdp, "touchMove", [point(1, { x: a.x + 20, y: a.y })]);
  await page.waitForTimeout(650);
  await expect(page.locator(".swap-ghost")).toHaveCount(0);
  expect(await snapshot(page)).not.toBe(before);
  await send(cdp, "touchMove", [point(1, b)]);
  await send(cdp, "touchEnd", []);
  expect((await colors(page))[3]).toEqual([176, 144, 32]);
});
for (const destination of ["same", "outside", "gap"])
  test(`release ${destination} cancels without changing any photo`, async ({
    page,
    context,
  }) => {
    await load(page);
    const a = await center(page, 0),
      b = (await canvas(page).boundingBox())!,
      before = await snapshot(page),
      cdp = await context.newCDPSession(page);
    await send(cdp, "touchStart", [point(1, a)]);
    await send(cdp, "touchMove", [point(1, { x: a.x + 3, y: a.y + 2 })]);
    await expect(page.locator(".swap-ghost")).toBeVisible();
    const target =
      destination === "same"
        ? a
        : destination === "outside"
          ? { x: b.x + b.width + 8, y: a.y }
          : { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    await send(cdp, "touchMove", [point(1, target)]);
    await expect(page.locator(".swap-target")).toHaveCount(0);
    await send(cdp, "touchEnd", []);
    expect(await snapshot(page)).toBe(before);
  });
test("second finger before hold keeps pinch and twist; after hold cancels until all fingers lift", async ({
  page,
  context,
}) => {
  await load(page);
  await page.getByRole("tab", { name: "調整", exact: true }).click();
  const a = await center(page, 0),
    cdp = await context.newCDPSession(page);
  await send(cdp, "touchStart", [
    point(1, { x: a.x - 20, y: a.y }),
    point(2, { x: a.x + 20, y: a.y }),
  ]);
  await page.waitForTimeout(650);
  await expect(page.locator(".swap-ghost")).toHaveCount(0);
  await send(cdp, "touchMove", [
    point(1, { x: a.x - 30, y: a.y - 10 }),
    point(2, { x: a.x + 30, y: a.y + 10 }),
  ]);
  expect(
    +(await page.getByRole("slider", { name: "拡大率" }).inputValue()),
  ).toBeGreaterThan(1.4);
  expect(
    +(await page.getByRole("slider", { name: "回転角度" }).inputValue()),
  ).toBeGreaterThan(10);
  await send(cdp, "touchEnd", []);
  const before = await snapshot(page);
  await send(cdp, "touchStart", [point(1, a)]);
  await expect(page.locator(".swap-ghost")).toBeVisible();
  await send(cdp, "touchStart", [
    point(1, a),
    point(2, { x: a.x + 30, y: a.y }),
  ]);
  await expect(page.locator(".swap-ghost")).toHaveCount(0);
  await send(cdp, "touchMove", [
    point(1, { x: a.x + 40, y: a.y }),
    point(2, { x: a.x + 60, y: a.y }),
  ]);
  await send(cdp, "touchEnd", [point(1, { x: a.x + 40, y: a.y })]);
  await send(cdp, "touchMove", [point(1, { x: a.x + 80, y: a.y })]);
  await page.waitForTimeout(550);
  expect(await snapshot(page)).toBe(before);
  await expect(page.locator(".swap-ghost")).toHaveCount(0);
  await send(cdp, "touchEnd", []);
  await send(cdp, "touchStart", [point(1, a)]);
  await expect(page.locator(".swap-ghost")).toBeVisible();
  await send(cdp, "touchEnd", []);
});
test("photo transforms travel with the photo and JPEG includes the swap", async ({
  page,
  context,
}) => {
  await load(page);
  await page.getByRole("tab", { name: "調整", exact: true }).click();
  await page.getByRole("slider", { name: "拡大率" }).fill("0.6");
  await page.getByRole("slider", { name: "回転角度" }).fill("37");
  const a = await center(page, 0),
    b = await center(page, 3),
    cdp = await context.newCDPSession(page);
  await send(cdp, "touchStart", [point(1, a)]);
  await send(cdp, "touchMove", [point(1, { x: a.x + 20, y: a.y + 10 })]);
  await send(cdp, "touchEnd", []);
  const before = await snapshot(page);
  await send(cdp, "touchStart", [point(1, a)]);
  await expect(page.locator(".swap-ghost")).toBeVisible();
  await send(cdp, "touchMove", [point(1, b)]);
  await send(cdp, "touchEnd", []);
  await expect(
    page.getByRole("button", { name: "写真4を選択", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("slider", { name: "拡大率" })).toHaveValue("0.6");
  await expect(page.getByRole("slider", { name: "回転角度" })).toHaveValue(
    "37",
  );
  const preview = await canvas(page).evaluate((c: HTMLCanvasElement) =>
    Array.from({ length: 81 }, (_, i) => [
      ...c
        .getContext("2d")!
        .getImageData(50 + (i % 9) * 100, 50 + Math.floor(i / 9) * 100, 1, 1)
        .data,
    ]),
  );
  await page.getByRole("button", { name: "保存", exact: true }).click();
  const output = await page
    .locator(".result img")
    .evaluate(async (img: HTMLImageElement) => {
      await img.decode();
      const c = document.createElement("canvas");
      c.width = c.height = 2000;
      const ctx = c.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      return {
        w: img.naturalWidth,
        h: img.naturalHeight,
        pixels: Array.from({ length: 81 }, (_, i) => [
          ...ctx.getImageData(
            100 + (i % 9) * 200,
            100 + Math.floor(i / 9) * 200,
            1,
            1,
          ).data,
        ]),
      };
    });
  expect([output.w, output.h]).toEqual([2000, 2000]);
  for (let i = 0; i < 81; i++)
    for (let c = 0; c < 3; c++)
      expect(Math.abs(preview[i][c] - output.pixels[i][c])).toBeLessThan(35);
  await page.getByRole("button", { name: "編集に戻る" }).click();
  await send(cdp, "touchStart", [point(1, b)]);
  await expect(page.locator(".swap-ghost")).toBeVisible();
  await send(cdp, "touchMove", [point(1, a)]);
  await send(cdp, "touchEnd", []);
  expect(await snapshot(page)).toBe(before);
});
test("drop into an empty frame moves photo and leaves the source empty", async ({
  page,
  context,
}) => {
  await load(page);
  await page.getByRole("tab", { name: "調整", exact: true }).click();
  await page.getByRole("button", { name: "写真4を選択", exact: true }).click();
  await page.getByRole("button", { name: "削除", exact: true }).click();
  const a = await center(page, 0),
    b = await center(page, 3),
    cdp = await context.newCDPSession(page);
  await send(cdp, "touchStart", [point(1, a)]);
  await expect(page.locator(".swap-ghost")).toBeVisible();
  await send(cdp, "touchMove", [point(1, b)]);
  await expect(page.locator(".drop-label")).toHaveText("ここへ移動");
  await send(cdp, "touchEnd", []);
  await expect(
    page.locator(".frame").nth(0).locator(".empty-frame"),
  ).toHaveCount(1);
  expect((await colors(page))[3]).toEqual([224, 48, 48]);
  await expect(
    page.getByRole("button", { name: "保存", exact: true }),
  ).toBeDisabled();
});
for (const phase of ["pending", "lifted"])
  test(`pointercancel during ${phase} discards timer and drag; next gesture works`, async ({
    page,
    context,
  }) => {
    await load(page);
    const a = await center(page, 0),
      before = await snapshot(page),
      cdp = await context.newCDPSession(page);
    await send(cdp, "touchStart", [point(1, a)]);
    if (phase === "lifted")
      await expect(page.locator(".swap-ghost")).toBeVisible();
    await send(cdp, "touchCancel", []);
    await page.waitForTimeout(550);
    await expect(page.locator(".swap-ghost")).toHaveCount(0);
    expect(await snapshot(page)).toBe(before);
    await send(cdp, "touchStart", [point(1, a)]);
    await expect(page.locator(".swap-ghost")).toBeVisible();
    await send(cdp, "touchEnd", []);
  });
test("layout changes and browser context menu cancel safely without page scrolling or text selection", async ({
  page,
  context,
}) => {
  await load(page);
  const a = await center(page, 0),
    cdp = await context.newCDPSession(page);
  await send(cdp, "touchStart", [point(1, a)]);
  await expect(page.locator(".swap-ghost")).toBeVisible();
  await page
    .getByRole("button", { name: "上1枚＋下3枚", exact: true })
    .evaluate((b: HTMLButtonElement) => b.click());
  await expect(page.locator(".swap-ghost")).toHaveCount(0);
  await send(cdp, "touchEnd", []);
  const wrap = page.locator(".canvas-wrap");
  expect(
    await wrap.evaluate((el) => {
      const e = new MouseEvent("contextmenu", {
        cancelable: true,
        bubbles: true,
      });
      el.dispatchEvent(e);
      return e.defaultPrevented;
    }),
  ).toBe(true);
  expect(
    await wrap.evaluate((el) => ({
      touch: getComputedStyle(el).touchAction,
      select: getComputedStyle(el).userSelect,
      callout:
        el instanceof HTMLElement ? el.style.webkitTouchCallout : undefined,
    })),
  ).toMatchObject({ touch: "none", select: "none" });
  expect(
    await page.evaluate(() => ({
      x: scrollX,
      y: scrollY,
      selection: getSelection()?.toString(),
    })),
  ).toEqual({ x: 0, y: 0, selection: "" });
});

test("losing capture or switching away clears hold and permits a fresh gesture", async ({
  page,
  context,
}) => {
  await load(page);
  await page.evaluate(() =>
    document
      .querySelector(".canvas-wrap")!
      .addEventListener("pointerdown", (e) => {
        (window as any).lastPointer = (e as PointerEvent).pointerId;
      }),
  );
  const a = await center(page, 0),
    cdp = await context.newCDPSession(page),
    before = await snapshot(page);
  for (const cancel of ["capture", "blur"]) {
    await send(cdp, "touchStart", [point(1, a)]);
    await expect(page.locator(".swap-ghost")).toBeVisible();
    if (cancel === "capture") {
      // Flush pending capture before explicitly releasing it.
      await send(cdp, "touchMove", [point(1, { x: a.x + 1, y: a.y })]);
      await page.evaluate(() =>
        document
          .querySelector(".canvas-wrap")!
          .releasePointerCapture((window as any).lastPointer),
      );
      await send(cdp, "touchMove", [point(1, { x: a.x + 20, y: a.y })]);
    } else await page.evaluate(() => window.dispatchEvent(new Event("blur")));
    await expect(page.locator(".swap-ghost")).toHaveCount(0);
    await send(cdp, "touchEnd", []);
    expect(await snapshot(page)).toBe(before);
  }
  await send(cdp, "touchStart", [point(1, a)]);
  await expect(page.locator(".swap-ghost")).toBeVisible();
  await send(cdp, "touchEnd", []);
});
