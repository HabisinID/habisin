import { test, expect } from "./fixtures";
import type { Page } from "@playwright/test";
import { food } from "./discovery-data";
import { register } from "./backend-fixtures";
import { lowContrastText } from "./contrast";

const widths = [360, 390, 768, 1024, 1440];
const store = {
  id: 31,
  name: "Dapur Margonda",
  description: "Makanan surplus layak makan.",
  address: "Jalan Margonda, Beji, Depok",
  latitude: -6.366,
  longitude: 106.829,
  is_open: true,
  opening_time: "08:00:00",
  closing_time: "23:00:00",
  category: "Roti & kue",
  city: "Depok",
  weekly_hours: [],
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};
const item = food(911, 31, {
  name: "Roti coklat keluarga",
  store: store.name,
  stock: 4,
  price: 8000,
  original_price: 16000,
  pickup_end: new Date(Date.now() + 48 * 3600000).toISOString(),
});
const order = {
  id: 511,
  listing: item,
  buyer_name: "Rani Adinda",
  quantity: 2,
  total: 16000,
  code: "ACDEF",
  note: "Bawa wadah sendiri",
  status: "paid",
  created_at: new Date().toISOString(),
  pay_before: new Date(Date.now() + 60000).toISOString(),
  cancel_until: new Date(Date.now() + 24 * 3600000).toISOString(),
};
async function mock(page: Page, role: "buyer" | "partner" | "admin" | null) {
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/auth/me")
      return route.fulfill(
        role
          ? {
              json: {
                id: 999,
                username: "responsive",
                name: "Rani Adinda",
                email: "audit@example.com",
                role,
              },
            }
          : { status: 403, json: { detail: "Belum masuk" } },
      );
    if (path === "/api/listings") return route.fulfill({ json: [item] });
    if (path === "/api/reservations") return route.fulfill({ json: [order] });
    if (path === "/api/reservations/511") return route.fulfill({ json: order });
    if (path === "/api/partner/listings")
      return route.fulfill({
        json: [item, { ...item, id: 912, name: "Paket makan malam" }],
      });
    if (path === "/api/partner/stores")
      return route.fulfill({ json: { stores: [store] } });
    if (path === "/api/stores/31") return route.fulfill({ json: store });
    if (path === "/api/stores/31/listings")
      return route.fulfill({ json: [item] });
    if (path === "/api/partner/orders")
      return route.fulfill({
        json: {
          results: [order],
          count: 1,
          page: 1,
          page_size: 25,
          counts: { paid: 1 },
        },
      });
    if (path === "/api/admin/summary")
      return route.fulfill({
        json: {
          listings_live: 1,
          orders_today: 1,
          partners_active: 1,
          stores_open: 1,
          listings_taken_down: 0,
          recent_activity: [],
        },
      });
    if (path === "/api/admin/listings")
      return route.fulfill({
        json: { results: [item], count: 1, page: 1, page_size: 25 },
      });
    if (path === "/api/admin/moderation-logs")
      return route.fulfill({
        json: { results: [], count: 0, page: 1, page_size: 25 },
      });
    return route.fulfill({ status: 404, json: { detail: "Unmocked " + path } });
  });
}
async function fit(page: Page) {
  expect(
    await page.evaluate(() => ({
      width: innerWidth,
      scroll: document.documentElement.scrollWidth,
    })),
    page.url(),
  ).toEqual(
    expect.objectContaining({
      width: await page.evaluate(() => innerWidth),
      scroll: await page.evaluate(() => innerWidth),
    }),
  );
}
async function touchTarget(locator: ReturnType<Page["getByRole"]>) {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  expect(box!.width).toBeGreaterThanOrEqual(44);
  expect(box!.height).toBeGreaterThanOrEqual(44);
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(
    (await locator.page().evaluate(() => innerWidth)) + 1,
  );
}

