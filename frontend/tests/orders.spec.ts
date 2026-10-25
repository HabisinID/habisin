import { expect, test } from "./fixtures";
import type { Page } from "@playwright/test";

// Runs against the real backend, like demo.spec.ts: both servers and a fresh
// seed_demo catalog are required.
const password = "Order-Flow-Secure-927!";
const ticketCode =
  /^[ACDEFHJKMNPRTUVWXY3479]{3} · [ACDEFHJKMNPRTUVWXY3479]{2}$/;

async function csrf(page: Page) {
  return (await (await page.request.get("/api/auth/csrf")).json()).csrfToken;
}

async function signUpBuyer(page: Page) {
  const response = await page.request.post("/api/auth/register", {
    data: {
      name: "Order Tester",
      username: `order_${Date.now()}`,
      email: "order@example.com",
      password,
      role: "buyer",
    },
    headers: { "X-CSRFToken": await csrf(page) },
  });
  expect(response.status()).toBe(201);
  const ready = page.waitForResponse(
    (response) => new URL(response.url()).pathname === "/api/listings",
  );
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await ready;
}

// Deleting the account cancels its active orders and restores catalog stock.
// afterEach gets its own timeout, so cleanup still runs after a failed step.
test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: "ignoreErrors" });
  await page.request.delete("/api/auth/me", {
    data: { password },
    headers: { "X-CSRFToken": await csrf(page) },
  });
});

async function startOrder(page: Page, quantity: string, note = "") {
  await page.getByRole("button", { name: "Daftar", exact: true }).click();
  await page
    .getByRole("button", { name: "Pesan Surprise Pastry Box", exact: true })
    .click();
  await page.getByLabel("Jumlah porsi").fill(quantity);
  if (note) await page.getByLabel("Catatan pengambilan").fill(note);
  await page.getByRole("button", { name: "Lanjut ke ringkasan" }).click();
  await expect(page).toHaveURL(/\/pesanan\/\d+$/);
  await expect(
    page.getByRole("heading", { name: "Ringkasan pesanan" }),
  ).toBeVisible();
}

async function payFromSummary(page: Page) {
  await page.getByRole("button", { name: /^Bayar Rp/ }).click();
  await expect(page).toHaveURL(/\/pesanan\/\d+\/bayar$/);
  await page
    .getByRole("button", { name: "Simulasikan pembayaran berhasil" })
    .click();
  await expect(page).toHaveURL(/\/pesanan$/);
}

const saved = (page: Page) =>
  page.waitForResponse(
    (r) =>
      /\/api\/reservations\/\d+$/.test(new URL(r.url()).pathname) &&
      r.request().method() === "PATCH",
  );

test("summary page edits the order, then mock payment shows the active order", async ({
  page,
}) => {
  await signUpBuyer(page);
  await startOrder(page, "1");
  await expect(page.getByText("maks. 4 per pesanan")).toBeVisible();
  await expect(page.getByTestId("order-total")).toHaveText(/Rp\s?18\.000/);

  const quantitySaved = saved(page);
  await page.getByRole("button", { name: "Tambah porsi" }).click();
  // Optimistic: the total changes before the server has answered.
  await expect(page.getByTestId("order-total")).toHaveText(/Rp\s?36\.000/);
  await quantitySaved;

  const note = page.getByLabel("Catatan untuk toko (opsional)");
  await note.fill("Es dipisah");
  await expect(page.getByText("10/140")).toBeVisible();
  const noteSaved = saved(page);
  await note.blur();
  await noteSaved;
  await expect(
    page.getByText(/Pembatalan bisa sampai \d{2}\.\d{2}/),
  ).toBeVisible();

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("quantity")).toHaveText("2");
  await expect(note).toHaveValue("Es dipisah");

  await page.getByRole("button", { name: /^Bayar Rp/ }).click();
  await expect(page).toHaveURL(/\/pesanan\/\d+\/bayar$/);
  await expect(
    page.getByRole("heading", { name: "Pembayaran", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(/2 porsi kami tahan buat kamu sampai \d{2}\.\d{2}/),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Simulasikan pembayaran berhasil" })
    .click();
  await expect(page).toHaveURL(/\/pesanan$/);
  await expect(page.getByRole("tab", { name: "Aktif · 1" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  const order = page.locator(".order-card");
  await expect(order).toHaveCount(1);
  await expect(order).toContainText("Surprise Pastry Box");
  await expect(order).toContainText("2 porsi");
  await expect(order.getByTestId("ticket-code")).toHaveText(ticketCode);
});

test("unpaid orders resume from Pesanan saya; cancel and delete are optimistic", async ({
  page,
}) => {
  await signUpBuyer(page);
  await startOrder(page, "1");
  await page
    .getByRole("banner")
    .getByRole("link", { name: "Pesanan", exact: true })
    .click();
  await expect(page).toHaveURL(/\/pesanan$/);
  const order = page.locator(".order-card");
  await expect(order).toContainText("Menunggu pembayaran");
  await order.getByRole("link", { name: "Lanjutkan pembayaran" }).click();
  await expect(page).toHaveURL(/\/pesanan\/\d+$/);
  await page.goBack();

  await order.getByRole("button", { name: "Batalkan pesanan" }).click();
  await order.getByRole("button", { name: "Ya, batalkan" }).click();
  await expect(page.locator(".order-card")).toHaveCount(0);
  await page.getByRole("tab", { name: "Riwayat · 1" }).click();
  await expect(order).toContainText("Dibatalkan");

  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route("**/api/reservations/*", async (route) => {
    if (route.request().method() !== "DELETE") return route.fallback();
    await held;
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ detail: "Server sedang bermasalah." }),
    });
  });
  await order.getByRole("button", { name: "Hapus dari riwayat" }).click();
  await expect(page.locator(".order-card")).toHaveCount(0);
  release();
  await expect(page.locator(".order-card")).toHaveCount(1);
  await expect(
    page.getByRole("alert").filter({ hasText: "Server sedang bermasalah." }),
  ).toBeVisible();
});

test("a refused cancellation puts the paid order back", async ({ page }) => {
  await signUpBuyer(page);
  await startOrder(page, "1");
  await payFromSummary(page);
  const order = page.locator(".order-card");
  await expect(order).toContainText("Aktif");

  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route("**/api/reservations/*/cancel", async (route) => {
    await held;
    await route.fulfill({
      status: 409,
      contentType: "application/json",
      body: JSON.stringify({ detail: "Pembatalan ditutup pukul 20.00." }),
    });
  });
  await order.getByRole("button", { name: "Batalkan pesanan" }).click();
  await order.getByRole("button", { name: "Ya, batalkan" }).click();
  await expect(page.locator(".order-card")).toHaveCount(0);
  release();
  await expect(page.locator(".order-card")).toHaveCount(1);
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "Pembatalan ditutup pukul 20.00." }),
  ).toBeVisible();
});

test("guests are asked to sign in before seeing orders", async ({ page }) => {
  await page.goto("/pesanan", { waitUntil: "domcontentloaded" });
  await expect(page.getByText("Masuk untuk melihat pesananmu")).toBeVisible();
});
