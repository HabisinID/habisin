import { type APIRequestContext, type Page } from "@playwright/test";
import { expect, test } from "./fixtures";

const password = "Module3-Secure-927!";
const image = "https://example.com/module3-photo.svg";

async function mutate(
  request: APIRequestContext,
  path: string,
  data?: unknown,
  method = "POST",
) {
  const csrf = await (await request.get("/api/auth/csrf")).json();
  return request.fetch(`/api/${path}`, {
    method,
    data,
    headers: { "X-CSRFToken": csrf.csrfToken },
  });
}

async function register(request: APIRequestContext, role: "buyer" | "partner") {
  const response = await mutate(request, "auth/register", {
    username: `m3_${role}_${Date.now()}`,
    name: "Module Three",
    email: "module3@example.com",
    password,
    role,
  });
  expect(response.status()).toBe(201);
}

function listing(name: string) {
  return {
    name,
    store: "Toko Modul Tiga",
    category: "Roti & kue",
    description: "Surplus roti untuk diambil hari ini.",
    address: "Jalan Margonda, Beji, Depok",
    image,
    price: 8000,
    original_price: 16000,
    stock: 4,
    latitude: -6.366,
    longitude: 106.829,
    pickup_start: new Date(Date.now() - 60000).toISOString(),
    pickup_end: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
  };
}

async function fillListing(page: Page, name: string, free = false) {
  const data = listing(name);
  await page.getByLabel("Nama makanan", { exact: true }).fill(name);
  await page.getByLabel("Nama toko", { exact: true }).fill(data.store);
  await page
    .getByLabel("Kategori", { exact: true })
    .selectOption(data.category);
  await page.getByLabel("Deskripsi makanan").fill(data.description);
  await page.getByLabel("URL foto makanan").fill(data.image);
  await page.getByLabel("Stok tersedia (porsi)").fill("4");
  if (free) await page.getByLabel("Gratis (donasi)").check();
  else {
    await page.getByLabel("Harga normal (Rp)").fill("16000");
    await page.getByLabel("Harga jual (Rp)").fill("8000");
  }
  await page.getByLabel("Alamat pengambilan").fill(data.address);
  await page.getByLabel("Latitude toko").fill(String(data.latitude));
  await page.getByLabel("Longitude toko").fill(String(data.longitude));
}

async function cleanup(request: APIRequestContext) {
  const inventory = await request.get("/api/partner/listings");
  if (inventory.ok()) {
    for (const item of await inventory.json())
      await mutate(request, `partner/listings/${item.id}`, undefined, "DELETE");
  }
  await mutate(request, "auth/me", { password }, "DELETE");
}

test.beforeEach(async ({ page }) => {
  for (const url of ["https://images.unsplash.com/**", image]) {
    await page.route(url, (route) =>
      route.fulfill({
        contentType: "image/svg+xml",
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="#f6eacb"/></svg>',
      }),
    );
  }
});

