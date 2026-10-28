import { test, expect } from "./fixtures";
import { register, cleanup } from "./backend-fixtures";
import { food } from "./discovery-data";

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
    await page.goto("/partner/listings");
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
          "rgb(31, 77, 51)",
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

test("main navigation keeps orders reachable and deferred cart absent", async ({
  page,
}) => {
  await register(page.request, "partner", 1);
  try {
    await page.goto("/");
    await page
      .getByRole("navigation", { name: "Navigasi mitra" })
      .getByRole("link", { name: /Pesanan/ })
      .click();
    await expect(page.getByRole("button", { name: /Batalkan/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Keranjang/ })).toHaveCount(
      0,
    );
  } finally {
    await cleanup(page.request);
  }
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
    status: "paid",
    created_at: new Date(time).toISOString(),
    buyer_name: "Pembeli Lama",
  };
  await page.route("**/api/auth/me", (r) =>
    r.fulfill({ json: { ...buyer, role: "partner" } }),
  );
  await page.route("**/api/partner/stores", (r) =>
    r.fulfill({ json: { stores: [] } }),
  );
  await page.route("**/api/partner/orders?**", async (r) => {
    const history =
      new URL(r.request().url()).searchParams.get("status") === "history";
    const expired = (await page.evaluate(() => Date.now())) >= time + 3000;
    return r.fulfill({
      json: {
        results: history
          ? expired
            ? [{ ...order, status: "expired" }]
            : []
          : expired
            ? []
            : [order],
        count: 1,
        page: 1,
        page_size: 25,
        counts: {},
      },
    });
  });
  await page.goto("/");
  await expect(page.getByText("Pembeli Lama", { exact: true })).toBeVisible();
  await page.clock.runFor(4000);
  await expect(page.getByText("Pembeli Lama", { exact: true })).toHaveCount(0);
  await expect(
    page.getByText("Belum ada pesanan pada filter ini."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Riwayat", exact: true }).click();
  await expect(page.getByText("Pembeli Lama", { exact: true })).toBeVisible();
});
