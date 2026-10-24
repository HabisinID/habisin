import { expect, test } from "./fixtures";
import type { Page } from "@playwright/test";
import { food, origin, baseFilters } from "./discovery-data";
import { discover } from "../src/lib/discovery";
import { listingTime } from "../src/lib/listing-time";
import {
  register,
  mutate,
  listing,
  cleanup,
  password,
} from "./backend-fixtures";
import type { Listing } from "../src/lib/api";
const user = {
  id: 99,
  username: "discovery",
  name: "Rani Adinda",
  email: "rani@example.com",
  role: "buyer",
};
async function logged(page: Page, items: Listing[]) {
  await page.route("**/api/auth/me", (r) => r.fulfill({ json: user }));
  await page.route("**/api/listings", (r) => r.fulfill({ json: items }));
  await page.route("**/api/listings/*/reservation-policy", (r) =>
    r.fulfill({
      json: {
        remaining_free_portions: 2,
        active_free_reservation_id: null,
        max_quantity: 2,
        reason: "",
        day: "2026-10-24",
      },
    }),
  );
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Makanan surplus di sekitar Anda" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Daftar", exact: true }).click();
}
const detail = (page: Page) =>
  page.getByRole("region", { name: "Detail makanan", exact: true });

test("time and discovery selectors obey strict urgency, expiry, bounds and sort", () => {
  const now = Date.now();
  const a = food(1, 31, {
    pickup_start: new Date(now - 60000).toISOString(),
    pickup_end: new Date(now + 1800000).toISOString(),
    stock: 1,
  });
  const b = food(2, 32, { pickup_end: new Date(now + 3600000).toISOString() });
  expect(listingTime(a, now).urgent).toBe(false);
  expect(listingTime(a, now + 1).urgent).toBe(true);
  expect(listingTime(a, now + 1800000).remaining).toBe(0);
  expect(listingTime(a, now + 1800000).progress).toBe(0);
  expect(
    discover(
      [b, a],
      { ...baseFilters, sort: "pickup" },
      origin,
      now,
    ).visibleListings.map((i) => i.id),
  ).toEqual([1, 2]);
  expect(
    discover(
      [a, b],
      { ...baseFilters, minStock: 2, maxDistance: 1 },
      origin,
      now,
    ).visibleListings.map((i) => i.id),
  ).toEqual([2]);
  expect(
    discover(
      [a, b],
      { ...baseFilters, bounds: { south: 0, north: 1, west: 0, east: 1 } },
      origin,
      now,
    ).visibleListings,
  ).toEqual([]);
});

