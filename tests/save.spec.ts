import { test, expect } from "@playwright/test";

for (const mode of [
  "success",
  "cancel",
  "failure",
  "unsupported",
  "throws",
] as const) {
  test(`save preserves JPEG with ${mode} file sharing`, async ({ page }) => {
    await page.addInitScript((mode) => {
      const state = {
        inTap: false,
        calls: [] as {
          active: boolean;
          inTap: boolean;
          type: string;
          size: number;
          same: boolean;
        }[],
        file: null as File | null,
      };
      Object.assign(window, { shareTest: state });
      Object.defineProperty(navigator, "canShare", {
        configurable: true,
        value: () => {
          if (mode === "throws") throw Error("unsupported");
          return mode !== "unsupported";
        },
      });
      Object.defineProperty(navigator, "share", {
        configurable: true,
        value: (data: ShareData) => {
          const file = data.files![0];
          state.calls.push({
            active: navigator.userActivation.isActive,
            inTap: window.event?.type === "click",
            type: file.type,
            size: file.size,
            same: !state.file || file === state.file,
          });
          state.file = file;
          if (mode === "failure")
            return Promise.reject(
              new DOMException("blocked", "NotAllowedError"),
            );
          if (mode === "cancel")
            return Promise.reject(new DOMException("cancelled", "AbortError"));
          return Promise.resolve();
        },
      });
    }, mode);
    await page.goto("/");
    await page
      .locator("input[type=file]")
      .setInputFiles(["public/icon-192.png", "public/icon-512.png"]);
    const save = page.getByRole("button", {
      name: "保存",
      exact: true,
    });
    await expect(save).toBeEnabled();
    await save.click();
    await expect(page.getByRole("dialog")).toBeVisible();
    const img = page.locator(".modal img");
    const url = await img.getAttribute("src");
    expect(
      await img.evaluate(async (e) => {
        const i = e as HTMLImageElement;
        await i.decode();
        return [i.naturalWidth, i.naturalHeight];
      }),
    ).toEqual([2000, 2000]);
    const calls = () =>
      page.evaluate(
        () =>
          (window as unknown as { shareTest: { calls: unknown[] } }).shareTest
            .calls,
      );
    if (mode === "unsupported" || mode === "throws") {
      expect(await calls()).toHaveLength(0);
      await expect(
        page.getByRole("button", { name: "もう一度共有する" }),
      ).toHaveCount(0);
    } else {
      await expect.poll(async () => (await calls()).length).toBe(1);
      expect((await calls())[0]).toMatchObject({
        active: true,
        inTap: true,
        type: "image/jpeg",
        same: true,
      });
      if (mode === "cancel")
        await expect(page.getByRole("status")).toContainText(
          "共有を終了しました",
        );
      if (mode === "failure")
        await expect(page.getByRole("status")).toContainText(
          "共有できませんでした",
        );
      await page.getByRole("button", { name: "もう一度共有する" }).click();
      expect(await calls()).toHaveLength(2);
      expect((await calls())[1]).toMatchObject({
        active: true,
        inTap: true,
        same: true,
      });
    }
    await expect(img).toHaveAttribute("src", url!);
    await expect(
      page.getByRole("link", { name: "JPEGをダウンロード" }),
    ).toHaveAttribute("href", url!);
    expect(
      await img.evaluate((e) =>
        getComputedStyle(e).getPropertyValue("max-height"),
      ),
    ).toBe("none");
  });
}

test("JPEG generation failure leaves editing state and can be retried", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.toBlob;
    let fail = true;
    HTMLCanvasElement.prototype.toBlob = function (callback, type, quality) {
      if (fail) {
        fail = false;
        setTimeout(() => callback(null), 10);
      } else original.call(this, callback, type, quality);
    };
  });
  await page.goto("/");
  await page
    .locator("input[type=file]")
    .setInputFiles(["public/icon-192.png", "public/icon-512.png"]);
  await expect(page.getByRole("status")).toContainText(
    "編集内容は残っています",
  );
  await expect(page.locator(".empty-slot")).toHaveCount(0);
  await page.getByRole("button", { name: "再試行" }).click();
  await expect(
    page.getByRole("button", { name: "保存", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.locator(".modal img")).toBeVisible();
});

test("a delayed older JPEG never replaces the latest edit", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.toBlob;
    let n = 0;
    HTMLCanvasElement.prototype.toBlob = function (callback, type, quality) {
      n++;
      const delay = n === 1 ? 1000 : 0;
      original.call(
        this,
        (b) => setTimeout(() => callback(b), delay),
        type,
        quality,
      );
    };
  });
  await page.goto("/");
  await page
    .locator("input[type=file]")
    .setInputFiles(["public/icon-192.png", "public/icon-512.png"]);
  await expect(page.getByRole("button", { name: "準備中…" })).toBeVisible();
  // Wait for the first encoder invocation, then edit while its callback is pending.
  await page.waitForTimeout(300);
  await page.getByRole("tab", { name: "枠線・余白" }).click();
  await page.getByRole("button", { name: "黒", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "保存", exact: true }),
  ).toBeEnabled();
  await page.waitForTimeout(1100);
  await page.getByRole("button", { name: "保存", exact: true }).click();
  const pixel = await page.locator(".modal img").evaluate(async (e) => {
    const i = e as HTMLImageElement;
    await i.decode();
    const c = document.createElement("canvas");
    c.width = c.height = 2000;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(i, 0, 0);
    return [...ctx.getImageData(0, 0, 1, 1).data];
  });
  expect(pixel[0]).toBeLessThan(45);
  expect(pixel[1]).toBeLessThan(45);
  expect(pixel[2]).toBeLessThan(45);
});
