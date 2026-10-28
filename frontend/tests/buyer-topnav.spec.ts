import { expect, test } from "./fixtures";
import type { Page } from "@playwright/test";
import { food } from "./discovery-data";

// TopNav/Pembeli in design.pen: search, location chip, Jelajahi · Pesanan,
// then the avatar (the logo leads home). One BuyerHeader on discovery and order pages.
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

test("guests on Jelajahi get the landing page menu, without Pesanan", async ({
  page,
}) => {
  await page.route("**/api/auth/me", (route) =>
    route.fulfill({ status: 403, json: { detail: "Belum masuk." } }),
  );
  await page.goto("/jelajahi", { waitUntil: "networkidle" });
  const nav = buyerNav(page);
  await expect(nav.locator("a, button")).toHaveText([
    "Jelajahi",
    "Dampak",
    "Untuk Mitra",
  ]);
  await expect(nav.getByRole("link", { name: "Jelajahi" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(nav.getByRole("link", { name: "Dampak" })).toHaveAttribute(
    "href",
    "/#dampak",
  );
  await expect(nav.getByRole("link", { name: "Untuk Mitra" })).toHaveAttribute(
    "href",
    "/#mitra",
  );
  // Signing in stays one tap away.
  await expect(
    page.getByRole("banner").getByRole("button", { name: "Masuk" }).first(),
  ).toBeVisible();
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

test("buyer photos appear on discovery and order pages", async ({ page }) => {
  await page.route("**/api/auth/me", (route) =>
    route.fulfill({
      json: {
        id: 1,
        username: "rani",
        name: "Rani Ayu",
        role: "buyer",
        profile_picture: "/media/profiles/rani.svg",
      },
    }),
  );
  await page.route("**/media/profiles/rani.svg", (route) =>
    route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20" fill="red"/></svg>',
    }),
  );
  for (const path of ["/jelajahi", "/pesanan"]) {
    await page.goto(path, { waitUntil: "networkidle" });
    const photo = page
      .getByRole("banner")
      .getByRole("img", { name: "Foto Rani Ayu" });
    await expect(photo).toBeVisible();
    await expect(photo).toHaveJSProperty("naturalWidth", 20);
  }
  await page.route("**/media/profiles/rani.svg", (route) => route.abort());
  await page.reload({ waitUntil: "networkidle" });
  await expect(
    page.getByRole("banner").getByText("RA", { exact: true }),
  ).toBeVisible();
});

test("while the account loads, order pages show no guest menu or sign-in buttons", async ({
  page,
}) => {
  // Hold every answer (React may ask twice in development) until the loading
  // state has been checked.
  let answer = () => {};
  const held = new Promise<void>((resolve) => (answer = resolve));
  await page.route("**/api/auth/me", async (route) => {
    await held;
    await route.fulfill({
      json: { id: 1, username: "rani", name: "Rani Ayu", role: "buyer" },
    });
  });
  await page.goto("/pesanan");
  const banner = page.getByRole("banner");
  await expect(page.getByText("Memuat pesanan…")).toBeAttached();
  await expect(banner.getByRole("link", { name: "Dampak" })).toHaveCount(0);
  await expect(banner.getByRole("button", { name: "Masuk" })).toHaveCount(0);
  await expect(
    banner.getByRole("button", { name: "Daftar gratis" }),
  ).toHaveCount(0);
  answer();
  await expect(buyerNav(page).getByRole("link")).toHaveText([
    "Jelajahi",
    "Pesanan",
  ]);
});