test("logged dashboard follows four columns, real metadata, filters, focus and mobile", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const items = Array.from({ length: 8 }, (_, i) =>
    food(701 + i, 31 + i, {
      stock: i === 0 ? 1 : 4,
      price: i === 1 ? 0 : i === 7 ? 99000 : 5000,
      original_price: i === 7 ? 120000 : 10000,
      packaging: "Kotak kertas",
      storage_notes: "Suhu ruang",
      allergens: "Susu dan gluten",
      prepared_at: new Date(Date.now() - 3600000).toISOString(),
    }),
  );
  await page.setViewportSize({ width: 1440, height: 900 });
  await logged(page, items);
  await expect(page.locator(".hero")).toHaveCount(0);
  await expect(page.locator(".food-card")).toHaveCount(8);
  await expect(page.locator(".card-title").first()).toHaveCSS(
    "font-size",
    "16px",
  );
  await expect(page.locator(".card-title").first()).toHaveCSS(
    "font-weight",
    "700",
  );
  const grid = page.locator(".food-card").first().locator("..");
  expect(
    await grid.evaluate(
      (el) => getComputedStyle(el).gridTemplateColumns.split(" ").length,
    ),
  ).toBe(4);
  await page.screenshot({
    path: "/tmp/habisin-login-dashboard-desktop.png",
    fullPage: true,
  });
  const trigger = page.getByRole("button", {
    name: "Pesan Food 701",
    exact: true,
  });
  await trigger.click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    detail(page).locator("strong").filter({ hasText: "Rp" }).first(),
  ).toHaveCSS("font-size", "32px");
  await expect(detail(page)).toContainText("Kotak kertas");
  await expect(detail(page)).toContainText("Suhu ruang");
  await expect(detail(page)).toContainText("Susu dan gluten");
  await expect(detail(page).getByRole("heading", { level: 1 })).toBeFocused();
  await page.screenshot({
    path: "/tmp/habisin-login-detail-desktop.png",
    fullPage: true,
  });
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await page
    .getByRole("button", { name: "Masih ≥ 2 porsi", exact: true })
    .click();
  await expect(page.locator(".food-card")).toHaveCount(7);
  await page.getByRole("button", { name: "Gratis", exact: true }).click();
  await expect(page.locator(".food-card")).toHaveCount(1);
  await page.getByRole("button", { name: "Semua", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Cari makanan atau toko" })
    .fill("unmatched");
  await expect(
    page.getByText("Belum ada makanan yang cocok dengan filter ini."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Reset filter", exact: true }).click();
  await page.getByText("Filter lainnya", { exact: true }).click();
  await page.getByLabel("Harga maksimal (Rp)").fill("0");
  await expect(page.locator(".food-card")).toHaveCount(1);
  await page.getByLabel("Harga maksimal (Rp)").fill("");
  await expect(page.locator(".food-card")).toHaveCount(8);
  await page
    .getByRole("button", { name: "Simpan Food 701 ke favorit", exact: true })
    .click();
  await page.getByRole("button", { name: "Favorit", exact: true }).click();
  await expect(page.locator(".food-card")).toHaveCount(1);
  await page.getByRole("button", { name: "Semua", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await grid.evaluate(
      (el) => getComputedStyle(el).gridTemplateColumns.split(" ").length,
    ),
  ).toBe(1);
  await page.screenshot({
    path: "/tmp/habisin-login-dashboard-mobile.png",
    fullPage: true,
  });
  await trigger.click();
  await expect(detail(page)).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "/tmp/habisin-login-detail-mobile.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test("clock crosses 30 minutes and expires an open detail without reload", async ({
  page,
}) => {
  const now = new Date("2026-10-24T10:00:00Z");
  await page.clock.install({ time: now });
  await page.clock.pauseAt(now);
  await logged(page, [
    food(801, 31, {
      pickup_start: new Date(now.getTime() - 3600000).toISOString(),
      pickup_end: new Date(now.getTime() + 1800000).toISOString(),
    }),
  ]);
  const progress = page.locator(".food-card progress");
  await expect(progress).toHaveAttribute("data-urgent", "false");
  await page.clock.runFor(1000);
  await expect(progress).toHaveAttribute("data-urgent", "true");
  await page
    .getByRole("button", { name: "Pesan Food 801", exact: true })
    .click();
  await expect(
    detail(page).getByText(/tidak bisa dibatalkan karena waktu ambil/),
  ).toBeVisible();
  await page.clock.fastForward(1800000);
  await expect(
    detail(page).getByText("Waktu ambil berakhir", { exact: true }),
  ).toBeVisible();
  await expect(
    detail(page).getByRole("button", {
      name: "Simulasikan pembayaran berhasil",
    }),
  ).toBeDisabled();
});

test("logged map keeps split list, area search, instance, legend and mobile controls", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await logged(page, [
    food(901, 31),
    food(902, 32, { latitude: -7.2, longitude: 107.8, price: 0 }),
  ]);
  await page.getByRole("button", { name: "Peta", exact: true }).click();
  const canvas = page.locator(".map-canvas");
  await expect(canvas).toBeVisible();
  const pins = page.locator(".food-pin.leaflet-marker-icon");
  await expect(pins).toHaveCount(2);
  const listBox = (await page.locator(".food-card").first().boundingBox())!;
  expect(listBox.width).toBeCloseTo(391, 0);
  const mapBox = (await canvas.boundingBox())!;
  expect(mapBox.x).toBe(440);
  await expect(page.getByLabel("Legenda peta")).toContainText(
    "Ambil <30 menit",
  );
  const instance = await canvas.evaluate(
    (el) => (el as HTMLElement & { _leaflet_id: number })._leaflet_id,
  );
  await page
    .getByRole("button", { name: "Cari di area ini", exact: true })
    .click();
  await expect(page.locator(".food-card")).toHaveCount(1);
  await expect(pins).toHaveCount(1);
  await pins.first().focus();
  await page.keyboard.press("Enter");
  const popup = page.getByRole("region", { name: /^Pilihan makanan/ });
  await expect(popup).toContainText("Food 901");
  await page.keyboard.press("Escape");
  await expect(pins.first()).toBeFocused();
  await page.getByRole("button", { name: "Daftar", exact: true }).click();
  await page.getByRole("button", { name: "Peta", exact: true }).click();
  expect(
    await canvas.evaluate(
      (el) => (el as HTMLElement & { _leaflet_id: number })._leaflet_id,
    ),
  ).toBe(instance);
  await page.screenshot({
    path: "/tmp/habisin-login-map-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await expect(
    page.getByRole("button", { name: "Cari di area ini", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "/tmp/habisin-login-map-mobile.png",
    fullPage: true,
  });
});

test("real free policy is displayed, enforced and released after cancellation", async ({
  page,
  request,
}) => {
  const stores = await register(request, "partner");
  await register(page.request, "buyer");
  const prefix = `Policy ${Date.now()}`;
  try {
    const a = await (
      await mutate(request, "partner/listings", {
        ...listing(`${prefix} A`),
        price: 0,
        store_id: stores[0].id,
        packaging: "Kotak nyata",
        storage_notes: "Rak dingin",
        allergens: "Susu",
      })
    ).json();
    const b = await (
      await mutate(request, "partner/listings", {
        ...listing(`${prefix} B`),
        price: 0,
        store_id: stores[1].id,
      })
    ).json();
    await page.goto(`/?listing=${a.id}`);
    await expect(detail(page)).toContainText("Kotak nyata");
    await expect(
      detail(page).getByText("Sisa kuota toko hari ini: 2 porsi"),
    ).toBeVisible();
    await page.getByLabel("Jumlah porsi", { exact: true }).fill("3");
    await expect(
      page.getByRole("button", { name: "Klaim donasi gratis", exact: true }),
    ).toBeDisabled();
    await page.getByLabel("Jumlah porsi", { exact: true }).fill("2");
    await page
      .getByRole("button", { name: "Klaim donasi gratis", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Makananmu sudah dipesan!" }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await page.goto(`/?listing=${b.id}`);
    await expect(detail(page)).toContainText(
      "Anda masih memiliki satu tiket gratis aktif",
    );
    await expect(
      page.getByRole("button", { name: "Klaim donasi gratis", exact: true }),
    ).toBeDisabled();
    const rejected = await mutate(page.request, "reservations", {
      listing_id: b.id,
      quantity: 1,
    });
    expect(rejected.status()).toBe(409);
    await page
      .getByRole("button", { name: "Lihat tiket gratis aktif" })
      .click();
    await page.getByRole("button", { name: "Batalkan", exact: true }).click();
    await expect(page.getByText("Dibatalkan", { exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("button", { name: "Klaim donasi gratis", exact: true }),
    ).toBeEnabled();
  } finally {
    await mutate(page.request, "auth/me", { password }, "DELETE");
    await cleanup(request);
  }
});

test("logged catalog and quota failures keep data and recover with retry", async ({
  page,
}) => {
  let catalogFailure = false;
  let quotaFailure = true;
  const item = food(1001, 31, { price: 0 });
  await page.route("**/api/auth/me", (r) => r.fulfill({ json: user }));
  await page.route("**/api/listings", (r) =>
    r.fulfill(
      catalogFailure
        ? { status: 503, json: { detail: "Katalog sementara gagal" } }
        : { json: [item] },
    ),
  );
  await page.route("**/api/listings/*/reservation-policy", (r) =>
    r.fulfill(
      quotaFailure
        ? { status: 503, json: { detail: "Kuota sementara gagal" } }
        : {
            json: {
              remaining_free_portions: 1,
              active_free_reservation_id: null,
              max_quantity: 1,
              reason: "",
              day: "2026-10-24",
            },
          },
    ),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Daftar", exact: true }).click();
  await page
    .getByRole("button", { name: "Pesan Food 1001", exact: true })
    .click();
  await expect(detail(page)).toContainText("Kuota sementara gagal");
  await expect(
    page.getByRole("button", { name: "Klaim donasi gratis", exact: true }),
  ).toBeDisabled();
  quotaFailure = false;
  await page
    .getByRole("button", { name: "Coba lagi kuota", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Klaim donasi gratis", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByLabel("Jumlah porsi", { exact: true }),
  ).toHaveAttribute("max", "1");
  await page
    .getByRole("navigation", { name: "Navigasi pembeli" })
    .getByRole("button", { name: "Jelajahi", exact: true })
    .click();
  await expect(detail(page)).toHaveCount(0);
  catalogFailure = true;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(
    page
      .getByRole("region", { name: "Jelajahi makanan", exact: true })
      .getByRole("alert"),
  ).toContainText("Katalog sementara gagal");
  await expect(page.locator(".food-card")).toHaveCount(1);
  catalogFailure = false;
  await page
    .getByRole("button", { name: "Coba lagi katalog", exact: true })
    .click();
  await expect(
    page
      .getByRole("region", { name: "Jelajahi makanan", exact: true })
      .getByRole("alert"),
  ).toHaveCount(0);
});

test("urgent real order cannot be cancelled from UI or direct API", async ({
  page,
  request,
}) => {
  const stores = await register(request, "partner");
  await register(page.request, "buyer");
  try {
    const result = await mutate(request, "partner/listings", {
      ...listing(`Urgent ${Date.now()}`),
      store_id: stores[0].id,
      pickup_end: new Date(Date.now() + 20 * 60000).toISOString(),
    });
    expect(result.status()).toBe(201);
    const item = await result.json();
    await page.goto(`/?listing=${item.id}`);
    await expect(detail(page)).toContainText(
      "Pesanan ini tidak bisa dibatalkan",
    );
    await page
      .getByRole("button", { name: "Simulasikan pembayaran berhasil" })
      .click();
    await page.getByRole("button", { name: "Lihat pesanan saya" }).click();
    await expect(
      page.getByRole("button", { name: "Batalkan", exact: true }),
    ).toBeDisabled();
    const orders = await (await page.request.get("/api/reservations")).json();
    const rejected = await mutate(
      page.request,
      `reservations/${orders[0].id}/cancel`,
    );
    expect(rejected.status()).toBe(409);
    const inventory = await (await request.get("/api/partner/listings")).json();
    expect(inventory.find((row: Listing) => row.id === item.id).stock).toBe(3);
  } finally {
    await mutate(page.request, "auth/me", { password }, "DELETE");
    await cleanup(request);
  }
});

test("logged initial loading and offline preview are labelled honestly", async ({
  page,
}) => {
  let fail = false;
  let release!: () => void;
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/auth/me", (r) => r.fulfill({ json: user }));
  await page.route("**/api/listings", async (r) => {
    await waiting;
    await r.fulfill(
      fail
        ? { status: 503, json: { detail: "Server sedang offline" } }
        : { json: [food(1101, 31)] },
    );
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(
    page.getByRole("heading", { name: "Makanan surplus di sekitar Anda" }),
  ).toBeVisible();
  await expect(
    page.getByText("Memuat katalog…", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/6 contoh listing/)).toBeVisible();
  fail = true;
  release();
  await expect(
    page.getByRole("region", { name: "Jelajahi makanan", exact: true }),
  ).toContainText("Pratinjau demo, bukan data toko");
  await page.getByRole("button", { name: "Daftar", exact: true }).click();
  await page
    .getByRole("button", { name: /^Pesan / })
    .first()
    .click();
  await expect(
    detail(page).getByRole("button", {
      name: "Simulasikan pembayaran berhasil",
    }),
  ).toBeDisabled();
});
