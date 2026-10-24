import { expect, test } from "./fixtures";
import type { Page } from "@playwright/test";
import type { Store } from "../src/lib/api";

const address = "Jalan Margonda Raya 10, Depok";
const result = {
  display_name: "Jalan Margonda Raya, Depok, Jawa Barat",
  latitude: -6.36,
  longitude: 106.83,
};
const partner = {
  id: 1,
  username: "mitra",
  name: "Mitra Test",
  email: "mitra@example.com",
  role: "partner",
};

async function mockApi(page: Page, user: typeof partner | null = partner) {
  let store: Store | null = null;
  const stores = new Map<number, Store>();
  let nextId = 7;
  const writes: { method: string; data: Record<string, unknown> }[] = [];
  let lookups = 0;
  await page.route("**/api/auth/me", (route) =>
    route.fulfill(
      user
        ? { json: user }
        : { status: 403, json: { detail: "Authentication required" } },
    ),
  );
  await page.route("**/api/auth/csrf", (route) =>
    route.fulfill({ json: { csrfToken: "test-csrf" } }),
  );
  await page.route("**/api/partner/geocode", async (route) => {
    lookups++;
    expect(
      route.request().postDataJSON().address.length,
    ).toBeGreaterThanOrEqual(5);
    await route.fulfill({
      json: { results: [result], geocode_token: "test-geocode-token" },
    });
  });
  await page.route(/\/api\/partner\/stores(?:\/\d+)?$/, async (route) => {
    const request = route.request();
    const id = Number(new URL(request.url()).pathname.split("/")[4]);
    if (request.method() === "GET")
      return route.fulfill({
        json: id ? stores.get(id) : { stores: [...stores.values()] },
      });
    const data = request.postDataJSON();
    writes.push({ method: request.method(), data });
    if (request.method() === "DELETE") {
      expect(data.confirmation_name).toBe(stores.get(id)?.name);
      stores.delete(id);
      store = null;
      return route.fulfill({ status: 204 });
    }
    store = {
      id: id || nextId++,
      created_at: "2026-10-22T00:00:00Z",
      updated_at: "2026-10-22T00:00:00Z",
      is_open: true,
      ...(id ? stores.get(id) : {}),
      ...data,
    } as Store;
    stores.set(store.id, store);
    await route.fulfill({
      status: request.method() === "POST" ? 201 : 200,
      json: store,
    });
  });
  await page.route("**/api/stores/*", (route) =>
    route.fulfill(
      store ? { json: store } : { status: 404, json: { detail: "Not found" } },
    ),
  );
  return { writes, store: () => store, stores, lookups: () => lookups };
}
async function start(page: Page) {
  await page.goto("/partner/store");
  await page
    .getByRole("button", { name: "Daftarkan toko", exact: true })
    .click();
  await page.getByLabel("Nama toko", { exact: true }).fill("Dapur Berkah");
  await page
    .getByLabel("Deskripsi toko")
    .fill("Masakan rumahan segar untuk tetangga.");
  await page.getByLabel("Alamat toko", { exact: true }).fill(address);
}
async function confirm(page: Page) {
  await page.getByRole("button", { name: "Cari alamat di peta" }).click();
  await expect(
    page.getByRole("region", { name: "Peta konfirmasi posisi toko" }),
  ).toBeVisible();
  await page.getByRole("checkbox", { name: "Saya sudah memastikan" }).check();
}

