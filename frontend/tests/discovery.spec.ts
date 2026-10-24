import { discover, type StoreGroup } from "../src/lib/discovery";
import { expect, test } from "./fixtures";
import { food, store, origin, baseFilters } from "./discovery-data";

test("selector shares identity, eligibility and filters without losing unmappable legacy", () => {
  const items = [
    food(1, 31),
    food(2, 31, { price: 0 }),
    food(3, 32),
    food(4, null),
    food(5, null, { latitude: NaN }),
    food(6, 33, { stock: 0 }),
    food(7, 34, { pickup_end: new Date().toISOString() }),
    food(8, 35, { active: false }),
    food(9, 36, { store_summary: { ...store(36), is_open: false } }),
  ];
  const result = discover(items, baseFilters, origin, Date.now());
  expect(result.visibleListings.map((i) => i.id).sort()).toEqual([
    1, 2, 3, 4, 5,
  ]);
  expect(result.storeGroups.map((g) => g.key)).toEqual([
    "store:31",
    "store:32",
    "legacy-listing:4",
  ]);
  expect(result.storeGroups[0].minPrice).toBe(0);
  expect(result.storeGroups[0].items.map((i) => i.id)).toEqual([1, 2]);
  expect(result.unmappableListings.map((i) => i.id)).toEqual([5]);
  const cases = [
    { query: "Food 1" },
    { free: true },
    { savedOnly: true, saved: [3] },
    { maxPrice: 0 },
    { category: "Sehat" },
  ];
  for (const patch of cases) {
    const r = discover(items, { ...baseFilters, ...patch }, origin, Date.now());
    expect(
      r.storeGroups.flatMap((g: StoreGroup) => g.items.map((i) => i.id)).sort(),
    ).toEqual(
      r.visibleListings
        .filter((i) => i.id !== 5)
        .map((i) => i.id)
        .sort(),
    );
  }
  expect(
    discover(
      items,
      { ...baseFilters, free: true },
      origin,
      Date.now(),
    ).visibleListings.map((i) => i.id),
  ).toEqual([2]);
});

test("store catalog isolates errors, navigates client-side and deep links only available server data", async ({
  page,
}) => {
  const items = [food(301, 31), food(302, 31), food(303, 32)];
  await page.route("**/api/auth/me", (route) =>
    route.fulfill({ status: 403, json: { detail: "Anonymous" } }),
  );
  await page.route("**/api/listings", (route) =>
    route.fulfill({ json: items }),
  );
  await page.route("**/api/stores/31", (route) =>
    route.fulfill({ json: store(31) }),
  );
  await page.route("**/api/stores/31/listings", (route) =>
    route.fulfill({ status: 503, json: { detail: "Katalog sedang gagal." } }),
  );
  await page.goto("/stores/31");
  await expect(
    page.getByRole("heading", { name: store(31).name, exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("region", { name: "Makanan tersedia di toko" })
      .getByRole("alert"),
  ).toContainText("Katalog sedang gagal");
  await page.unroute("**/api/stores/31/listings");
  await page.route("**/api/stores/31/listings", (route) =>
    route.fulfill({ json: items.slice(0, 2) }),
  );
  await page.getByRole("button", { name: "Coba lagi katalog" }).click();
  await expect(page.locator(".store-food-card")).toHaveCount(2);
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await expect(
      page.locator(".store-food-card").first().locator("img"),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const ratio = await page
      .locator(".store-food-card")
      .first()
      .locator("img")
      .evaluate((im) => im.clientWidth / im.clientHeight);
    expect(ratio).toBeCloseTo(4 / 3, 1);
    await page.screenshot({
      path: `/tmp/habisin-store-catalog-${viewport.width}.png`,
    });
  }
  await page.evaluate(() => {
    (window as Window & { navigationSentinel?: string }).navigationSentinel =
      "retained";
  });
  await page.getByRole("link", { name: "Lihat Food 302", exact: true }).click();
  await expect(page).toHaveURL(/\/?listing=302/);
  expect(
    await page.evaluate(
      () =>
        (window as Window & { navigationSentinel?: string }).navigationSentinel,
    ),
  ).toBe("retained");
  await expect(
    page.getByRole("region", { name: "Detail makanan", exact: true }),
  ).toContainText("Food 302");
  await page.reload();
  const detail = page.getByRole("region", { name: "Detail makanan", exact: true });
  await expect(detail).toContainText("Food 302");
  await expect(detail.getByRole("heading", { level: 1 })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page).not.toHaveURL(/listing=/);
  await page
    .getByRole("textbox", { name: "Cari makanan atau toko" })
    .fill("Food");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.goto("/?listing=9999");
  await expect(
    page.getByText(/Makanan pada tautan ini tidak tersedia/),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.goto("/?listing=abc");
  await expect(
    page.getByText(/Makanan pada tautan ini tidak tersedia/),
  ).toBeVisible();
  await page.route("**/api/listings", (route) =>
    route.fulfill({ status: 503, json: { detail: "Offline" } }),
  );
  await page.goto("/?listing=1");
  await expect(
    page.getByText("Katalog belum terhubung.", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("store catalog loading, empty and profile missing remain distinct", async ({
  page,
}) => {
  await page.route("**/api/stores/31", (r) => r.fulfill({ json: store(31) }));
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/stores/31/listings", async (r) => {
    await gate;
    await r.fulfill({ json: [] });
  });
  await page.goto("/stores/31");
  await expect(page.getByText("Memuat makanan toko…")).toBeVisible();
  release();
  await expect(
    page.getByText("Belum ada makanan tersedia di toko ini."),
  ).toBeVisible();
  await page.route("**/api/stores/404", (r) =>
    r.fulfill({ status: 404, json: { detail: "Missing" } }),
  );
  await page.goto("/stores/404");
  await expect(
    page.getByRole("heading", { name: "Toko tidak ditemukan." }),
  ).toBeVisible();
  await expect(page.locator(".store-food-card")).toHaveCount(0);
});
