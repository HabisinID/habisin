import { test, expect } from "./fixtures";
import { register, mutate, listing, cleanup } from "./backend-fixtures";
import { food } from "./discovery-data";
import type { Reservation } from "../src/lib/api";

const buyer = {
  id: 919,
  username: "revision",
  name: "Pembeli Revisi",
  role: "buyer",
  email: "r@example.com",
};
const errors = new WeakMap<object, string[]>();
test.beforeEach(async ({ page }) => {
  const list: string[] = [];
  errors.set(page, list);
  page.on("pageerror", (e) => list.push(e.message));
});
test.afterEach(async ({ page }) => {
  expect(errors.get(page)).toEqual([]);
});

test("currency focus wraps the prefix and complete input on desktop and mobile", async ({
  page,
}) => {
  await register(page.request, "partner", 1);
  try {
    await page.goto("/");
    await page
      .getByRole("button", { name: "Tambah listing", exact: true })
      .click();
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      for (const label of ["Harga normal (Rp)", "Harga sekarang (Rp)"]) {
        const input = page.getByLabel(label, { exact: true });
        await input.fill("10000");
        await input.focus();
        await expect(input).toHaveCSS("outline-style", "none");
        await expect(input.locator("..")).toHaveCSS(
          "outline-color",
          "rgb(62, 107, 38)",
        );
        await expect(input.locator("..")).toHaveCSS("outline-width", "3px");
        await expect(input.locator("..")).toContainText("Rp");
      }
    }
    await page.screenshot({ path: "/tmp/habisin-bugfix-price-mobile.png" });
  } finally {
    await cleanup(page.request);
  }
});

test("map labels fit text and selection leaves room for photo and centered detail arrow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.route("**/api/auth/me", (r) => r.fulfill({ json: buyer }));
  await page.route("**/api/listings", (r) =>
    r.fulfill({
      json: [
        food(810, 31, {
          name: "Roti",
          store: "A",
          store_summary: { ...food(810, 31).store_summary!, name: "A" },
        }),
        food(811, 32, {
          name: "Sup",
          store: "Toko Panjang Sekali",
          store_summary: {
            ...food(811, 32).store_summary!,
            name: "Toko Panjang Sekali",
          },
          latitude: -6.367,
        }),
      ],
    }),
  );
  await page.goto("/");
  await expect(page.locator(".discovery-pin")).toHaveCount(2);
  const widths = await page
    .locator(".discovery-pin > span")
    .evaluateAll((els) => els.map((el) => (el as HTMLElement).offsetWidth));
  expect(Math.max(...widths)).toBeLessThanOrEqual(280);
  expect(Math.abs(widths[0] - widths[1])).toBeGreaterThan(35);
  const pin = page.locator(".discovery-pin").filter({ hasText: "A | Rp" });
  const pinBox = await pin.boundingBox(),
    labelBox = await pin.locator(":scope > span").boundingBox();
  expect(Math.abs(pinBox!.x - labelBox!.x)).toBeLessThan(3);
  const card = page.locator('.food-card[data-listing-id="810"]');
  await card.getByRole("button", { name: "Lihat Roti", exact: true }).click();
  await expect(card).toHaveAttribute("data-selected", "true");
  const arrow = card.getByRole("button", {
    name: "Lihat detail Roti",
    exact: true,
  });
  await expect(arrow.locator("svg")).toBeVisible();
  expect(await arrow.innerText()).toBe("");
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const bounds = await card.boundingBox(),
      image = await card
        .getByRole("button", { name: "Pesan Roti", exact: true })
        .boundingBox(),
      action = await arrow.boundingBox();
    expect(image!.x - bounds!.x).toBeGreaterThanOrEqual(10);
    expect(action!.x).toBeGreaterThan(image!.x + image!.width);
    expect(action!.width).toBeGreaterThanOrEqual(44);
    // Centered within the content row, above the full-width progress bar.
    const body = await card.locator('[class*="cardBody"]').boundingBox();
    expect(
      Math.abs(action!.y + action!.height / 2 - (body!.y + body!.height / 2)),
    ).toBeLessThan(2);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.screenshot({
    path: "/tmp/habisin-bugfix-map-mobile.png",
    fullPage: true,
  });
  await arrow.click();
  await expect(
    page.getByRole("region", { name: "Detail makanan", exact: true }),
  ).toBeVisible();
});

