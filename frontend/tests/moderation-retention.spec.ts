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

for (const width of [1440, 390]) {
  test(`archiving buyer history preserves complaint and seller sales at ${width}px`, async ({
    page,
    request,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const stores = await register(request, "partner", 1);
    const created = await mutate(request, "partner/listings", {
      ...listing(`Retained ${Date.now()}`),
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
      });
      expect(reserved.status()).toBe(201);
      const order = await reserved.json();
      expect(
        (await mutate(buyer, `reservations/${order.id}/pay`)).status(),
      ).toBe(200);
      expect(
        (await mutate(request, `partner/kasir/${order.id}/pickup`)).status(),
      ).toBe(200);
      expect(
        (
          await mutate(buyer, "reviews", {
            reservation_id: order.id,
            rating: 4,
            comment: "Makanan masih baik",
          })
        ).status(),
      ).toBe(201);
      const complaint = await mutate(buyer, "complaints", {
        reservation_id: order.id,
        reason: "other",
        description: "Kemasan makanan perlu diperbaiki",
      });
      expect(complaint.status()).toBe(201);
      const report = await complaint.json();
      const before = await (await request.get("/api/partner/dashboard")).json();
      await page.context().addCookies((await buyer.storageState()).cookies);
      await page.goto("/pesanan");
      await page.getByRole("tab", { name: /Riwayat/ }).click();
      await expect(
        page.getByText(food.name, { exact: false }).first(),
      ).toBeVisible();
      const archived = page.waitForResponse(
        (r) =>
          r.url().endsWith(`/api/reservations/${order.id}`) &&
          r.request().method() === "DELETE",
      );
      await page.getByRole("button", { name: "Hapus dari riwayat" }).click();
      expect((await archived).status()).toBe(204);
      await expect(page.locator(".order-card")).toHaveCount(0);
      expect((await buyer.get(`/api/reservations/${order.id}`)).status()).toBe(
        404,
      );
      expect(
        (
          await mutate(
            request,
            `partner/listings/${food.id}`,
            undefined,
            "DELETE",
          )
        ).status(),
      ).toBe(204);
      const after = await (await request.get("/api/partner/dashboard")).json();
      expect(after.sales).toEqual(before.sales);
      const sellerOrders = await (
        await request.get("/api/partner/orders")
      ).json();
      expect(
        sellerOrders.results.some((row: { id: number }) => row.id === order.id),
      ).toBe(true);
      const feedback = await (await buyer.get("/api/reviews/mine")).json();
      expect(
        feedback.complaints.some((row: { id: number }) => row.id === report.id),
      ).toBe(true);
      expect(feedback.reviews).toHaveLength(1);
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
      await page.context().clearCookies();
      await page.context().addCookies((await admin.storageState()).cookies);
      await page.goto("/admin/complaints");
      await expect(
        page.getByText(food.name, { exact: true }).first(),
      ).toBeVisible();
      await expect(
        page
          .getByText("Kemasan makanan perlu diperbaiki", { exact: false })
          .first(),
      ).toBeVisible();
    } finally {
      await mutate(buyer, "auth/me", { password }, "DELETE");
      await mutate(request, "auth/me", { password }, "DELETE");
      await buyer.dispose();
      await admin.dispose();
    }
  });
}
