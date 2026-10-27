import { test, expect } from "./fixtures";
import type { Page } from "@playwright/test";
import { food } from "./discovery-data";
import type { Listing } from "../src/lib/api";
const account = {
  id: 939,
  username: "publictest",
  name: "Pembeli Test",
  email: "p@example.com",
  role: "buyer",
};
const rows = () => [
  food(901, 31, {
    name: "Roti Aktif",
    price: 8000,
    latitude: -6.366,
    pickup_end: new Date(Date.now() + 15 * 60000).toISOString(),
  }),
  food(902, 32, {
    name: "Sup Gratis",
    price: 0,
    latitude: -6.369,
    pickup_end: new Date(Date.now() + 25 * 60000).toISOString(),
  }),
  food(903, 33, { name: "Kue Aktif", latitude: -6.371 }),
  food(904, 34, { name: "Nasi Aktif", latitude: -6.363 }),
  food(905, 35, { name: "Kartu Kelima", latitude: -6.365 }),
  food(906, 36, { name: "Stok Kosong", stock: 0 }),
  food(907, 37, {
    name: "Sudah Berakhir",
    pickup_end: new Date(Date.now() - 1000).toISOString(),
  }),
  food(908, 38, { name: "Nonaktif", active: false }),
  food(909, 39, {
    name: "Toko Tutup",
    store_summary: { ...food(909, 39).store_summary!, is_open: false },
  }),
];
const diagnostics = new WeakMap<
  Page,
  { errors: string[]; failed: string[]; mutations: string[] }
