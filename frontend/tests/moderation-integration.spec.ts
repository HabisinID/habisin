import { expect, test } from "./fixtures";
import { cleanup, listing, mutate, register } from "./backend-fixtures";

test("module6 takedown reaches buyer and partner UI, then workspace restores the listing", async ({
  page,
  request,
  browser,
  baseURL,
}) => {
  test.skip(
    !process.env.HABISIN_TEST_ADMIN_PASSWORD,
    "Requires disposable backend admin",
  );
  const stores = await register(request, "partner", 1);
  await register(page.request, "buyer");
  const food = await (
    await mutate(request, "partner/listings", {
      ...listing(`Moderation integration ${Date.now()}`),
      store_id: stores[0].id,
    })
  ).json();
  const order = await (
    await mutate(page.request, "reservations", {
      listing_id: food.id,
      quantity: 1,
    })
  ).json();
  expect(
    (await mutate(page.request, `reservations/${order.id}/pay`)).status(),
  ).toBe(200);
  const admin = await browser.newContext({ baseURL });
  const partner = await browser.newContext({
    baseURL,
    storageState: await request.storageState(),
  });
  const partnerPage = await partner.newPage();
  try {
    expect(
      (
        await mutate(admin.request, "auth/login", {
          username: "workspace_admin",
          password: process.env.HABISIN_TEST_ADMIN_PASSWORD,
        })
      ).status(),
    ).toBe(200);
    expect(
      (
        await mutate(admin.request, `admin/listings/${food.id}/take-down/`, {
          reason: "Makanan perlu pemeriksaan",
        })
      ).status(),
    ).toBe(200);
    await page.goto(`/pesanan/${order.id}`);
    await expect(
      page.getByText("Dibatalkan oleh admin", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText(/Makanan perlu pemeriksaan/)).toBeVisible();
    await partnerPage.goto("/partner/listings");
    const row = partnerPage.locator(`[data-listing-id="${food.id}"]`);
    await expect(row).toContainText("Makanan perlu pemeriksaan");
    await expect(
      row.getByRole("button", { name: `Ubah ${food.name}`, exact: true }),
    ).toBeDisabled();
    await expect(row.getByRole("switch")).toBeDisabled();
    const inventory = await (await request.get("/api/partner/listings")).json();
    expect(
      inventory.find((item: { id: number }) => item.id === food.id).stock,
    ).toBe(4);
    expect(
      (
        await mutate(admin.request, `admin/listings/${food.id}/moderate`, {
          action: "restore",
          reason: "Pemeriksaan selesai",
        })
      ).status(),
    ).toBe(200);
    await partnerPage.reload();
    await expect(
      row.getByRole("button", { name: `Ubah ${food.name}`, exact: true }),
    ).toBeEnabled();
    await row.getByRole("switch").click();
    await expect(row.getByRole("switch")).toHaveAttribute(
      "aria-checked",
      "true",
    );
    const logs = await admin.request.get(
      "/api/admin/moderation-logs?action=restore",
    );
    expect(
      (await logs.json()).results.some(
        (log: { listing_id: number }) => log.listing_id === food.id,
      ),
    ).toBe(true);
  } finally {
    await partner.close();
    await admin.close();
    await cleanup(page.request);
    await cleanup(request);
  }
});
