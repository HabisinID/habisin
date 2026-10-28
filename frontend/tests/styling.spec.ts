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
  await expect(
    page.getByText("Katalog belum terhubung.", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".food-card")).toHaveCount(0);
  for (const [width, headingSize] of [
    [1500, "48px"],
    [1280, "48px"],
    [900, "40px"],
    [760, "40px"],
    [480, "34px"],
    [390, "34px"],
  ] as const) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.getByRole("heading", { level: 1 })).toHaveCSS(
      "font-size",
      headingSize,
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page
    .getByRole("banner")
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
  await page
    .getByRole("button", { name: "Akun Test User", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Hapus akun", exact: true }).click();
  await expect(
    dialog.getByRole("button", { name: "Hapus akun", exact: true }),
  ).toHaveCSS("background-color", "rgb(225, 236, 227)");
  const checkbox = dialog.getByRole("checkbox");
  expect((await checkbox.boundingBox())!.width).toBeLessThan(30);
  await expect(checkbox.locator("..")).toHaveCSS("flex-direction", "row");
  await expect(checkbox).toHaveCSS("accent-color", "rgb(31, 77, 51)");
});