test("cart photos remain four to three and trash buttons remove cart and favorite only", async ({
  page,
}) => {
  await register(page.request, "buyer");
  try {
    await page.goto("/?listing=1");
    await page
      .getByRole("button", { name: "Masukkan keranjang", exact: true })
      .click();
    await page.getByRole("button", { name: /^Keranjang/ }).click();
    const row = page.locator('[class*="cartRow"]').first();
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      const b = await row.locator('[class*="thumb"]').boundingBox();
      expect(b!.width / b!.height).toBeCloseTo(4 / 3, 2);
      await expect(row.getByRole("button", { name: /^Hapus/ })).toHaveCSS(
        "color",
        "rgb(177, 63, 50)",
      );
      await expect(row.getByRole("button", { name: /^Hapus/ })).toHaveCSS(
        "border-top-style",
        "solid",
      );
      await expect(row.locator("svg.lucide-trash-2")).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
    await page.screenshot({ path: "/tmp/habisin-bugfix-cart-mobile.png" });
    await row.getByRole("button", { name: /^Hapus/ }).click();
    await expect(
      page.getByText("Keranjang masih kosong.", { exact: false }),
    ).toBeVisible();
    await page.evaluate(() => localStorage.setItem("habisin-saved", "[1]"));
    await page.reload();
    await page.getByRole("button", { name: "Favorit", exact: true }).click();
    const remove = page.getByRole("button", {
      name: /^Hapus .* dari favorit$/,
    });
    await expect(remove.locator("svg.lucide-trash-2")).toBeVisible();
    await expect(remove).toHaveCSS("border-top-color", "rgb(177, 63, 50)");
    await remove.click();
    await expect(page.locator(".food-card")).toHaveCount(0);
    expect((await page.request.get("/api/listings")).ok()).toBe(true);
  } finally {
    await cleanup(page.request);
  }
});

test("seller cancels with required reason, retries errors and buyer sees preserved history", async ({
  page,
  request,
}) => {
  const stores = await register(page.request, "partner", 1);
  await register(request, "buyer");
  try {
    const item = await (
      await mutate(page.request, "partner/listings", {
        ...listing("Pesanan Revisi"),
        pickup_end: new Date(Date.now() + 20 * 60000).toISOString(),
        store_id: stores[0].id,
      })
    ).json();
    const order = await (
      await mutate(request, "reservations", {
        listing_id: item.id,
        quantity: 1,
      })
    ).json();
    await page.goto("/");
    await page
      .getByRole("navigation", { name: "Navigasi mitra" })
      .getByRole("button", { name: /Pesanan/ })
      .click();
    await page
      .getByRole("button", { name: `Batalkan pesanan ${order.code}` })
      .click();
    const form = page.getByRole("form", { name: `Pembatalan ${order.code}` });
    await expect(
      form.getByRole("button", { name: "Konfirmasi pembatalan" }),
    ).toBeDisabled();
    await page
      .getByLabel("Alasan pembatalan (wajib)")
      .fill("Stok tidak layak diserahkan");
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await expect(
        form.getByRole("button", { name: "Konfirmasi pembatalan" }),
      ).toBeVisible();
    }
    await page.screenshot({
      path: "/tmp/habisin-bugfix-cancel-form-mobile.png",
      fullPage: true,
    });

    await page.route(
      `**/api/partner/reservations/${order.id}/cancel`,
      (r) => r.fulfill({ status: 503, json: { detail: "Gangguan sementara" } }),
      { times: 1 },
    );
    await form.getByRole("button", { name: "Konfirmasi pembatalan" }).click();
    await expect(
      page.getByRole("alert").filter({ hasText: "Gangguan sementara" }),
    ).toBeVisible();
    await expect(page.getByLabel("Alasan pembatalan (wajib)")).toHaveValue(
      "Stok tidak layak diserahkan",
    );
    await form.getByRole("button", { name: "Konfirmasi pembatalan" }).click();
    await expect(page.getByText("Belum ada pesanan aktif.")).toBeVisible();
    await page.getByRole("button", { name: "Riwayat", exact: true }).click();
    await expect(
      page.getByText("Dibatalkan oleh mitra: Stok tidak layak diserahkan"),
    ).toBeVisible();
    expect(
      (
        await mutate(page.request, `partner/reservations/${order.id}/cancel`, {
          reason: "Retry",
        })
      ).status(),
    ).toBe(200);
    const stock = await (
      await page.request.get(`/api/partner/listings/${item.id}`)
    ).json();
    expect(stock.stock).toBe(4);
    const rows: Reservation[] = await (
      await request.get("/api/reservations")
    ).json();
    expect(rows[0].cancellation_note).toBe("Stok tidak layak diserahkan");
    const buyerContext = await page
      .context()
      .browser()!
      .newContext({
        baseURL: "http://127.0.0.1:3000",
        storageState: await request.storageState(),
      });
    try {
      const buyerPage = await buyerContext.newPage();
      buyerPage.on("pageerror", (e) => errors.get(page)!.push(e.message));
      await buyerPage.goto("/");
      await buyerPage
        .getByRole("button", { name: "Pesanan saya", exact: true })
        .click();
      await expect(buyerPage.locator(".order-item")).toHaveCount(0);
      await buyerPage
        .getByRole("button", { name: "Riwayat", exact: true })
        .click();
      await expect(
        buyerPage.getByText("Alasan mitra: Stok tidak layak diserahkan"),
      ).toBeVisible();
      await buyerPage
        .getByRole("button", { name: `Tiket ${order.code}`, exact: true })
        .click();
      await expect(
        buyerPage.getByText(
          "Alasan pembatalan mitra: Stok tidak layak diserahkan",
        ),
      ).toBeVisible();
    } finally {
      await buyerContext.close();
    }

    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: "/tmp/habisin-bugfix-cancel-mobile.png",
      fullPage: true,
    });
  } finally {
    await cleanup(request);
    await cleanup(page.request);
  }
});

