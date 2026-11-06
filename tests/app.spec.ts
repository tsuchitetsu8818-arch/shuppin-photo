import { test, expect } from "@playwright/test";
const picture = (n: number) => ({
  name: `photo-${n}.svg`,
  mimeType: "image/svg+xml",
  buffer: Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><rect width="100" height="100" fill="${["#e03030", "#30a040", "#3040e0", "#b09020", "#a020b0"][n % 5]}"/><rect x="100" width="100" height="100" fill="#e0d0b0"/></svg>`,
  ),
});
async function load(page: any, n = 2) {
  await page.goto("./");
  await page
    .getByLabel("写真をまとめて選択", { exact: true })
    .setInputFiles(Array.from({ length: n }, (_, i) => picture(i)));
  await expect(
    page.getByRole("button", { name: "保存", exact: true }),
  ).toBeEnabled();
}
for (const n of [2, 3, 4, 5])
  test(`${n} photos batch automatically chooses default; layouts retain transforms`, async ({
    page,
  }) => {
    await load(page, n);
    await expect(page.locator(".frame")).toHaveCount(n);
    await expect(page.locator(".layout-choice").first()).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await page.getByRole("tab", { name: "調整", exact: true }).click();
    await page.getByRole("slider", { name: "回転角度" }).fill("37");
    await page.getByRole("slider", { name: "拡大率" }).fill("0.4");
    await page.getByRole("tab", { name: "レイアウト", exact: true }).click();
    for (const b of await page.locator(".layout-choice").all()) await b.click();
    await page.getByRole("tab", { name: "調整", exact: true }).click();
    await expect(page.getByRole("slider", { name: "回転角度" })).toHaveValue(
      "37",
    );
    await expect(page.getByRole("slider", { name: "拡大率" })).toHaveValue(
      "0.4",
    );
    await page
      .getByRole("button", { name: "写真2を選択", exact: true })
      .click();
    await expect(page.getByRole("slider", { name: "回転角度" })).toHaveValue(
      "0",
    );
  });