for (const theme of ["light", "dark"]) {
  test(`guest and buyer headers stay compact with reachable actions (${theme})`, async ({
    page,
  }) => {
    test.setTimeout(90000);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.addInitScript(
      (value) => localStorage.setItem("habisin-theme", value),
      theme,
    );
    await mock(page, null);
    for (const width of widths) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/");
      await expect(
        page
          .getByRole("banner")
          .getByRole("button", { name: "Daftar gratis", exact: true }),
      ).toBeVisible();
      await fit(page);
      const h = (await page.getByRole("banner").boundingBox())!.height;
      expect(h).toBeLessThanOrEqual(
        width <= 760 ? 165 : width <= 1100 ? 120 : 90,
      );
      await touchTarget(
        page
          .getByRole("banner")
          .getByRole("button", { name: /^Tema tampilan/ }),
      );
      await touchTarget(
        page
          .getByRole("banner")
          .getByRole("button", { name: "Masuk", exact: true }),
      );
      expect(await lowContrastText(page)).toEqual([]);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page
      .getByRole("banner")
      .getByRole("button", { name: "Masuk", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(
      page
        .getByRole("banner")
        .getByRole("button", { name: "Masuk", exact: true }),
    ).toBeFocused();
    await page
      .getByRole("banner")
      .getByRole("button", { name: "Daftar gratis", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await page.unroute("**/api/**");
    await mock(page, "buyer");
    for (const path of [
      "/jelajahi",
      "/pesanan",
      "/pesanan/511",
      "/pesanan/511/bayar",
      "/stores/31",
    ]) {
      for (const width of widths) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(path);
        const logout = page
          .getByRole("banner")
          .getByRole("button", { name: "Keluar", exact: true });
        await touchTarget(logout);
        await fit(page);
        if (path !== "/stores/31") {
          const h = (await page.getByRole("banner").boundingBox())!.height;
          expect(h).toBeLessThanOrEqual(
            width <= 760 ? 165 : width <= 1100 ? 120 : 90,
          );
        }
      }
    }
    expect(errors).toEqual([]);
  });
  test(`partner subpages and admin navigation fit all viewports (${theme})`, async ({
    page,
  }) => {
    test.setTimeout(90000);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.addInitScript(
      (value) => localStorage.setItem("habisin-theme", value),
      theme,
    );
    await mock(page, "partner");
    for (const path of [
      "/partner",
      "/partner/listings",
      "/partner/orders",
      "/partner/store",
      "/partner/account",
    ]) {
      for (const width of widths) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(path);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        await fit(page);
        await touchTarget(
          page.getByRole("button", { name: "Keluar", exact: true }),
        );
        if (path === "/partner/listings") {
          const row = page.locator('tr[data-listing-id="911"]');
          await expect(row).toBeVisible();
          if (width <= 760) {
            expect((await row.boundingBox())!.height).toBeLessThan(350);
            const price = await row.locator("td").nth(1).boundingBox();
            const stock = await row.locator("td").nth(2).boundingBox();
            expect(Math.abs(price!.y - stock!.y)).toBeLessThan(2);
          }
        }
        if (path === "/partner/orders") {
          const row = page.getByRole("article", {
            name: "Pesanan 511 Rani Adinda",
          });
          await expect(row).toBeVisible();
          if (width <= 760) {
            expect((await row.boundingBox())!.y).toBeLessThan(300);
            const verify = await row
              .getByRole("button", { name: "Verifikasi", exact: true })
              .boundingBox();
            const cancel = await row
              .getByRole("button", { name: "Batalkan Pesanan" })
              .boundingBox();
            expect(Math.abs(verify!.y - cancel!.y)).toBeLessThan(2);
          }
        }
        if (
          width === 390 &&
          ["/partner/orders", "/partner/account"].includes(path)
        )
          expect(await lowContrastText(page)).toEqual([]);
        if (width === 1440) {
          await page.evaluate(() =>
            window.scrollTo(0, document.body.scrollHeight),
          );
          const logout = await page
            .getByRole("button", { name: "Keluar", exact: true })
            .boundingBox();
          expect(logout!.y).toBeGreaterThanOrEqual(0);
          expect(logout!.y + logout!.height).toBeLessThanOrEqual(900);
        }
      }
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/partner/orders");
    const topBefore = (await page.getByRole("main").boundingBox())!.y;
    const menu = page.getByRole("button", { name: "Menu mitra" });
    await menu.click();
    await expect(
      page.getByRole("dialog", { name: "Menu mitra" }),
    ).toBeVisible();
    expect((await page.getByRole("main").boundingBox())!.y).toBe(topBefore);
    await page.keyboard.press("Escape");
    await expect(menu).toBeFocused();
    await menu.click();
    await page
      .getByRole("dialog")
      .getByRole("link", { name: "Listing", exact: true })
      .click();
    await expect(page).toHaveURL(/\/partner\/listings$/);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.getByRole("button", { name: "Menu mitra" }).click();
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Keluar", exact: true }),
    ).toBeVisible();
    await page.unroute("**/api/**");
    await mock(page, "admin");
    for (const path of [
      "/admin",
      "/admin/listings",
      "/admin/log",
      "/admin/account",
    ]) {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(path);
      await touchTarget(
        page.getByRole("button", { name: "Keluar", exact: true }),
      );
      await fit(page);
    }
    expect(errors).toEqual([]);
  });
}

test("mobile filters, status scrolling, profile schedule and account tabs remain usable", async ({
  page,
}) => {
  await mock(page, "partner");
  await page.setViewportSize({ width: 360, height: 844 });
  await page.goto("/partner/orders");
  await expect(page.getByLabel("Tanggal mulai pesanan")).toBeHidden();
  await page.getByRole("button", { name: "Filter", exact: true }).click();
  await page.getByLabel("Tanggal mulai pesanan").fill("2026-10-26");
  await page.getByLabel("Tanggal akhir pesanan").fill("2026-10-28");
  await page.getByLabel("Cabang pesanan").selectOption("31");
  await expect(
    page.getByRole("button", { name: "Filter (3)", exact: true }),
  ).toHaveAttribute("aria-expanded", "true");
  await page.getByRole("button", { name: "Reset filter" }).click();
  await expect(page.getByLabel("Tanggal mulai pesanan")).toHaveValue("");
  await page.getByRole("button", { name: "Filter", exact: true }).click();
  await page.getByRole("button", { name: "Selesai", exact: true }).focus();
  await expect(
    page.getByRole("button", { name: "Selesai", exact: true }),
  ).toBeInViewport();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("button", { name: "Selesai", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.goto("/partner/store");
  await expect(page.getByLabel("Nama toko", { exact: true })).toBeVisible();
  await page
    .getByRole("navigation", { name: "Bagian profil toko" })
    .getByRole("link", { name: "Jam buka", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "C · Jam buka per hari" }),
  ).toBeInViewport();
  const dy = await page
    .getByLabel("Jam buka Senin sesi 1", { exact: true })
    .evaluate((el) =>
      Math.abs(
        el.getBoundingClientRect().y -
          el
            .parentElement!.querySelector(
              'input[aria-label="Jam tutup Senin sesi 1"]',
            )!
            .getBoundingClientRect().y,
      ),
    );
  expect(dy).toBeLessThan(2);
  await page
    .getByLabel("Jam tutup Senin sesi 1", { exact: true })
    .fill("22:00");
  await expect(
    page.getByRole("button", { name: "Simpan perubahan toko" }),
  ).toBeVisible();
  await fit(page);
  await page.getByRole("button", { name: "Batalkan", exact: true }).click();
  await page.goto("/partner/account");
  await page.getByRole("button", { name: "Hapus akun", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Hapus akun", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Hapus akun", exact: true })
    .last()
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await fit(page);
  await page.keyboard.press("Escape");
});

for (const role of ["buyer", "partner"] as const) {
  test(`real logout invalidates ${role} session on mobile and laptop`, async ({
    page,
  }) => {
    for (const width of [390, 1440]) {
      await register(page.request, role, 0);
      await page.setViewportSize({ width, height: 844 });
      await page.goto(role === "buyer" ? "/pesanan" : "/partner/orders");
      await page.getByRole("button", { name: "Keluar", exact: true }).click();
      await expect(page).toHaveURL("/");
      expect((await page.request.get("/api/auth/me")).status()).toBe(403);
      await expect(
        page
          .getByRole("banner")
          .getByRole("button", { name: "Masuk", exact: true }),
      ).toBeVisible();
    }
  });
}

test("logout errors stay visible, prevent duplicate requests and allow retry", async ({
  page,
}) => {
  await mock(page, "buyer");
  await page.route("**/api/auth/csrf", (r) =>
    r.fulfill({ json: { csrfToken: "browser-fixture" } }),
  );
  let calls = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/auth/logout", async (r) => {
    calls++;
    if (calls === 1) {
      await gate;
      await r.fulfill({
        status: 503,
        json: { detail: "Keluar sementara gagal" },
      });
    } else await r.fulfill({ status: 204 });
  });
  await page.goto("/pesanan");
  await page
    .getByRole("banner")
    .getByRole("button", { name: "Keluar", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Sedang keluar" }),
  ).toBeDisabled();
  await expect.poll(() => calls).toBe(1);
  release();
  await expect(
    page.getByRole("alert").filter({ hasText: "Keluar sementara gagal" }),
  ).toBeVisible();
  await expect(page).toHaveURL("/pesanan");
  await page
    .getByRole("banner")
    .getByRole("button", { name: "Keluar", exact: true })
    .click();
  await expect(page).toHaveURL("/");
  expect(calls).toBe(2);
});