test("buyer order automatically leaves active list on expiry and remains in history", async ({
  page,
}) => {
  const time = Date.now();
  await page.clock.install({ time });
  const order = {
    id: 810,
    listing: food(810, 31, { pickup_end: new Date(time + 3000).toISOString() }),
    code: "ABCDE",
    quantity: 1,
    total: 5000,
    status: "reserved",
    created_at: new Date(time).toISOString(),
    can_cancel: false,
  };
  await page.route("**/api/auth/me", (r) => r.fulfill({ json: buyer }));
  await page.route("**/api/reservations", (r) => r.fulfill({ json: [order] }));
  await page.goto("/");
  await page.getByRole("button", { name: "Pesanan saya", exact: true }).click();
  await expect(page.locator(".order-item")).toHaveCount(1);
  await page.clock.runFor(4000);
  await expect(page.locator(".order-item")).toHaveCount(0);
  await page.getByRole("button", { name: "Riwayat", exact: true }).click();
  await expect(page.locator(".order-item")).toHaveCount(1);
  await expect(page.getByText("Kedaluwarsa", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Tiket ABCDE", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "Waktu pengambilan berakhir",
      exact: true,
    }),
  ).toBeVisible();
});

test("partner order disappears at deadline without losing history", async ({
  page,
}) => {
  const time = Date.now();
  await page.clock.install({ time });
  const order = {
    id: 820,
    listing: food(820, 31, { pickup_end: new Date(time + 3000).toISOString() }),
    code: "FGHJK",
    quantity: 1,
    total: 5000,
    status: "reserved",
    created_at: new Date(time).toISOString(),
    buyer_name: "Pembeli Lama",
  };
  await page.route("**/api/auth/me", (r) =>
    r.fulfill({ json: { ...buyer, role: "partner" } }),
  );
  await page.route("**/api/partner/dashboard?period=*", (r) =>
    r.fulfill({
      json: {
        booked_portions: 1,
        simulated_total: 5000,
        series: [],
        pickups: [order],
        orders: [order],
        listings: [],
        stores: [],
      },
    }),
  );
  await page.goto("/");
  await expect(page.getByText("Pembeli Lama", { exact: true })).toBeVisible();
  await page.clock.runFor(4000);
  await expect(page.getByText("Pembeli Lama", { exact: true })).toHaveCount(0);
  await page
    .getByRole("navigation", { name: "Navigasi mitra" })
    .getByRole("button", { name: /Pesanan/ })
    .click();
  await expect(page.getByText("Belum ada pesanan aktif.")).toBeVisible();
  await page.getByRole("button", { name: "Riwayat", exact: true }).click();
  await expect(page.getByText("Pembeli Lama", { exact: true })).toBeVisible();
});