test("partner CRUD validates, updates the catalog, and preserves ownership", async ({
  page,
}) => {
  const errors: string[] = [];
  const failed: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("requestfailed", (request) => {
    if (
      request.url().includes("/api/") &&
      !request.failure()?.errorText.includes("ERR_ABORTED")
    )
      failed.push(request.url());
  });
  await register(page.request, "partner");
  const name = `Roti CRUD ${Date.now()}`;
  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await page
      .getByRole("button", { name: "Dasbor mitra", exact: true })
      .click();
    await expect(
      page.getByText("Belum ada listing.", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Tambah listing", exact: true })
      .click();
    await fillListing(page, name);
    await page.getByLabel("Harga jual (Rp)").fill("20000");
    await page.getByRole("button", { name: "Tayangkan listing" }).click();
    await expect(page.locator("#listing-price-error")).toHaveText(
      "Harga jual tidak boleh melebihi harga normal.",
    );
    await page.getByLabel("Harga jual (Rp)").fill("8000");
    await page.getByRole("button", { name: "Tayangkan listing" }).click();
    await expect(page.getByText("Listing berhasil ditayangkan.")).toBeVisible();
    const item = (
      await (await page.request.get("/api/partner/listings")).json()
    )[0];
    await page.screenshot({ path: "/tmp/habisin-module3-desktop.png" });
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await expect(
      page.getByRole("button", { name: "Dasbor mitra", exact: true }),
    ).toBeFocused();
    await page
      .getByRole("textbox", { name: "Cari makanan atau toko" })
      .fill(name);
    await expect(page.locator(".food-card")).toHaveCount(1);
    await page
      .getByRole("button", { name: "Dasbor mitra", exact: true })
      .click();
    await page
      .getByRole("button", { name: `Ubah ${name}`, exact: true })
      .click();
    await page.getByLabel("Nama makanan", { exact: true }).fill(`${name} Baru`);
    await page.getByLabel("Stok tersedia (porsi)").fill("2");
    await page
      .getByRole("button", { name: "Simpan perubahan", exact: true })
      .click();
    const updatedName = `${name} Baru`;
    await expect(
      page.getByText("Perubahan listing berhasil disimpan."),
    ).toBeVisible();
    await page
      .getByRole("button", { name: `Nonaktifkan ${updatedName}`, exact: true })
      .click();
    await page
      .getByRole("group", { name: "Konfirmasi aksi listing" })
      .getByRole("button", { name: "Batal" })
      .click();
    await expect(page.getByText("Aktif", { exact: true })).toBeVisible();
    await page
      .getByRole("button", { name: `Nonaktifkan ${updatedName}`, exact: true })
      .click();
    await page.getByRole("button", { name: "Ya, nonaktifkan" }).click();
    await expect(page.getByText("Nonaktif", { exact: true })).toBeVisible();
    expect(
      (await (await page.request.get("/api/listings")).json()).some(
        (row: { id: number }) => row.id === item.id,
      ),
    ).toBe(false);
    await page
      .getByRole("button", { name: `Aktifkan ${updatedName}`, exact: true })
      .click();
    await expect(page.getByText("Listing diaktifkan.")).toBeVisible();
    await page
      .getByRole("button", { name: `Hapus ${updatedName}`, exact: true })
      .click();
    await page.getByRole("button", { name: "Ya, hapus" }).click();
    await expect(
      page.getByText("Belum ada listing.", { exact: true }),
    ).toBeVisible();
    expect(errors).toEqual([]);
    expect(failed).toEqual([]);
  } finally {
    await cleanup(page.request);
  }
});

test("mobile inventory handles loading, server failure, retry, and a free listing", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await register(page.request, "partner");
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/partner/listings", async (route) => {
    await gate;
    await route.fulfill({
      status: 503,
      json: { detail: "Inventaris sementara tidak tersedia." },
    });
  });
  try {
    await page.goto("/");
    await page
      .getByRole("button", { name: "Kelola listing", exact: true })
      .click();
    await expect(page.getByText("Memuat listing…")).toBeVisible();
    release();
    await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
      "Inventaris sementara tidak tersedia.",
    );
    await page.unroute("**/api/partner/listings");
    await page.getByRole("button", { name: "Coba lagi", exact: true }).click();
    await expect(
      page.getByText("Belum ada listing.", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Tambah listing", exact: true })
      .click();
    const name = `Donasi ${Date.now()}`;
    await fillListing(page, name, true);
    await expect(page.getByLabel("Harga jual (Rp)")).toHaveCount(0);
    await page.screenshot({ path: "/tmp/habisin-module3-mobile-form.png" });
    await page.getByRole("button", { name: "Tayangkan listing" }).click();
    await expect(page.getByText("Listing berhasil ditayangkan.")).toBeVisible();
    await expect(
      page
        .getByRole("dialog")
        .getByRole("cell", { name: "Harga: Gratis", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    expect(
      await page
        .getByRole("dialog")
        .evaluate((dialog) => dialog.scrollWidth <= dialog.clientWidth),
    ).toBe(true);
    await page.screenshot({ path: "/tmp/habisin-module3-mobile.png" });
  } finally {
    release();
    await page.unroute("**/api/partner/listings");
    await cleanup(page.request);
  }
});

test("reserved listings show edit/delete conflicts and can still be deactivated", async ({
  page,
  request,
}) => {
  await register(page.request, "partner");
  const data = listing(`Reserved ${Date.now()}`);
  const created = await mutate(page.request, "partner/listings", data);
  expect(created.status()).toBe(201);
  const item = await created.json();
  await register(request, "buyer");
  expect(
    (
      await mutate(request, "reservations", {
        listing_id: item.id,
        quantity: 1,
      })
    ).status(),
  ).toBe(201);
  try {
    await page.goto("/");
    await page
      .getByRole("button", { name: "Dasbor mitra", exact: true })
      .click();
    await page
      .getByRole("button", { name: `Hapus ${data.name}`, exact: true })
      .click();
    await page.getByRole("button", { name: "Ya, hapus" }).click();
    await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
      "Listing memiliki riwayat pesanan",
    );
    await page
      .getByRole("button", { name: `Ubah ${data.name}`, exact: true })
      .click();
    await page.getByLabel("Harga jual (Rp)").fill("5000");
    await page
      .getByRole("button", { name: "Simpan perubahan", exact: true })
      .click();
    await expect(page.locator("#listing-price-error")).toHaveText(
      "Tidak dapat diubah selama ada pesanan aktif.",
    );
    await page.getByRole("button", { name: "Kembali ke listing" }).click();
    await page
      .getByRole("button", { name: `Nonaktifkan ${data.name}`, exact: true })
      .click();
    await page.getByRole("button", { name: "Ya, nonaktifkan" }).click();
    await expect(page.getByText("Listing dinonaktifkan.")).toBeVisible();
  } finally {
    await mutate(request, "auth/me", { password }, "DELETE");
    await cleanup(page.request);
  }
});
