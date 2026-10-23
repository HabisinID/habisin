import { expect, test } from "./fixtures";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/**", (route) =>
    route.fulfill({ status: 503, json: { detail: "Offline preview" } }),
  );
});

test("responsive catalog, active filters, and accessible dialogs retain their styles", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("status")).toContainText("pratinjau demo");
  for (const [width, columns, headingSize] of [
    [1500, 3, "66px"],
    [1280, 3, "66px"],
    [900, 3, "55px"],
    [760, 2, "44px"],
    [480, 2, "43px"],
    [390, 2, "43px"],
  ] as const) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.getByRole("heading", { level: 1 })).toHaveCSS(
      "font-size",
      headingSize,
    );
    const tracks = await page
      .locator(".food-grid")
      .evaluate(
        (el) => getComputedStyle(el).gridTemplateColumns.split(" ").length,
      );
    expect(tracks).toBe(columns);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }

  const donation = page.getByLabel("Donasi gratis", { exact: true });
  await donation.check();
  await expect(page.locator(".switch")).toHaveCSS(
    "background-color",
    "rgb(31, 77, 51)",
  );
  await expect(page.locator(".food-card")).toHaveCount(1);
  await expect(page.locator(".discount-badge")).toHaveCSS(
    "background-color",
    "rgb(225, 236, 227)",
  );
  await donation.uncheck();

  await page
    .getByRole("button", { name: "Daftar gratis", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveCSS("padding-top", "22px");
  await expect(dialog.getByRole("textbox", { name: "Nama lengkap" })).toHaveCSS(
    "background-color",
    "rgb(255, 255, 255)",
  );
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(dialog).toHaveCSS("padding-top", "27px");
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();

  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator("html")).toHaveCSS("scroll-behavior", "auto");
  await expect(page.locator(".food-card").first()).toHaveCSS(
    "transition-duration",
    "0s",
  );
});

test("profile tabs and account deletion checkbox preserve their layout", async ({
  page,
}) => {
  await page.route("**/api/auth/me", (route) =>
    route.fulfill({
      json: {
        id: 1,
        username: "tester",
        name: "Test User",
        email: "test@example.com",
        role: "buyer",
      },
    }),
  );
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "T Test", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Hapus akun", exact: true }).click();
  await expect(
    dialog.getByRole("button", { name: "Hapus akun", exact: true }),
  ).toHaveCSS("background-color", "rgb(255, 255, 255)");
  const checkbox = dialog.getByRole("checkbox");
  expect((await checkbox.boundingBox())!.width).toBeLessThan(30);
  await expect(checkbox.locator("..")).toHaveCSS("flex-direction", "row");
  await expect(checkbox).toHaveCSS("accent-color", "rgb(31, 77, 51)");
});