test("invalid counts and broken files keep editor; confirmation cancel keeps photos", async ({
  page,
}) => {
  await load(page);
  await page
    .getByLabel("写真をまとめて選択", { exact: true })
    .setInputFiles([picture(0)]);
  await expect(page.getByRole("alert")).toContainText("2〜5枚");
  await expect(page.locator(".frame-number")).toHaveCount(2);
  await page
    .getByLabel("写真をまとめて選択", { exact: true })
    .setInputFiles(Array.from({ length: 6 }, (_, i) => picture(i)));
  await expect(page.getByRole("alert")).toContainText("最大5枚");
  await page
    .getByLabel("写真をまとめて選択", { exact: true })
    .setInputFiles([
      picture(0),
      { name: "bad.jpg", mimeType: "image/jpeg", buffer: Buffer.from("bad") },
    ]);
  await expect(page.getByRole("alert")).toContainText("読み込めません");
  await expect(page.locator(".frame-number")).toHaveCount(2);
  await page.getByLabel("案内を閉じる").click();
  await page.getByRole("button", { name: /写真をまとめて選び直す/ }).click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page.getByRole("button", { name: "編集を続ける" }).click();
  await expect(page.locator(".frame-number")).toHaveCount(2);
});
test("swap, delete, individual replacement and reset", async ({ page }) => {
  await load(page, 3);
  await page.getByRole("tab", { name: "調整", exact: true }).click();
  await page.getByRole("slider", { name: "回転角度" }).fill("21");
  await page.getByRole("button", { name: "入れ替え", exact: true }).click();
  await page.getByRole("button", { name: "写真3を選択", exact: true }).click();
  await expect(page.getByRole("slider", { name: "回転角度" })).toHaveValue(
    "21",
  );
  await page.getByRole("button", { name: "90°回転", exact: true }).click();
  await expect(page.getByRole("slider", { name: "回転角度" })).toHaveValue(
    "111",
  );
  await page.getByRole("button", { name: "リセット", exact: true }).click();
  await expect(page.getByRole("slider", { name: "回転角度" })).toHaveValue("0");
  await page.getByRole("button", { name: "削除", exact: true }).click();
  await expect(page.locator(".empty-frame")).toHaveCount(1);
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "＋ この枠に写真を追加" }).click();
  await (await chooser).setFiles(picture(4));
  await expect(page.locator(".frame-number")).toHaveCount(3);
});
for (const size of [
  { width: 320, height: 568 },
  { width: 375, height: 667 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
])
  test(`small screen ${size.width} fits all tabs`, async ({ page }) => {
    await page.setViewportSize(size);
    await load(page, 5);
    for (const tab of ["レイアウト", "余白", "調整"]) {
      await page.getByRole("tab", { name: tab, exact: true }).click();
      expect(
        await page.evaluate(
          () =>
            document.documentElement.scrollWidth <= innerWidth &&
            document.documentElement.scrollHeight <= innerHeight,
        ),
      ).toBe(true);
      const canvas = await page.locator("canvas").boundingBox();
      expect(canvas!.width).toBeGreaterThan(180);
    }
    await page.screenshot({ path: `test-results/editor-${size.width}.png` });
  });
test("free drag and twist, per-photo state, no picker conflicts, JPEG matches preview", async ({
  page,
  context,
}) => {
  await load(page);
  let picks = 0;
  page.on("filechooser", () => picks++);
  await page.getByRole("tab", { name: "調整", exact: true }).click();
  await page.getByRole("slider", { name: "拡大率" }).fill("0.4");
  await page.getByRole("slider", { name: "回転角度" }).fill("37");
  const b = (await page.locator("canvas").boundingBox())!;
  await page.mouse.move(b.x + b.width * 0.5, b.y + b.height * 0.25);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width * 0.6, b.y + b.height * 0.3);
  await page.mouse.up();
  const cdp = await context.newCDPSession(page);
  const touch = (id: number, x: number, y: number) => ({
    id,
    x: b.x + b.width * x,
    y: b.y + b.height * y,
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [touch(1, 0.4, 0.2), touch(2, 0.6, 0.2)],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [touch(1, 0.5, 0.15), touch(2, 0.65, 0.35)],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  expect(picks).toBe(0);
  expect(
    +(await page.getByRole("slider", { name: "回転角度" }).inputValue()),
  ).toBeGreaterThan(70);
  await page.getByRole("tab", { name: "余白", exact: true }).click();
  await page.getByRole("button", { name: "グレー", exact: true }).click();
  await page.getByRole("slider", { name: "角丸" }).fill("18");
  await page.getByRole("slider", { name: "枠の隙間" }).fill("10");
  const preview = await page
    .locator("canvas")
    .evaluate((c: HTMLCanvasElement) =>
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
        colors: Array.from({ length: 81 }, (_, i) => [
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
      expect(Math.abs(preview[i][c] - output.colors[i][c])).toBeLessThan(35);
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name: "JPEGをダウンロード" }).click(),
  ]);
  expect(download.suggestedFilename()).toBe("shuppin-photo.jpg");
});
for (const outcome of ["success", "abort", "fail"])
  test(`share direct gesture ${outcome} keeps result and retries`, async ({
    page,
  }) => {
    await page.addInitScript((outcome) => {
      Object.defineProperty(navigator, "canShare", {
        value: () => true,
        configurable: true,
      });
      Object.defineProperty(navigator, "share", {
        value: async (data: ShareData) => {
          (window as any).shared = {
            active: navigator.userActivation.isActive,
            type: data.files?.[0].type,
          };
          if (outcome !== "success")
            throw new DOMException(
              "share",
              outcome === "abort" ? "AbortError" : "NotAllowedError",
            );
        },
        configurable: true,
      });
    }, outcome);
    await load(page);
    await page.getByRole("button", { name: "保存", exact: true }).click();
    await expect(page.locator(".result img")).toBeVisible();
    expect(await page.evaluate(() => (window as any).shared)).toEqual({
      active: true,
      type: "image/jpeg",
    });
    if (outcome === "abort")
      await expect(page.locator(".result")).toContainText("キャンセル");
    if (outcome === "fail")
      await expect(page.locator(".result")).toContainText("失敗");
    await page.getByRole("button", { name: "もう一度共有する" }).click();
    await expect(page.locator(".result img")).toBeVisible();
  });
test("offline shell launches on GitHub subpath and no remote photo requests", async ({
  page,
  context,
}) => {
  page.on("dialog", (d) => d.accept());
  const external: string[] = [];
  page.on("request", (r) => {
    if (
      !r.url().startsWith("http://127.0.0.1") &&
      !r.url().startsWith("blob:") &&
      !r.url().startsWith("data:")
    )
      external.push(r.url());
  });
  await load(page);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("heading", { name: /出品フォト/ })).toBeVisible();
  await page
    .getByLabel("写真をまとめて選択", { exact: true })
    .setInputFiles([picture(1), picture(2)]);
  await expect(
    page.getByRole("button", { name: "保存", exact: true }),
  ).toBeEnabled();
  expect(external).toEqual([]);
});
test("JPEG encoding failure can retry without losing photos", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.toBlob;
    let once = true;
    HTMLCanvasElement.prototype.toBlob = function (callback, ...rest) {
      if (once) {
        once = false;
        callback(null);
        return;
      }
      original.call(this, callback, ...rest);
    };
  });
  await page.goto("./");
  await page
    .getByLabel("写真をまとめて選択", { exact: true })
    .setInputFiles([picture(0), picture(1)]);
  await expect(page.getByRole("alert")).toContainText("JPEGを作成できません");
  await page.getByRole("button", { name: "再作成", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "保存", exact: true }),
  ).toBeEnabled();
  await expect(page.locator(".frame-number")).toHaveCount(2);
});
test("JPEG EXIF orientation is respected by native decoding", async ({
  page,
}) => {
  await page.goto("./");
  const photo = {
    name: "rotated.jpg",
    mimeType: "image/jpeg",
    buffer: Buffer.from(
      "/9j/4AAQSkZJRgABAQAAAQABAAD/4QAiRXhpZgAATU0AKgAAAAgAAQESAAMAAAABAAYAAAAAAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAA8AHgDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDi6KKK+ZP3EKKKKACiiigArH1z/lh/wL+lbFY+uf8ALD/gX9K+m4P/AOR1R/7e/wDSJHz3FX/Iorf9u/8ApUTIooor9xPxwKKKKACiiigAooooA6+iiiv5oP6ECiiigAooooAKx9c/5Yf8C/pWxWPrn/LD/gX9K+m4P/5HVH/t7/0iR89xV/yKK3/bv/pUTIooor9xPxwKKKKACiiigAooooA6+iiiv5oP6ECiiigAooooAKx9c/5Yf8C/pWxWPrn/ACw/4F/SvpuD/wDkdUf+3v8A0iR89xV/yKK3/bv/AKVEyKKKK/cT8cCiiigAooooAKKKKAOvooor+aD+hAooooAKKKKACsfXP+WH/Av6VsVj65/yw/4F/SvpuD/+R1R/7e/9IkfPcVf8iit/27/6VEyKKKK/cT8cCiiigAooooAKKKKAP//Z",
      "base64",
    ),
  };
  await page
    .getByLabel("写真をまとめて選択", { exact: true })
    .setInputFiles([photo, photo]);
  await expect(
    page.getByRole("button", { name: "保存", exact: true }),
  ).toBeEnabled();
  const colors = await page
    .locator("canvas")
    .evaluate((c: HTMLCanvasElement) => {
      const ctx = c.getContext("2d")!;
      return [
        ctx.getImageData(500, 100, 1, 1).data[0],
        ctx.getImageData(500, 400, 1, 1).data[2],
      ];
    });
  expect(colors[0]).toBeGreaterThan(200);
  expect(colors[1]).toBeGreaterThan(200);
});
