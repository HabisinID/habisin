import { expect, test } from "./fixtures";

test("partner dashboard shows completed sales, free portions, and a seven-day chart", async ({
  page,
}) => {
  await page.route("**/api/auth/me", (route) =>
    route.fulfill({
      json: {
        id: 91,
        username: "seller-statistics",
        name: "Mitra Statistik",
        email: "mitra@example.com",
        role: "partner",
      },
    }),
  );
  await page.route("**/api/partner/stores", (route) =>
    route.fulfill({ json: { stores: [] } }),
  );
  await page.route("**/api/partner/orders**", (route) =>
    route.fulfill({
      json: {
        results: [],
        count: 0,
        page: 1,
        page_size: 20,
        counts: {},
      },
    }),
  );
  await page.route("**/api/partner/dashboard**", (route) =>
    route.fulfill({
      json: {
        sales: {
          sold_portions: 5,
          simulated_total: 38000,
          free_portions: 2,
          picked_up_series: [
            { day: "2026-10-24", portions: 0 },
            { day: "2026-10-25", portions: 1 },
            { day: "2026-10-26", portions: 0 },
            { day: "2026-10-27", portions: 0 },
            { day: "2026-10-28", portions: 2 },
            { day: "2026-10-29", portions: 0 },
            { day: "2026-10-30", portions: 2 },
          ],
        },
      },
    }),
  );

  await page.goto("/partner");

  const statistics = page.locator('section[aria-labelledby="performance-title"]');
  await expect(
    statistics.getByRole("heading", { name: "Ringkasan 7 hari" }),
  ).toBeVisible();
  await expect(statistics.locator("article").nth(0).locator("strong")).toHaveText(
    "5",
  );
  await expect(
    statistics.locator("article").nth(1).locator("strong"),
  ).toContainText("38.000");
  await expect(statistics.locator("article").nth(2).locator("strong")).toHaveText(
    "2",
  );
  await expect(
    statistics.getByRole("img", { name: /7 hari terakhir/ }).locator(":scope > div"),
  ).toHaveCount(7);
  await expect(
    page.getByRole("button", { name: "Pesanan masuk", exact: false }),
  ).toBeVisible();
});