test("partner creates, edits, closes, reopens, and deletes a store", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const api = await mockApi(page);
  await start(page);
  await expect(
    page.getByRole("button", { name: "Daftarkan toko", exact: true }),
  ).toBeDisabled();
  await confirm(page);
  await expect(page.locator(".store-pin")).toBeVisible();
  await page
    .getByRole("region", { name: "Peta konfirmasi posisi toko" })
    .click({ position: { x: 130, y: 120 } });
  await expect(
    page.getByRole("checkbox", { name: "Saya sudah memastikan" }),
  ).not.toBeChecked();
  await page.getByLabel("Latitude", { exact: true }).fill("-6.361");
  await page.getByLabel("Longitude", { exact: true }).fill("106.831");
  await page.getByRole("checkbox", { name: "Saya sudah memastikan" }).check();
  await page
    .getByRole("button", { name: "Daftarkan toko", exact: true })
    .click();
  await expect(
    page
      .locator("main")
      .getByRole("status")
      .filter({ hasNotText: "Memuat peta" }),
  ).toContainText("sudah terdaftar");
  expect(api.store()?.latitude).toBe(-6.361);
  expect(api.writes[0].data.geocode_token).toBe("test-geocode-token");
  expect(api.writes[0].data.location_confirmed).toBe(true);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(
    page.getByRole("heading", { name: "Dapur Berkah", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Edit toko", exact: true }).click();
  await page.getByLabel("Nama toko", { exact: true }).fill("Dapur Tetangga");
  await page.getByLabel("Jam buka (WIB)").fill("22:00");
  await page.getByLabel("Jam tutup (WIB)").fill("04:00");
  await page
    .getByLabel("Alamat toko", { exact: true })
    .fill("Jalan Melati 22, Depok");
  await expect(
    page.getByRole("button", { name: "Simpan perubahan toko" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("region", { name: "Peta konfirmasi posisi toko" }),
  ).toHaveCount(0);
  await confirm(page);
  await page.getByRole("button", { name: "Simpan perubahan toko" }).click();
  await expect(
    page
      .locator("main")
      .getByRole("status")
      .filter({ hasNotText: "Memuat peta" }),
  ).toContainText("berhasil diperbarui");
  expect(api.lookups()).toBe(2);
  expect(api.store()?.address).toBe("Jalan Melati 22, Depok");
  await expect(
    page.getByText(/22:00–04:00 WIB \(hari berikutnya\)/),
  ).toBeVisible();
  await page.getByRole("button", { name: "Tutup toko sementara" }).click();
  await expect(
    page.getByText("Toko ditutup sementara", { exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Lihat profil publik" }).click();
  await expect(page).toHaveURL(/\/stores\/7$/, { timeout: 15000 });
  await expect(
    page.getByRole("heading", { name: "Dapur Tetangga" }),
  ).toBeVisible();
  await expect(
    page.getByText("Toko ditutup sementara", { exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.goto("/partner/store");
  await page.getByRole("button", { name: "Aktifkan kembali toko" }).click();
  await expect(page.getByText("Toko aktif", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Hapus toko", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("button", { name: "Hapus toko permanen" }),
  ).toBeDisabled();
  await dialog
    .getByLabel("Ketik nama toko untuk konfirmasi")
    .fill("Dapur Tetangga");
  await dialog.getByRole("button", { name: "Hapus toko permanen" }).click();
  await expect(
    page
      .locator("main")
      .getByRole("status")
      .filter({ hasNotText: "Memuat peta" }),
  ).toContainText("berhasil dihapus");
  expect(api.store()).toBeNull();
  await page.goto("/stores/7");
  await expect(
    page.getByRole("heading", { name: "Toko tidak ditemukan." }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("geocoding failures and invalid coordinates cannot save a store", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const api = await mockApi(page);
  await start(page);
  await page.route("**/api/partner/geocode", (route) =>
    route.fulfill({
      status: 503,
      json: { detail: "Pencarian alamat sedang tidak tersedia." },
    }),
  );
  await page.getByRole("button", { name: "Cari alamat di peta" }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "tidak tersedia",
  );
  await page.route("**/api/partner/geocode", (route) =>
    route.fulfill({ json: { results: [], geocode_token: null } }),
  );
  await page.getByRole("button", { name: "Cari alamat di peta" }).click();
  await expect(
    page
      .locator("main")
      .getByRole("status")
      .filter({ hasNotText: "Memuat peta" }),
  ).toContainText("Alamat belum ditemukan");
  await page.route("**/api/partner/geocode", (route) =>
    route.fulfill({ json: { results: [result], geocode_token: "new-token" } }),
  );
  await confirm(page);
  await page.getByLabel("Latitude", { exact: true }).fill("");
  await page.getByRole("checkbox", { name: "Saya sudah memastikan" }).check();
  await page
    .getByRole("button", { name: "Daftarkan toko", exact: true })
    .click();
  expect(api.writes).toEqual([]);
  await page.getByLabel("Latitude", { exact: true }).fill("-6.35");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});

test("anonymous visitors can sign in and buyers cannot manage stores", async ({
  page,
}) => {
  await mockApi(page, null);
  await page.goto("/partner/store");
  await page.getByRole("button", { name: "Buat akun mitra" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByLabel("Daftar sebagai")).toHaveValue("partner");
  await page.getByRole("button", { name: "Tutup", exact: true }).click();
  await page.route("**/api/auth/me", (route) =>
    route.fulfill({ json: { ...partner, role: "buyer" } }),
  );
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(
    page.getByRole("heading", { name: "Halaman khusus mitra" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Daftarkan toko" }),
  ).toHaveCount(0);
});

test("partner keeps two stores separate when editing and closing a branch", async ({
  page,
}) => {
  const api = await mockApi(page);
  await start(page);
  await confirm(page);
  await page
    .getByRole("button", { name: "Daftarkan toko", exact: true })
    .click();
  await page.getByRole("button", { name: "Tambah toko", exact: true }).click();
  await page.getByLabel("Nama toko", { exact: true }).fill("Dapur Cabang Dua");
  await page.getByLabel("Deskripsi toko").fill("Cabang kedua yang terpisah.");
  await page.getByLabel("Alamat toko", { exact: true }).fill(address);
  await confirm(page);
  await page
    .getByRole("button", { name: "Daftarkan toko", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Dapur Cabang Dua", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Tutup toko sementara" }).click();
  await expect(
    page.getByText("Toko ditutup sementara", { exact: true }),
  ).toBeVisible();
  expect(api.stores.get(7)?.is_open).toBe(true);
  expect(api.stores.get(8)?.is_open).toBe(false);
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("button", { name: "Kelola toko Dapur Berkah", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Dapur Berkah", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Toko aktif", { exact: true })).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", {
      name: "Kelola toko Dapur Cabang Dua",
      exact: true,
    }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
