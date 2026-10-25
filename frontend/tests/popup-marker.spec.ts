import { expect, test } from "./fixtures";
import { food } from "./discovery-data";

for (const width of [1440, 390]) {
  test(`popup replaces marker and restores it after card change, zoom or Escape (${width}px)`, async ({
    page,
  }) => {
    const errors: string[] = [],
      failed: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("requestfailed", (r) => {
      if (
        r.url().includes("/api/") &&
        !r.failure()?.errorText.includes("ERR_ABORTED")
      )
        failed.push(r.url());
    });
    await page.setViewportSize({ width, height: 900 });
    await page.route("**/api/auth/me", (r) =>
      r.fulfill({
        json: {
          id: 939,
          username: "popup",
          name: "Pembeli",
          role: "buyer",
          email: "popup@example.com",
        },
      }),
    );
    await page.route("**/api/listings", (r) =>
      r.fulfill({
        json: [
          food(901, 31, { name: "Roti Popup" }),
          food(902, 32, { name: "Sup Popup", latitude: -6.369 }),
        ],
      }),
    );
    await page.goto("/");
    const a = page.locator('.discovery-pin[title$="toko #31"]');
    const b = page.locator('.discovery-pin[title$="toko #32"]');
    const popup = page.getByRole("region", { name: /^Pilihan makanan/ });
    await page
      .getByRole("button", { name: "Lihat Roti Popup", exact: true })
      .click();
    await a.click();
    await expect(popup).toBeVisible();
    await expect(a).toBeHidden();
    await expect(a).toHaveAttribute("aria-hidden", "true");
    await expect(a).toHaveAttribute("tabindex", "-1");
    await expect(b).toBeVisible();
    await page
      .getByRole("button", { name: "Lihat Sup Popup", exact: true })
      .click();
    await expect(popup).toHaveCount(0);
    await expect(a).toBeVisible();
    await expect(b).toBeVisible();
    await expect(b).toHaveClass(/selected-pin/);
    await b.click();
    await expect(b).toBeHidden();
    await page.getByRole("button", { name: "Zoom out", exact: true }).click();
    await expect(
      page.getByRole("region", { name: /^Peta toko/ }),
    ).toHaveAttribute("data-zoom", "15");
    await expect(b).toBeHidden();
    await page.getByRole("button", { name: "Zoom out", exact: true }).click();
    await expect(popup).toHaveCount(0);
    await expect(b).toBeVisible();
    await expect(page.locator('.food-card[data-selected="true"]')).toHaveCount(
      0,
    );
    await a.focus();
    await page.keyboard.press("Enter");
    await expect(popup).toBeVisible();
    await expect(a).toBeHidden();
    await page.keyboard.press("Escape");
    await expect(a).toBeVisible();
    await expect(a).toBeFocused();
    await a.click();
    await page.getByRole("button", { name: "Tutup popup toko" }).click();
    await expect(a).toBeVisible();
    await expect(a).toHaveAttribute("tabindex", "0");
    expect(errors).toEqual([]);
    expect(failed).toEqual([]);
  });
}
