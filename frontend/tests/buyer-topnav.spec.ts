import { expect, test } from "./fixtures";
import type { Page } from "@playwright/test";
import { food } from "./discovery-data";

// TopNav/Pembeli in design.pen: search, location chip, Jelajahi · Pesanan,
// then the avatar. One BuyerHeader on discovery and order pages. Beranda is
// for guests only: signed in, "/" is the catalog, the same page as Jelajahi.
test.beforeEach(async ({ page }) => {
  await page.route("**/api/**", (route) =>
    route.fulfill({ status: 503, json: { detail: "Offline preview" } }),
  );
  await page.route("**/api/listings", (route) =>
    route.fulfill({
      json: [
        food(11, 31, { name: "Roti Sepuluh" }),
        food(12, 31, { name: "Roti Lima Belas" }),
      ],
    }),
  );
});

const signInAsBuyer = (page: Page) =>
  page.route("**/api/auth/me", (route) =>
    route.fulfill({
      json: {
        id: 1,
        username: "rani",
        name: "Rani Ayu",
        email: "rani@example.com",
        role: "buyer",
      },
    }),
  );

const buyerNav = (page: Page) =>
  page
    .getByRole("banner")
    .getByRole("navigation", { name: "Navigasi pembeli" });

test("signed-in buyers get the design TopNav on discovery and order pages", async ({
  page,
}) => {
  await signInAsBuyer(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  for (const [path, current] of [
    ["/", "Jelajahi"],
    ["/pesanan", "Pesanan"],
  ] as const) {
    await page.goto(path, { waitUntil: "networkidle" });
    const banner = page.getByRole("banner");
    const nav = buyerNav(page);
    await expect(nav.getByRole("link")).toHaveText(["Jelajahi", "Pesanan"]);
    await expect(nav.getByRole("link", { name: "Jelajahi" })).toHaveAttribute(
      "href",
      "/jelajahi",
    );
    await expect(nav.getByRole("link", { name: "Pesanan" })).toHaveAttribute(
      "href",
      "/pesanan",
    );
    await expect(nav.getByRole("link", { name: current })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(
      banner.getByRole("textbox", { name: "Cari makanan atau toko" }),
    ).toBeVisible();
    await expect(
      banner.getByRole("button", { name: /^Beji, Depok · Pakai lokasiku$/ }),
    ).toBeVisible();
    // Initials of the first two words, as on the design's avatar.
    await expect(banner.getByText("RA", { exact: true })).toBeVisible();
  }
});

test("guests also get Beranda (the landing page), and Pesanan asks them to sign in first", async ({
  page,
}) => {
  await page.route("**/api/auth/me", (route) =>
    route.fulfill({ status: 403, json: { detail: "Belum masuk." } }),
  );
  await page.goto("/jelajahi", { waitUntil: "networkidle" });
  const nav = buyerNav(page);
  await expect(nav.locator("a, button")).toHaveText([
    "Beranda",
    "Jelajahi",
    "Pesanan",
  ]);
  await expect(nav.getByRole("link", { name: "Beranda" })).toHaveAttribute(
    "href",
    "/",
  );
  await nav.getByRole("button", { name: "Pesanan", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
});

test("buyers filter favourites with the Favorit saya chip on Jelajahi", async ({
  page,
}) => {
  await signInAsBuyer(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/", { waitUntil: "networkidle" });
  await expect(buyerNav(page).getByText("Favorit")).toHaveCount(0);
  await page.getByRole("button", { name: "Daftar", exact: true }).click();
  await page
    .getByRole("button", {
      name: "Simpan Roti Sepuluh ke favorit",
      exact: true,
    })
    .click();
  // In the visible filter row, not hidden under "Filter lainnya".
  const chip = page.getByRole("button", { name: "Favorit saya", exact: true });
  await expect(chip).toBeVisible();
  await chip.click();
  await expect(chip).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".food-card")).toHaveCount(1);
});
