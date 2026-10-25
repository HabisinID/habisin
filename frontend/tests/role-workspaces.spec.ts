import { test, expect } from "./fixtures";
import { food, origin, baseFilters } from "./discovery-data";
import { discover, storePriceRange } from "../src/lib/discovery";
import {
  register,
  mutate,
  listing,
  cleanup,
} from "./backend-fixtures";

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
  // "Pesanan saya" is a link to the /pesanan page (Modul 7); the rest are buttons.
  const labels = await page
    .getByRole("navigation", { name: "Navigasi pembeli" })
    .locator("a, button")
    .allTextContents();
  expect(labels).toEqual(["Jelajahi", "Favorit", "Pesanan saya"]);
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

test("partner starts on operational dashboard and can mark sold out, undo, inspect orders and add", async ({
  page,
  request,
}) => {
  const stores = await register(page.request, "partner", 1);
  await register(request, "buyer");
  try {
    const item = await (
      await mutate(page.request, "partner/listings", {
        ...listing("Dashboard Roti"),
        store_id: stores[0].id,
      })
    ).json();
    expect(
      (
        await mutate(request, "reservations", {
          listing_id: item.id,
          quantity: 1,
        })
      ).status(),
    ).toBe(201);
    const pending = await (await request.get("/api/reservations")).json();
    expect(
      (await mutate(request, `reservations/${pending[0].id}/pay`)).status(),
    ).toBe(200);
    await page.goto("/");
    await expect(
      page.getByRole("region", { name: "Dasbor operasional mitra" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Dashboard Roti", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Verifikasi kode/ }),
    ).toBeDisabled();
    await page.getByRole("button", { name: "Bulan", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Bulan", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await page.screenshot({ path: "/tmp/habisin-role-partner-desktop.png" });
    await page
      .getByRole("button", { name: "Tandai habis Dashboard Roti", exact: true })
      .click();
    await expect(
      page.getByText("Dashboard Roti ditandai habis.", { exact: false }),
    ).toBeVisible();
    await page.getByRole("button", { name: /Urungkan/ }).click();
    await expect(
      page.getByRole("heading", { name: "Dashboard Roti", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("navigation", { name: "Navigasi mitra" })
      .getByRole("button", { name: /Pesanan/ })
      .click();
    await expect(page.getByText(/^Kode [A-Z2-9]{5}/)).toBeVisible();
    await page
      .getByRole("button", { name: "Tambah listing", exact: true })
      .click();
    await expect(
      page.getByRole("dialog", { name: "Tambah listing", exact: true }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({ path: "/tmp/habisin-role-partner-mobile.png" });
  } finally {
    for (const row of await (await request.get("/api/reservations")).json())
      await mutate(request, `reservations/${row.id}/cancel`);
    await cleanup(request);
    await cleanup(page.request);
  }
});

test("dashboard loading error retry and empty states are distinct", async ({
  page,
}) => {
  await register(page.request, "partner", 0);
  try {
    await page.route("**/api/partner/dashboard?period=*", (r) =>
      r.fulfill({ status: 503, json: { detail: "Dashboard sementara gagal" } }),
    );
    await page.goto("/");
    await expect(
      page.getByRole("alert").filter({ hasText: "Dashboard sementara gagal" }),
    ).toBeVisible();
    await page.unroute("**/api/partner/dashboard?period=*");
    await page.getByRole("button", { name: "Coba lagi dashboard" }).click();
    await expect(
      page.getByText("Belum ada pengambilan hari ini."),
    ).toBeVisible();
    await expect(page.getByText("Belum ada listing tayang.")).toBeVisible();
  } finally {
    await cleanup(page.request);
  }
});
