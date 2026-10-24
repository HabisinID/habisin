import { test, expect } from "./fixtures";
import { type Page } from "@playwright/test";
import { food, origin, baseFilters } from "./discovery-data";
import { discover, storePriceRange } from "../src/lib/discovery";
import {
  register,
  mutate,
  listing,
  cleanup,
  password,
} from "./backend-fixtures";

async function add(page: Page, id: number, quantity = 1) {
  await page.goto(`/?listing=${id}`);
  await page.getByLabel("Jumlah porsi", { exact: true }).fill(String(quantity));
  await page
    .getByRole("button", { name: "Masukkan keranjang", exact: true })
    .click();
  await expect(page.getByRole("button", { name: /^Keranjang/ })).toContainText(
    /Keranjang\d+/,
  );
}
async function cart(page: Page) {
  await page.getByRole("button", { name: /^Keranjang/ }).click();
  await expect(
    page.getByRole("region", { name: "Keranjang makanan" }),
  ).toBeVisible();
}
const readRows = async (page: Page) =>
  await (await page.request.get("/api/reservations")).json();

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
    "rgb(62, 107, 38)",
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
  const labels = await page
    .getByRole("navigation", { name: "Navigasi pembeli" })
    .getByRole("button")
    .allTextContents();
  expect(labels).toEqual(["Jelajahi", "Favorit", "Keranjang", "Pesanan saya"]);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "/tmp/habisin-role-buyer-mobile.png" });
  expect(errors).toEqual([]);
});

test("cart groups by store, persists, checks out only selected items and displays real tickets", async ({
  page,
  request,
}) => {
  const stores = await register(request, "partner");
  await register(page.request, "buyer");
  try {
    const items = [];
    for (const [name, store] of [
      ["Keranjang Roti", stores[0]],
      ["Keranjang Kue", stores[0]],
      ["Keranjang Nasi", stores[1]],
    ] as const) {
      const response = await mutate(request, "partner/listings", {
        ...listing(name),
        store_id: store.id,
      });
      expect(response.status()).toBe(201);
      items.push(await response.json());
    }
    await add(page, items[0].id);
    await add(page, items[1].id);
    await add(page, items[2].id);
    await cart(page);
    await expect(
      page.getByRole("heading", { name: stores[0].name, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: stores[1].name, exact: true }),
    ).toBeVisible();
    await page.getByLabel("Porsi Keranjang Roti").fill("2");
    await page.getByLabel("Pilih Keranjang Kue", { exact: true }).uncheck();
    await page.reload();
    await cart(page);
    await expect(page.getByLabel("Porsi Keranjang Roti")).toHaveValue("2");
    await expect(
      page.getByLabel("Pilih Keranjang Kue", { exact: true }),
    ).not.toBeChecked();
    await page.screenshot({ path: "/tmp/habisin-role-cart-desktop.png" });
    await page
      .getByRole("button", { name: "Bayar (simulasi)", exact: true })
      .click();
    await expect(
      page.getByRole("region", { name: "Tiket pengambilan" }),
    ).toBeVisible();
    await expect(page.locator('[class*="claim"]>strong')).toHaveText(
      /^[A-Z2-9]{5}$/,
    );
    expect(await readRows(page)).toHaveLength(2);
    await page.screenshot({ path: "/tmp/habisin-role-ticket-desktop.png" });
    await page
      .getByRole("button", { name: "Lihat pesanan saya", exact: true })
      .click();
    await expect(page.locator(".order-item")).toHaveCount(2);
    await page.getByRole("button", { name: /^Keranjang/ }).click();
    await expect(page.getByLabel("Porsi Keranjang Kue")).toBeVisible();
    await expect(page.getByLabel("Porsi Keranjang Roti")).toHaveCount(0);
    await page
      .getByRole("button", { name: "Hapus Keranjang Kue", exact: true })
      .click();
    await expect(
      page.getByText("Keranjang masih kosong.", { exact: false }),
    ).toBeVisible();
  } finally {
    for (const row of await readRows(page))
      await mutate(page.request, `reservations/${row.id}/cancel`);
    await cleanup(page.request);
    await cleanup(request);
  }
});

test("checkout rejects changed price and allows retry with current price", async ({
  page,
  request,
}) => {
  const stores = await register(request, "partner", 1);
  await register(page.request, "buyer");
  try {
    const item = await (
      await mutate(request, "partner/listings", {
        ...listing("Harga Berubah"),
        store_id: stores[0].id,
      })
    ).json();
    await add(page, item.id);
    await cart(page);
    await mutate(
      request,
      `partner/listings/${item.id}`,
      { price: 6000 },
      "PATCH",
    );
    await page
      .getByRole("button", { name: "Bayar (simulasi)", exact: true })
      .click();
    await expect(
      page
        .getByRole("alert")
        .filter({ hasText: "Harga Harga Berubah berubah" }),
    ).toBeVisible();
    expect(await readRows(page)).toHaveLength(0);
    await page
      .getByRole("button", { name: "Bayar (simulasi)", exact: true })
      .click();
    await expect(
      page.getByRole("region", { name: "Tiket pengambilan" }),
    ).toBeVisible();
    expect((await readRows(page))[0].total).toBe(6000);
  } finally {
    for (const row of await readRows(page))
      await mutate(page.request, `reservations/${row.id}/cancel`);
    await cleanup(page.request);
    await cleanup(request);
  }
});

test("lost checkout response can be recovered after reload without duplicate booking", async ({
  page,
  request,
}) => {
  const stores = await register(request, "partner", 1);
  await register(page.request, "buyer");
  try {
    const item = await (
      await mutate(request, "partner/listings", {
        ...listing("Respons Terputus"),
        stock: 1,
        store_id: stores[0].id,
      })
    ).json();
    await add(page, item.id);
    await cart(page);
    await page.route(
      "**/api/checkout",
      async (route) => {
        expect((await route.fetch()).status()).toBe(201);
        await route.abort("failed");
      },
      { times: 1 },
    );
    await page
      .getByRole("button", { name: "Bayar (simulasi)", exact: true })
      .click();
    await expect(
      page.getByText("Status pembayaran terakhir belum dipastikan.", {
        exact: false,
      }),
    ).toBeVisible();
    expect(await readRows(page)).toHaveLength(1);
    await page.reload();
    await cart(page);
    await expect(
      page.getByRole("button", { name: "Periksa pembayaran terakhir" }),
    ).toBeEnabled();
    await page
      .getByRole("button", { name: "Periksa pembayaran terakhir" })
      .click();
    await expect(
      page.getByRole("region", { name: "Tiket pengambilan" }),
    ).toBeVisible();
    expect(await readRows(page)).toHaveLength(1);
  } finally {
    for (const row of await readRows(page))
      await mutate(page.request, `reservations/${row.id}/cancel`);
    await cleanup(page.request);
    await cleanup(request);
  }
});

test("cart is isolated between accounts and remains responsive on mobile", async ({
  page,
}) => {
  await register(page.request, "buyer");
  const first = await (await page.request.get("/api/auth/me")).json();
  try {
    await add(page, 1);
    await mutate(page.request, "auth/logout");
    await register(page.request, "buyer");
    await page.goto("/");
    await cart(page);
    await expect(
      page.getByText("Keranjang masih kosong.", { exact: false }),
    ).toBeVisible();
    await cleanup(page.request);
    await mutate(page.request, "auth/login", {
      username: first.username,
      password,
    });
    await page.goto("/");
    await cart(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByLabel("Porsi Surprise Pastry Box")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({ path: "/tmp/habisin-role-cart-mobile.png" });
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
