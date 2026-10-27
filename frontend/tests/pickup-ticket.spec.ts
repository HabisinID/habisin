import { expect, test } from "./fixtures";
import type { Page } from "@playwright/test";
import {
  deleteAccount,
  payFromSummary,
  signUpBuyer,
  startOrder,
  ticketCode,
} from "./order-helpers";

// Modul 8: the buyer's digital pickup ticket. Runs against the real backend
// with a fresh seed_demo catalog, like orders.spec.ts.
test.afterEach(async ({ page }) => deleteAccount(page));

async function openTicket(page: Page) {
  await signUpBuyer(page);
  await startOrder(page, "1");
  await payFromSummary(page);
  await page.getByRole("link", { name: "Lihat tiket" }).click();
  await expect(page).toHaveURL(/\/pesanan\/\d+\/tiket$/);
  await expect(page.getByText("HABISIN · STRUK AMBIL")).toBeVisible();
  return Number(page.url().match(/pesanan\/(\d+)/)![1]);
}

// Serve the real order with some fields changed, to show states the demo
// catalog cannot reach on demand (picked up by a cashier, last 30 minutes, free).
async function showAs(
  page: Page,
  id: number,
  change: (order: Record<string, unknown>) => void,
) {
  await page.route(`**/api/reservations/${id}`, async (route) => {
    const response = await route.fetch();
    const order = await response.json();
    change(order);
    await route.fulfill({ response, json: order });
  });
  await page.reload();
}

test("a paid order opens its ticket with QR, code, timeline and route", async ({
  page,
}) => {
  await openTicket(page);
  const qr = page.getByRole("img", { name: /^QR kode ambil/ });
  await expect(qr).toBeVisible();
  expect(await qr.boundingBox()).toMatchObject({ width: 144, height: 144 });
  await expect(page.getByTestId("ticket-code")).toHaveText(ticketCode);
  await expect(page.getByText(/^Ambil sebelum \d{2}\.\d{2}$/)).toBeVisible();
  for (const step of ["Dibayar", "Toko buka", "Batas batal", "Batas ambil"])
    await expect(
      page.getByRole("list", { name: "Linimasa pesanan" }).getByText(step),
    ).toBeVisible();
  const route = page.getByRole("link", { name: /Buka rute/ });
  await expect(route).toHaveAttribute("target", "_blank");
  await expect(route).toHaveAttribute("href", /google\.com\/maps\/dir/);
  await expect(page.getByText(/^Dicetak \d{2}\.\d{2} WIB$/)).toBeVisible();
});

test("cancelling from the ticket asks inline, then shows it cancelled", async ({
  page,
}) => {
  await openTicket(page);
  await page.getByRole("button", { name: "Batalkan pesanan" }).click();
  await expect(
    page.getByText(/^Bisa dibatalkan sampai \d{2}\.\d{2} · 30 menit/),
  ).toBeVisible();
  await page.getByRole("button", { name: "Ya, batalkan" }).click();
  await expect(page.getByText("Dibatalkan", { exact: true })).toBeVisible();
  await expect(page.getByRole("img", { name: /^QR kode ambil/ })).toHaveCount(
    0,
  );
});

test("a picked-up ticket replaces the QR and strikes the code", async ({
  page,
}) => {
  const id = await openTicket(page);
  await showAs(page, id, (order) => {
    order.status = "picked_up";
    order.picked_up_at = new Date().toISOString();
  });
  await expect(page.getByText("Sudah dipakai", { exact: true })).toBeVisible();
  await expect(page.getByRole("img", { name: /^QR kode ambil/ })).toHaveCount(
    0,
  );
  await expect(page.getByTestId("ticket-code")).toHaveCSS(
    "text-decoration-line",
    "line-through",
  );
  await expect(
    page.getByRole("button", { name: "Batalkan pesanan" }),
  ).toHaveCount(0);
});

test("the last 30 minutes turn the ticket orange and close cancelling", async ({
  page,
}) => {
  const id = await openTicket(page);
  const end = Date.now() + 20 * 60000;
  await showAs(page, id, (order) => {
    const listing = order.listing as Record<string, unknown>;
    listing.pickup_end = new Date(end).toISOString();
    order.cancel_until = new Date(end - 30 * 60000).toISOString();
  });
  await expect(
    page.getByText(/^Pembatalan ditutup \d{2}\.\d{2}$/),
  ).toBeVisible();
  await expect(page.getByTestId("ticket-status")).toHaveAttribute(
    "data-urgent",
    "true",
  );
  await expect(
    page.getByRole("button", { name: "Batalkan pesanan" }),
  ).toHaveCount(0);
});

test("a free order says Gratis on the receipt", async ({ page }) => {
  const id = await openTicket(page);
  await showAs(page, id, (order) => {
    order.total = 0;
  });
  await expect(page.getByTestId("ticket-price")).toHaveText("Gratis");
});
