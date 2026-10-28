import { test, expect } from "./fixtures";
import { food, origin, baseFilters } from "./discovery-data";
import { discover, storePriceRange } from "../src/lib/discovery";
import { register, mutate, listing, cleanup } from "./backend-fixtures";

test("store ranges reflect filters and distinct store identity", () => {
  const rows = [
    food(1, 31, { price: 10000 }),
    food(2, 31, { price: 15000 }),
    food(3, 32, { price: 0 }),
  ];
  const groups = discover(
    rows,
    { ...baseFilters, maxPrice: Infinity },
    origin,
    Date.now(),
  ).storeGroups;
  expect(groups).toHaveLength(2);
  expect(storePriceRange(groups[0])).toBe("Rp10.000–15.000");
  expect(storePriceRange(groups[1])).toBe("Gratis");
  expect(
    storePriceRange(
      discover(rows, { ...baseFilters, maxPrice: 12000 }, origin, Date.now())
        .storeGroups[0],
    ),
  ).toBe("Rp10.000");
});

test("buyer starts on map, header and pills match, card focus clears after two zoom levels", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/api/auth/me", (r) =>
    r.fulfill({
      json: {
        id: 111,
        username: "buyer",
        name: "Rani Adinda",
        email: "r@example.com",
        role: "buyer",
      },
    }),
  );
  await page.route("**/api/listings", (r) =>
    r.fulfill({
      json: [
        food(11, 31, { name: "Roti Sepuluh", price: 10000 }),
        food(12, 31, { name: "Roti Lima Belas", price: 15000 }),
      ],
    }),
  );
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Peta", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".discovery-pin")).toHaveCount(1);
  await expect(page.locator(".discovery-pin")).toContainText(
    "Toko sama <b>aman</b> | Rp10.000–15.000",
  );
  expect(await page.locator(".pin-store-name b").count()).toBe(0);
  await expect(
    page.getByRole("button", { name: "Peta", exact: true }),
  ).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await page
    .getByRole("button", { name: "Lihat Roti Lima Belas", exact: true })
    .click();
  await expect(
    page.locator('.food-card[data-listing-id="12"]'),
  ).toHaveAttribute("data-selected", "true");
  await expect(page.locator(".selected-pin span")).toHaveCSS(
    "background-color",
    "rgb(31, 77, 51)",
  );
  await page.getByRole("button", { name: "Zoom out", exact: true }).click();
  await expect(
    page.getByRole("region", { name: /Peta toko makanan/ }),
  ).toHaveAttribute("data-zoom", "15");
  await expect(page.locator('.food-card[data-selected="true"]')).toHaveCount(1);
  await page.getByRole("button", { name: "Zoom out", exact: true }).click();
  await expect(page.locator('.food-card[data-selected="true"]')).toHaveCount(0);
  await expect(page.locator(".selected-pin")).toHaveCount(0);
  await page.getByRole("button", { name: "Daftar", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Daftar", exact: true }),
  ).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await page.screenshot({ path: "/tmp/habisin-role-buyer-list-desktop.png" });
  // TopNav/Pembeli: Jelajahi · Pesanan (the logo leads home).
  const labels = await page
    .getByRole("navigation", { name: "Navigasi pembeli" })
    .locator("a, button")
    .allTextContents();
  expect(labels).toEqual(["Jelajahi", "Pesanan"]);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "/tmp/habisin-role-buyer-mobile.png" });
  expect(errors).toEqual([]);
});

test("batch cart is deferred and cannot bypass main transaction flow", async ({
  page,
}) => {
  await register(page.request, "buyer");
  try {
    await page.goto("/");
    await expect(page.getByRole("button", { name: /Keranjang/ })).toHaveCount(
      0,
    );
    const result = await mutate(page.request, "checkout", {
      key: "fixture",
      items: [],
    });
    expect(result.status()).toBe(404);
  } finally {
    await cleanup(page.request);
  }
});

test("partner opens the full orders dashboard, keeps codes private and reaches inventory", async ({
  page,
  request,
}) => {
  const stores = await register(page.request, "partner", 1);
  await register(request, "buyer");
  const item = await (
    await mutate(page.request, "partner/listings", {
      ...listing("Dashboard Roti"),
      store_id: stores[0].id,
    })
  ).json();
  const order = await (
    await mutate(request, "reservations", {
      listing_id: item.id,
      quantity: 1,
      note: "Bawa wadah",
    })
  ).json();
  expect((await mutate(request, `reservations/${order.id}/pay`)).status()).toBe(
    200,
  );
  await page.goto("/");
  await expect(page).toHaveURL(/\/partner$/);
  await expect(
    page.getByRole("heading", { name: "Dasbor", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Tanggal mulai pesanan").fill("");
  await page.getByLabel("Tanggal akhir pesanan").fill("");
  await expect(page.getByText("Bawa wadah", { exact: false })).toBeVisible();
  await expect(page.getByText(order.code, { exact: false })).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: /Verifikasi kode/ }),
  ).toHaveAttribute("href", "/api/partner/kasir");
  await page.getByRole("link", { name: "Listing", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Kelola listing mitra" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Tambah listing", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Tambah listing", exact: true }),
  ).toBeVisible();
});
