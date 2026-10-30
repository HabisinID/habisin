import { expect, test } from "./fixtures";
import { request as api } from "@playwright/test";
import { listing, mutate, password, register } from "./backend-fixtures";

for (const width of [1440, 390]) {
  test(`admin cancellation reaches buyer and locks partner inventory at ${width}px`, async ({
    page,
    request,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const stores = await register(request, "partner", 1);
    const name = `Moderation ${width} ${Date.now()}`;
    const created = await mutate(request, "partner/listings", {
      ...listing(name),
      store_id: stores[0].id,
    });
    expect(created.status()).toBe(201);
    const food = await created.json();
    const baseURL = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3000";
    const buyer = await api.newContext({ baseURL });
    const admin = await api.newContext({ baseURL });
    try {
      await register(buyer, "buyer");
      const reserved = await mutate(buyer, "reservations", {
        listing_id: food.id,
        quantity: 2,
        note: "Tanpa sendok",
      });
      expect(reserved.status()).toBe(201);
      const order = await reserved.json();
      expect(
        (await mutate(buyer, `reservations/${order.id}/pay`)).status(),
      ).toBe(200);
      expect(
        (
          await mutate(admin, "auth/login", {
            username: process.env.E2E_ADMIN_USERNAME || "workspace_admin",
            password:
              process.env.E2E_ADMIN_PASSWORD ||
              process.env.HABISIN_TEST_ADMIN_PASSWORD,
          })
        ).status(),
      ).toBe(200);
      const reason = "Makanan diturunkan karena tidak aman";
      expect(
        (
          await mutate(admin, `admin/listings/${food.id}/take-down/`, {
            reason,
          })
        ).status(),
      ).toBe(200);
      expect(
        (
          await mutate(admin, `admin/listings/${food.id}/moderate`, {
            action: "take_down",
            reason,
          })
        ).status(),
      ).toBe(200);
      await page.context().addCookies((await buyer.storageState()).cookies);
      await page.goto(`/pesanan/${order.id}/tiket`);
      await expect(
        page.getByText("Dibatalkan oleh admin", { exact: true }),
      ).toBeVisible();
      await expect(page.getByText(reason, { exact: true })).toBeVisible();
      await page.context().clearCookies();
      await page.context().addCookies((await request.storageState()).cookies);
      await page.goto("/partner/listings");
      await expect(page.getByText(name, { exact: true })).toBeVisible();
      await expect(
        page.getByText(reason, { exact: false }).first(),
      ).toBeVisible();
      const rows = await (await request.get("/api/partner/listings")).json();
      expect(rows.find((row: { id: number }) => row.id === food.id).stock).toBe(
        4,
      );
      expect(
        (
          await mutate(
            request,
            `partner/listings/${food.id}`,
            { stock: 20 },
            "PATCH",
          )
        ).status(),
      ).toBe(409);
      expect(
        (
          await mutate(admin, `admin/listings/${food.id}/moderate`, {
            action: "restore",
            reason: "Sudah diperiksa",
          })
        ).status(),
      ).toBe(200);
      const restored = await (
        await request.get(`/api/partner/listings/${food.id}`)
      ).json();
      expect(restored.active).toBe(false);
      expect(restored.taken_down).toBe(false);
      expect(restored.moderated_at).toBeNull();
    } finally {
      await mutate(buyer, "auth/me", { password }, "DELETE");
      await mutate(request, "auth/me", { password }, "DELETE");
      await buyer.dispose();
      await admin.dispose();
    }
  });
}
