import { readFileSync } from "node:fs";
import { expect, test } from "./fixtures";
import {
  register,
  mutate,
  listing,
  cleanup,
  password,
} from "./backend-fixtures";

test("real stores → map → profile → detail → reserve/cancel obey branch and availability", async ({
  page,
  request,
}) => {
  const errors: string[] = [];
  const failed: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("requestfailed", (r) => {
    if (
      r.url().includes("/api/") &&
      !r.failure()?.errorText.includes("ERR_ABORTED")
    )
      failed.push(r.url());
  });
  const stores = await register(request, "partner");
  await register(page.request, "buyer");
  const prefix = `M4Actual ${Date.now()}`;
  try {
    const csrf = (await (await request.get("/api/auth/csrf")).json()).csrfToken;
    const data = listing(`${prefix} A1`);
    const { image, ...withoutImage } = data;
    void image;
    const photo = await request.post("/api/partner/listings", {
      headers: { "X-CSRFToken": csrf },
      multipart: {
        ...withoutImage,
        store_id: stores[0].id,
        image_source: "upload",
        image_file: {
          name: "upload.jpg",
          mimeType: "image/jpeg",
          buffer: readFileSync("tests/fixtures/upload.jpg"),
        },
      },
    });
    expect(photo.status()).toBe(201);
    const a1 = await photo.json();
    const a2 = await (
      await mutate(request, "partner/listings", {
        ...listing(`${prefix} A2`),
        store_id: stores[0].id,
      })
    ).json();
    const b = await (
      await mutate(request, "partner/listings", {
        ...listing(`${prefix} B`),
        store_id: stores[1].id,
      })
    ).json();
    await page.goto("/");
    // The anonymous search has the same accessible name. Wait for the buyer
    // shell so the query is entered after authentication has hydrated.
    await expect(
      page.getByRole("navigation", { name: "Navigasi pembeli" }),
    ).toBeVisible();
    await page
      .getByRole("textbox", { name: "Cari makanan atau toko" })
      .fill(prefix);
    await expect(page.locator(".food-card")).toHaveCount(3);
    await page.getByRole("button", { name: "Peta", exact: true }).click();
    const pins = page.locator(".food-pin.leaflet-marker-icon");
    await expect(pins).toHaveCount(2);
    await pins.filter({ hasText: "Rp" }).first().click();
    const popup = page.getByRole("region", { name: /^Pilihan makanan/ });
    await expect(popup).toContainText(`${prefix} A1`);
    await expect(popup).not.toContainText(`${prefix} B`);
    await page.evaluate(() => {
      (window as Window & { navigationSentinel?: string }).navigationSentinel =
        "retained";
    });
    await popup.getByRole("link", { name: "Lihat toko" }).click();
    await expect(page).toHaveURL(`/stores/${stores[0].id}`);
    expect(
      await page.evaluate(
        () =>
          (window as Window & { navigationSentinel?: string })
            .navigationSentinel,
      ),
    ).toBe("retained");
    await expect(page.locator(".store-food-card")).toHaveCount(2);
    const photoSrc = await page
      .getByRole("img", { name: a1.name, exact: true })
      .getAttribute("src");
    expect(new URL(photoSrc!, "http://127.0.0.1:3000").pathname).toBe(a1.image);
    expect((await page.request.get(a1.image)).status()).toBe(200);
    await page
      .getByRole("link", { name: `Lihat ${a1.name}`, exact: true })
      .click();
    await expect(
      page.getByRole("region", { name: "Detail makanan", exact: true }),
    ).toContainText(stores[0].address);
    // Modul 7 page flow: summary page → payment page → Pesanan saya.
    await page.getByRole("button", { name: "Lanjut ke ringkasan" }).click();
    await expect(page).toHaveURL(/\/pesanan\/\d+$/);
    await page.getByRole("button", { name: /^Bayar Rp/ }).click();
    await page
      .getByRole("button", { name: "Simulasikan pembayaran berhasil" })
      .click();
    await expect(page).toHaveURL(/\/pesanan$/);
    const orders = await (await page.request.get("/api/reservations")).json();
    expect(orders[0].listing.store_id).toBe(stores[0].id);
    expect(orders[0].listing.image).toBe(a1.image);
    expect(orders[0].listing.stock).toBe(3);
    const card = page.locator(".order-card");
    const cancelled = page.waitForResponse(
      (r) =>
        r.url().endsWith(`/api/reservations/${orders[0].id}/cancel`) &&
        r.request().method() === "POST",
    );
    await card.getByRole("button", { name: "Batalkan pesanan" }).click();
    await card.getByRole("button", { name: "Ya, batalkan" }).click();
    expect((await cancelled).status()).toBe(200);
    await page.getByRole("tab", { name: /^Riwayat/ }).click();
    await expect(card).toContainText("Dibatalkan");
    expect(
      (await (await request.get("/api/partner/listings")).json()).find(
        (i: { id: number }) => i.id === a1.id,
      ).stock,
    ).toBe(4);
    await page.goto(`/?listing=${a2.id}`);
    await expect(
      page.getByRole("region", { name: "Detail makanan", exact: true }),
    ).toContainText(a2.name);
    expect(
      (
        await mutate(
          request,
          `partner/stores/${stores[0].id}`,
          { is_open: false },
          "PATCH",
        )
      ).status(),
    ).toBe(200);
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(
      page
        .getByRole("region", { name: "Detail makanan", exact: true })
        .getByText(/Makanan ini sudah tidak tersedia/),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Lanjut ke ringkasan" }),
    ).toBeDisabled();
    expect(
      (
        await mutate(page.request, "reservations", {
          listing_id: a2.id,
          quantity: 1,
        })
      ).status(),
    ).toBe(400);
    expect(
      await (
        await page.request.get(`/api/stores/${stores[0].id}/listings`)
      ).json(),
    ).toEqual([]);
    await page.keyboard.press("Escape");
    expect(
      (
        await mutate(request, `partner/listings/${b.id}`, { stock: 0 }, "PATCH")
      ).status(),
    ).toBe(200);
    expect(
      (
        await mutate(page.request, "reservations", {
          listing_id: b.id,
          quantity: 1,
        })
      ).status(),
    ).toBe(400);
    await page
      .getByRole("textbox", { name: "Cari makanan atau toko" })
      .fill(prefix);
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(page.locator(".food-card")).toHaveCount(0);
    expect(errors).toEqual([]);
    expect(failed).toEqual([]);
  } finally {
    await mutate(page.request, "auth/me", { password }, "DELETE");
    await cleanup(request);
  }
});