>();
test.beforeEach(async ({ page }) => {
  const d = {
    errors: [] as string[],
    failed: [] as string[],
    mutations: [] as string[],
  };
  diagnostics.set(page, d);
  page.on("pageerror", (e) => d.errors.push(e.message));
  page.on("requestfailed", (r) => {
    if (
      r.url().includes("/api/") &&
      !r.failure()?.errorText.includes("ERR_ABORTED")
    )
      d.failed.push(r.url());
  });
  page.on("request", (r) => {
    if (
      r.url().includes("/api/") &&
      r.method() !== "GET" &&
      !r.url().includes("/auth/")
    )
      d.mutations.push(r.url());
  });
});
test.afterEach(async ({ page }) => {
  expect(diagnostics.get(page)?.errors).toEqual([]);
  expect(diagnostics.get(page)?.failed).toEqual([]);
  expect(diagnostics.get(page)?.mutations).toEqual([]);
});
async function anonymous(page: Page, items: Listing[] = rows()) {
  await page.route("**/api/auth/me", (r) =>
    r.fulfill({ status: 403, json: { detail: "Anonymous" } }),
  );
  await page.route("**/api/listings", (r) => r.fulfill({ json: items }));
}
for (const width of [1440, 390]) {
  test(`landing follows design structure, real eligible cards and Leaflet (${width}px)`, async ({
    page,
  }) => {
    await anonymous(page);
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "Roti, nasi, dan kue",
    );
    const nearby = page.getByRole("region", { name: "Makanan di sekitarmu" });
    await expect(nearby.locator(".food-card")).toHaveCount(4);
    expect(await nearby.locator(".card-title").allTextContents()).toEqual([
      "Roti Aktif",
      "Sup Gratis",
      "Kue Aktif",
      "Nasi Aktif",
    ]);
    await expect(page.locator(".hero .leaflet-container")).toBeVisible();
    await expect(page.locator(".hero .food-pin")).toHaveCount(5);
    for (const name of [
      "Dari peta ke kasir dalam tiga langkah",
      "Sisa etalase jadi pemasukan, bukan kantong sampah.",
      "Kenapa ini penting di Indonesia",
      "Pertanyaan yang sering muncul",
    ])
      await expect(
        page.getByRole("heading", { name, exact: true }),
      ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await expect(
      page
        .getByRole("region", { name: "Contoh tiket" })
        .or(page.getByRole("complementary", { name: "Contoh tiket" })),
    ).toBeVisible();
    await page.screenshot({
      path: `/tmp/habisin-landing-${width}.png`,
      fullPage: true,
    });
    const footer = page.getByRole("navigation", { name: "Footer bantuan" });
    await expect(
      footer.getByRole("link", { name: "Pertanyaan umum" }),
    ).toHaveAttribute("href", "#faq");
    await expect(footer.getByText("Kebijakan privasi")).not.toHaveAttribute(
      "href",
    );
    await page
      .getByRole("button", { name: "Saya pemilik toko", exact: true })
      .click();
    await expect(
      page.getByRole("dialog", { name: "Senang kamu kembali." }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await page
      .getByRole("button", { name: "Daftarkan toko", exact: true })
      .first()
      .click();
    await expect(
      page.getByRole("dialog", { name: "Senang kamu kembali." }),
    ).toBeVisible();
  });
}
test("empty, loading and offline catalogs never become demo listing sections and can retry", async ({
  page,
}) => {
  await anonymous(page, []);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(
    "**/api/listings",
    async (r) => {
      await gate;
      await r.fulfill({ json: [] });
    },
    { times: 1 },
  );
  await page.goto("/");
  await expect(
    page.getByText("Memuat makanan yang sedang tersedia…"),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Makanan di sekitarmu" }),
  ).toHaveCount(0);
  release();
  await expect(
    page.getByText("Belum ada listing aktif saat ini."),
  ).toBeVisible();
  await page.route("**/api/listings", (r) =>
    r.fulfill({ status: 503, json: { detail: "Katalog gagal" } }),
  );
  await page.reload();
  await expect(
    page.getByText("Katalog belum terhubung.", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".food-card")).toHaveCount(0);
  await page.unroute("**/api/listings");
  await page.route("**/api/listings", (r) => r.fulfill({ json: rows() }));
  await page.getByRole("button", { name: "Coba lagi katalog" }).click();
  await expect(
    page
      .getByRole("region", { name: "Makanan di sekitarmu" })
      .locator(".food-card"),
  ).toHaveCount(4);
});
test("public explore uses buyer map and list, gates favorites and paid/free ordering without writes", async ({
  page,
}) => {
  await anonymous(page);
  await page.goto("/");
  await page.evaluate(() => localStorage.setItem("habisin-saved", "[777]"));
  await page
    .getByRole("link", { name: "Lihat makanan di sekitar saya", exact: true })
    .click();
  await expect(page).toHaveURL("/jelajahi");
  await expect(
    page.getByRole("button", { name: "Peta", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  const nav = page.getByRole("navigation", { name: "Navigasi pembeli" });
  for (const name of ["Pesanan"]) {
    await nav.getByRole("button", { name, exact: true }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
  }
  await page
    .getByRole("button", { name: "Simpan Roti Aktif ke favorit", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  expect(await page.evaluate(() => localStorage.getItem("habisin-saved"))).toBe(
    "[777]",
  );
  await page.getByRole("button", { name: "Daftar", exact: true }).click();
  for (const name of ["Roti Aktif", "Sup Gratis"]) {
    await page
      .getByRole("button", { name: `Pesan ${name}`, exact: true })
      .click();
    await expect(
      page.getByRole("region", { name: "Detail makanan", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Masukkan keranjang", exact: true }),
    ).toHaveCount(0);
    await page
      .getByRole("button", { name: "Masuk untuk memesan", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await page
      .getByRole("navigation", { name: "Breadcrumb" })
      .getByRole("button", { name: "Jelajahi", exact: true })
      .click();
  }
  expect(
    await page.evaluate(() =>
      Object.keys(localStorage).filter((k) => k.startsWith("habisin-cart:")),
    ),
  ).toEqual([]);
});
test("landing search and listing deep links open public detail then login preserves context", async ({
  page,
}) => {
  let logged = false;
  await anonymous(page);
  await page.route("**/api/auth/me", (r) =>
    r.fulfill(
      logged
        ? { json: account }
        : { status: 403, json: { detail: "Anonymous" } },
    ),
  );
  await page.route("**/api/auth/csrf", (r) =>
    r.fulfill({ json: { csrfToken: "test" } }),
  );
  await page.route("**/api/auth/login", (r) => {
    logged = true;
    return r.fulfill({ json: account });
  });
  await page.goto("/");
  await page.getByRole("search").getByRole("textbox").fill("Roti Aktif");
  await page.getByRole("search").getByRole("textbox").press("Enter");
  await expect(page).toHaveURL(/\/jelajahi\?q=Roti\+Aktif/);
  await expect(page.locator(".food-card")).toHaveCount(1);
  await page.goto("/jelajahi?listing=901");
  await expect(
    page.getByRole("region", { name: "Detail makanan", exact: true }),
  ).toContainText("Roti Aktif");
  await page.getByRole("button", { name: "Masuk untuk memesan" }).click();
  await page.getByLabel("Username", { exact: true }).fill("publictest");
  await page
    .getByLabel("Kata sandi", { exact: true })
    .or(page.getByLabel("Password", { exact: true }))
    .fill("Example-Login-123!");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Masuk", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("region", { name: "Detail makanan", exact: true }),
  ).toContainText("Roti Aktif");
  await expect(
    page.getByRole("button", {
      name: "Lanjut ke ringkasan",
      exact: true,
    }),
  ).toBeEnabled();
});
test("real listing expiry removes landing cards and the complete nearby section automatically", async ({
  page,
}) => {
  const time = Date.now();
  await page.clock.install({ time });
  await anonymous(page, [
    food(911, 31, {
      name: "Segera Lewat",
      pickup_end: new Date(time + 5000).toISOString(),
    }),
  ]);
  await page.goto("/");
  await expect(
    page.getByRole("region", { name: "Makanan di sekitarmu" }),
  ).toBeVisible();
  await page.clock.runFor(6000);
  await expect(
    page.getByRole("region", { name: "Makanan di sekitarmu" }),
  ).toHaveCount(0);
  await expect(page.locator(".food-pin")).toHaveCount(0);
});
