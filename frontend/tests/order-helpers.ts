import { expect } from "./fixtures";
import type { Page } from "@playwright/test";

// Runs against the real backend, like demo.spec.ts: both servers and a fresh
// seed_demo catalog are required.
export const password = "Order-Flow-Secure-927!";
export const ticketCode =
  /^[ACDEFHJKMNPRTUVWXY3479]{3} · [ACDEFHJKMNPRTUVWXY3479]{2}$/;

export async function csrf(page: Page) {
  return (await (await page.request.get("/api/auth/csrf")).json()).csrfToken;
}

export async function signUpBuyer(page: Page) {
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
export async function deleteAccount(page: Page) {
  await page.unrouteAll({ behavior: "ignoreErrors" });
  await page.request.delete("/api/auth/me", {
    data: { password },
    headers: { "X-CSRFToken": await csrf(page) },
  });
}

export async function startOrder(page: Page, quantity: string, note = "") {
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

export async function payFromSummary(page: Page) {
  await page.getByRole("button", { name: /^Bayar Rp/ }).click();
  await expect(page).toHaveURL(/\/pesanan\/\d+\/bayar$/);
  await page
    .getByRole("button", { name: "Simulasikan pembayaran berhasil" })
    .click();
  await expect(page).toHaveURL(/\/pesanan$/);
}
