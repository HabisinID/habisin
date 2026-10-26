import { expect, test } from "./fixtures";
import type { Page } from "@playwright/test";

// Runs against the real backend, like demo.spec.ts: both servers and a fresh
// seed_demo catalog are required.
const password = "Order-Flow-Secure-927!";

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
  await expect(
    page.getByRole("heading", { name: "Ringkasan pesanan" }),
  ).toBeVisible();
}

async function openOrders(page: Page) {
  await page.getByRole("button", { name: "Pesanan saya" }).click();
  await expect(
    page.getByRole("heading", { name: "Pesanan saya" }),
  ).toBeVisible();
}

test("summary, edit, mock payment, cancel, and delete from history", async ({
  page,
}) => {
  await signUpBuyer(page);
  await startOrder(page, "2", "Tanpa sendok plastik");
  const summary = page.getByRole("dialog");
  await expect(summary).toContainText("Menunggu pembayaran");
  await expect(summary).toContainText("Tanpa sendok plastik");
  await expect(summary).toContainText(/\d+(,\d)? km dari lokasi pencarian/);
  await expect(summary.getByTestId("order-total")).toHaveText("Rp 36.000");

  await summary.getByRole("button", { name: "Ubah pesanan" }).click();
  await summary.getByLabel("Jumlah porsi").fill("3");
  await summary.getByLabel("Catatan pengambilan").fill("Ambil jam 7");
  await summary.getByRole("button", { name: "Simpan perubahan" }).click();
  await expect(summary.getByTestId("order-total")).toHaveText("Rp 54.000");
  await expect(summary).toContainText("Ambil jam 7");

  await summary
    .getByRole("button", { name: "Simulasikan pembayaran berhasil" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Makananmu sudah dipesan!" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Lihat pesanan saya" }).click();

  const order = page.locator(".order-item").first();
  await expect(order).toContainText("Dipesan");
  await expect(order).toContainText("3 porsi");
  await order.getByRole("button", { name: "Batalkan", exact: true }).click();
  await expect(order).toContainText("Dibatalkan");
  await order.getByRole("button", { name: "Hapus dari riwayat" }).click();
  await expect(page.locator(".order-item")).toHaveCount(0);
});

test("unpaid orders can be resumed or cancelled from the summary", async ({
  page,
}) => {
  await signUpBuyer(page);
  await startOrder(page, "1");
  await page.getByRole("button", { name: "Tutup", exact: true }).click();
  await openOrders(page);
  const order = page.locator(".order-item").first();
  await expect(order).toContainText("Menunggu pembayaran");
  await expect(order.getByRole("button", { name: /^Tiket/ })).toHaveCount(0);
  await order.getByRole("button", { name: "Lanjutkan pembayaran" }).click();
  const summary = page.getByRole("dialog");
  await expect(
    summary.getByRole("heading", { name: "Ringkasan pesanan" }),
  ).toBeVisible();
  await summary.getByRole("button", { name: "Batalkan pesanan" }).click();
  await openOrders(page);
  await expect(page.locator(".order-item").first()).toContainText("Dibatalkan");
});

test("cancel and delete update instantly and roll back when the server refuses", async ({
  page,
}) => {
  await signUpBuyer(page);
  await startOrder(page, "1");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Simulasikan pembayaran berhasil" })
    .click();
  await page.getByRole("button", { name: "Lihat pesanan saya" }).click();
  const order = page.locator(".order-item").first();

  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route("**/api/reservations/*/cancel", async (route) => {
    await held;
    await route.fulfill({
      status: 409,
      contentType: "application/json",
      body: JSON.stringify({ detail: "Pesanan sudah diambil." }),
    });
  });
  await order.getByRole("button", { name: "Batalkan", exact: true }).click();
  // Optimistic: the label changes before the server has answered.
  await expect(order).toContainText("Dibatalkan");
  release();
  await expect(order).toContainText("Dipesan");
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "Pesanan sudah diambil.",
  );
  await page.unroute("**/api/reservations/*/cancel");

  await order.getByRole("button", { name: "Batalkan", exact: true }).click();
  await expect(order).toContainText("Dibatalkan");
  let releaseDelete!: () => void;
  const heldDelete = new Promise<void>((resolve) => (releaseDelete = resolve));
  await page.route("**/api/reservations/*", async (route) => {
    if (route.request().method() !== "DELETE") return route.fallback();
    await heldDelete;
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ detail: "Server sedang bermasalah." }),
    });
  });
  await order.getByRole("button", { name: "Hapus dari riwayat" }).click();
  await expect(page.locator(".order-item")).toHaveCount(0);
  releaseDelete();
  await expect(page.locator(".order-item")).toHaveCount(1);
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "Server sedang bermasalah.",
  );
});
