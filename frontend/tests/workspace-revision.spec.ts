import { test, expect } from "./fixtures";
import { register, mutate, listing, password } from "./backend-fixtures";

const noOverflow = async (page: import("@playwright/test").Page) => {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
};

test("real seller notes, private claim code, cancel once and buyer receives reason", async ({
  page,
  request,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const stores = await register(page.request, "partner", 1);
  const created = await mutate(page.request, "partner/listings", {
    ...listing("Roti Catatan Workspace"),
    pickup_end: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
    store_id: stores[0].id,
  });
  expect(created.status()).toBe(201);
  const food = await created.json();
  await register(request, "buyer");
  const booked = await mutate(request, "reservations", {
    listing_id: food.id,
    quantity: 1,
    note: "Tanpa sendok, bawa wadah",
  });
  expect(booked.status()).toBe(201);
  const order = await booked.json();
  expect((await mutate(request, `reservations/${order.id}/pay`)).status()).toBe(
    200,
  );
  const privateData = await (
    await page.request.get("/api/partner/orders")
  ).json();
  expect(JSON.stringify(privateData)).not.toContain('"code"');
  await page.goto("/partner/orders");
  await expect(page.getByLabel("Tanggal mulai pesanan")).toHaveValue("");
  await expect(page.getByLabel("Tanggal akhir pesanan")).toHaveValue("");
  const row = page.getByRole("article", {
    name: `Pesanan ${order.id} Module Three`,
  });
  await expect(row).toContainText("Tanpa sendok, bawa wadah");
  await expect(row).not.toContainText(order.code);
  await expect(
    row.getByRole("link", { name: "Verifikasi", exact: true }),
  ).toHaveAttribute("href", "/api/partner/kasir");
  await row.getByRole("button", { name: "Batalkan Pesanan" }).click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("button", { name: "Kirim pembatalan" }),
  ).toBeDisabled();
  await dialog
    .getByLabel("Alasan pembatalan (wajib)")
    .fill("Dapur berhenti karena gangguan listrik");
  await dialog.getByRole("button", { name: "Kirim pembatalan" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole("status").filter({ hasText: "Alasan sudah tersedia" }),
  ).toBeVisible();
  expect(
    (
      await mutate(page.request, `partner/reservations/${order.id}/cancel`, {
        reason: "Retry",
      })
    ).status(),
  ).toBe(200);
  const inventory = await (
    await page.request.get("/api/partner/listings")
  ).json();
  expect(inventory.find((i: { id: number }) => i.id === food.id).stock).toBe(4);
  const buyer = await (
    await request.get(`/api/reservations/${order.id}`)
  ).json();
  expect(buyer.cancellation_note).toBe(
    "Dapur berhenti karena gangguan listrik",
  );
  await mutate(page.request, "auth/logout");
  await mutate(page.request, "auth/login", {
    username: await request.storageState().then(async () => {
      const me = await request.get("/api/auth/me");
      return (await me.json()).username;
    }),
    password,
  });
  await page.goto(`/pesanan/${order.id}`);
  await expect(
    page.getByText("Dapur berhenti karena gangguan listrik", { exact: false }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("inventory stock, deactivate, edit drawer, all category pills and archive", async ({
  page,
}) => {
  const stores = await register(page.request, "partner", 1);
  const food = await (
    await mutate(page.request, "partner/listings", {
      ...listing("Inventaris Workspace"),
      store_id: stores[0].id,
    })
  ).json();
  await page.goto("/partner/listings");
  const row = page.locator(`tr[data-listing-id="${food.id}"]`);
  await row
    .getByRole("button", { name: "Tambah stok Inventaris Workspace" })
    .click();
  await expect(row.locator("output")).toHaveText("5");
  await row.getByRole("switch").click();
  await page.getByRole("button", { name: "Ya, nonaktifkan" }).click();
  await expect(row.getByRole("switch")).toHaveAttribute(
    "aria-checked",
    "false",
  );
  await row.getByRole("button", { name: "Ubah Inventaris Workspace" }).click();
  const drawer = page.getByRole("dialog", {
    name: "Ubah listing",
    exact: true,
  });
  await expect(drawer).toBeVisible();
  expect((await drawer.boundingBox())!.width).toBeLessThanOrEqual(481);
  await expect(
    drawer.getByRole("heading", { name: "Detail toko & informasi makanan" }),
  ).toBeVisible();
  await expect(
    drawer.getByLabel("Toko penjual", { exact: true }),
  ).toBeVisible();
  await expect(drawer.getByLabel("Deskripsi makanan")).toBeVisible();
  const radios = drawer.getByRole("radiogroup", { name: "Kategori" });
  expect(await radios.getByRole("radio").count()).toBe(9);
  await radios.getByRole("radio").first().focus();
  await page.keyboard.press("End");
  await expect(radios.getByRole("radio").last()).toBeFocused();
  await expect(radios.getByRole("radio").last()).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await noOverflow(page);
  await page.keyboard.press("Escape");
  await row.getByRole("button", { name: "Hapus Inventaris Workspace" }).click();
  await page.getByRole("dialog").getByRole("checkbox").check();
  await page
    .getByRole("button", { name: "Hapus permanen", exact: true })
    .click();
  await expect(row).toHaveCount(0);
  await page
    .getByRole("button", { name: "Tambah listing", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Detail toko & informasi makanan" }),
  ).toBeVisible();
  await noOverflow(page);
});

test("store multi branch, dirty guard, schedule and actual save", async ({
  page,
}) => {
  const stores = await register(page.request, "partner", 2);
  await page.goto("/partner/store");
  await expect(
    page.getByText("Pilih cabang yang ingin dikelola."),
  ).toBeVisible();
  await page.getByLabel("Pilih cabang toko").selectOption(String(stores[0].id));
  await expect(
    page.getByRole("button", { name: "Simpan perubahan toko" }),
  ).toHaveCount(0);
  await page.getByLabel("Nama toko", { exact: true }).fill("Cabang disunting");
  await page.getByLabel("Pilih cabang toko").selectOption(String(stores[1].id));
  await expect(
    page.getByRole("dialog", { name: "Perubahan belum disimpan" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Tetap di sini" }).click();
  await expect(page.getByLabel("Nama toko", { exact: true })).toHaveValue(
    "Cabang disunting",
  );
  await page.getByRole("radio", { name: "Roti & kue", exact: true }).check();
  await page.getByLabel("Patokan (opsional)").fill("Depan stasiun");
  await page.getByLabel("Buka pada Minggu").uncheck();
  await page.getByRole("button", { name: "Simpan perubahan toko" }).click();
  await expect(
    page.getByText(
      "Data toko berhasil diperbarui. Perubahan tampil ke pembeli.",
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Simpan perubahan toko" }),
  ).toHaveCount(0);
  const saved = await (
    await page.request.get(`/api/partner/stores/${stores[0].id}`)
  ).json();
  expect(saved.landmark).toBe("Depan stasiun");
  expect(saved.weekly_hours[6].enabled).toBe(false);
  await page.setViewportSize({ width: 390, height: 844 });
  await noOverflow(page);
  await page.getByRole("button", { name: "Menu mitra" }).click();
  await expect(
    page.getByRole("link", { name: "Listing", exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("dialog", { name: "Menu mitra" })
      .getByRole("button", { name: "Keluar", exact: true }),
  ).toBeVisible();
});

test("admin real summary, take down, locked partner, restore and log", async ({
  page,
  request,
}) => {
  test.skip(
    !process.env.HABISIN_TEST_ADMIN_PASSWORD,
    "Requires disposable admin fixture",
  );
  const foodName = `Moderasi Workspace ${Date.now()}`;
  const why = `Informasi perlu diperbaiki ${Date.now()}`;
  const restored = `Sudah sesuai ${Date.now()}`;
  const stores = await register(request, "partner", 1);
  const food = await (
    await mutate(request, "partner/listings", {
      ...listing(foodName),
      store_id: stores[0].id,
    })
  ).json();
  expect(
    (
      await mutate(page.request, "auth/login", {
        username: "workspace_admin",
        password: process.env.HABISIN_TEST_ADMIN_PASSWORD,
      })
    ).status(),
  ).toBe(200);
  await page.goto("/admin");
  await expect(
    page.getByRole("region", { name: "Ringkasan admin" }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Belum tersedia. Alur komplain pembeli belum diimplementasikan.",
    ),
  ).toBeVisible();
  await page.goto("/admin/listings");
  await page
    .getByRole("button", { name: `Turunkan ${foodName}`, exact: true })
    .click();
  await page.getByLabel("Alasan (wajib)").fill(why);
  await page.getByRole("button", { name: "Ya, turunkan" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(
    (
      await mutate(
        request,
        `partner/listings/${food.id}`,
        { stock: 9 },
        "PATCH",
      )
    ).status(),
  ).toBe(409);
  expect(
    (await (await request.get("/api/listings")).json()).some(
      (row: { id: number }) => row.id === food.id,
    ),
  ).toBe(false);
  await page
    .getByRole("button", { name: `Pulihkan ${foodName}`, exact: true })
    .click();
  await page.getByLabel("Alasan (wajib)").fill(restored);
  await page.getByRole("button", { name: "Ya, pulihkan" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const updated = (
    await (await request.get("/api/partner/listings")).json()
  ).find((row: { id: number }) => row.id === food.id);
  expect(updated.active).toBe(false);
  await page.goto("/admin/log");
  await expect(
    page.getByRole("cell", { name: why, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("cell", { name: restored, exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await noOverflow(page);
});

test("loading retry empty state, role access and landing responsive light/dark", async ({
  page,
}) => {
  const stores = await register(page.request, "partner", 0);
  expect(stores).toHaveLength(0);
  let fail = true;
  await page.route("**/api/partner/orders?**", async (route) => {
    if (fail)
      await route.fulfill({
        status: 503,
        json: { detail: "Gangguan uji sementara" },
      });
    else await route.continue();
  });
  await page.goto("/partner/orders");
  await expect(
    page.getByRole("alert").filter({ hasText: "Gangguan uji sementara" }),
  ).toContainText("Gangguan uji sementara");
  fail = false;
  await page.getByRole("button", { name: "Coba lagi pesanan" }).click();
  await expect(
    page.getByText("Belum ada pesanan pada filter ini."),
  ).toBeVisible();
  await page.goto("/admin");
  await expect(
    page.getByRole("heading", { name: "Akses khusus admin" }),
  ).toBeVisible();
  expect((await page.request.get("/api/admin/summary")).status()).toBe(403);
  await mutate(page.request, "auth/logout");
  await page.goto("/");
  for (const theme of ["light", "dark"]) {
    await page.evaluate((value) => {
      localStorage.setItem("theme", value);
      document.documentElement.dataset.theme = value;
    }, theme);
    for (const width of [1440, 390, 360]) {
      await page.setViewportSize({ width, height: 900 });
      await noOverflow(page);
      const signup = page.getByRole("banner").getByRole("button", {
        name: "Daftar gratis",
        exact: true,
      });
      await expect(signup).toBeVisible();
      expect((await signup.boundingBox())!.height).toBeLessThan(65);
    }
  }
});

test("account password repeat and active-order deletion guard", async ({
  page,
  request,
}) => {
  const stores = await register(page.request, "partner", 1);
  const food = await (
    await mutate(page.request, "partner/listings", {
      ...listing("Akun Workspace"),
      store_id: stores[0].id,
    })
  ).json();
  await register(request, "buyer");
  const order = await (
    await mutate(request, "reservations", { listing_id: food.id, quantity: 1 })
  ).json();
  await page.goto("/partner/account");
  // The account page opens on its profile tab.
  await page.getByRole("button", { name: "Kata sandi", exact: true }).click();
  await page.locator('input[autocomplete="current-password"]').fill(password);
  const fields = page.locator('input[autocomplete="new-password"]');
  await fields.nth(0).fill("Updated-Workspace-918!");
  await fields.nth(1).fill("Mismatch-918!");
  await expect(
    page.getByRole("button", { name: "Simpan kata sandi" }),
  ).toBeDisabled();
  await fields.nth(1).fill("Updated-Workspace-918!");
  await page.getByRole("button", { name: "Simpan kata sandi" }).click();
  await expect(
    page.getByText(
      "Kata sandi berhasil diganti. Perangkat lain perlu masuk ulang.",
    ),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Hapus akun", exact: true })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Hapus akun", exact: true })
    .last()
    .click();
  const dialog = page.getByRole("dialog", { name: "Hapus akun permanen?" });
  await dialog.locator('input[type="password"]').fill("Updated-Workspace-918!");
  await dialog.getByRole("checkbox").check();
  await dialog
    .getByRole("button", { name: "Hapus akun permanen", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toContainText(
    "Tangani semua pesanan aktif",
  );
  await dialog.getByRole("button", { name: "Batal", exact: true }).click();
  expect(
    (
      await mutate(page.request, `partner/reservations/${order.id}/cancel`, {
        reason: "Selesai uji akun",
      })
    ).status(),
  ).toBe(200);
  await page.setViewportSize({ width: 390, height: 844 });
  await noOverflow(page);
});

test("admin loading, service error retry and empty activity are explicit", async ({
  page,
}) => {
  await page.route("**/api/auth/me", (r) =>
    r.fulfill({
      json: {
        id: 999,
        username: "admin_state",
        name: "Admin Uji",
        email: "admin@example.com",
        role: "admin",
      },
    }),
  );
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/admin/summary", async (r) => {
    await gate;
    await r.fulfill({
      status: 503,
      json: { detail: "Ringkasan tidak tersedia sementara" },
    });
  });
  await page.goto("/admin");
  await expect(
    page.getByRole("status", { name: "Memuat data admin" }),
  ).toBeVisible();
  release();
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "Ringkasan tidak tersedia sementara" }),
  ).toBeVisible();
  await page.unroute("**/api/admin/summary");
  await page.route("**/api/admin/summary", (r) =>
    r.fulfill({
      json: {
        listings_live: 0,
        orders_today: 0,
        partners_active: 0,
        stores_open: 0,
        listings_taken_down: 0,
        recent_activity: [],
        complaints_available: false,
        partner_approval_available: false,
      },
    }),
  );
  await page.getByRole("button", { name: "Coba lagi admin" }).click();
  await expect(page.getByText("Belum ada aktivitas moderasi.")).toBeVisible();
  await page.route("**/api/admin/activity-logs**", (r) =>
    r.fulfill({ json: [] }),
  );
  await page.goto("/admin/log");
  await expect(
    page.getByText("Belum ada catatan moderasi pada filter ini."),
  ).toBeVisible();
});
