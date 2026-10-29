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
  await expect(page.getByText("Aktif · sudah dibayar")).toBeVisible();
  await expect(
    page.getByText("Tunjukkan kode atau QR ini ke kasir.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByText(
      /^Toko mulai melayani \d{2}\.\d{2}\. Pesanan ditahan kasir sampai \d{2}\.\d{2}\.$/,
    ),
  ).toBeVisible();
  for (const step of [
    "Dibayar",
    "Toko mulai melayani",
    "Batas batal",
    "Batas ambil",
  ])
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
    page.getByText("Batalkan pesanan? 1 porsi akan dikembalikan ke toko."),
  ).toBeVisible();
  await expect(
    page.getByText(/^Bisa dibatalkan sampai \d{2}\.\d{2} · 30 menit/),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Tidak, simpan tiket" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Ya, batalkan pesanan" }).click();
  await expect(page.getByText("Dibatalkan", { exact: true })).toBeVisible();
  await expect(page.getByRole("img", { name: /^QR kode ambil/ })).toHaveCount(
    0,
  );
});

// Raihan's review API, answered here so the ticket's review form can be
// tested without a cashier handing the order over first.
async function feedback(
  page: Page,
  id: number,
  answer: Record<string, unknown> = {},
) {
  await page.route(`**/api/reservations/${id}/feedback`, (route) =>
    route.fulfill({
      json: {
        can_review: true,
        review: null,
        can_complain: true,
        complaint: null,
        ...answer,
      },
    }),
  );
}

async function pickedUp(page: Page, id: number) {
  await showAs(page, id, (order) => {
    order.status = "picked_up";
    order.picked_up_at = new Date().toISOString();
  });
}

test("a picked-up ticket says when the cashier handed it over", async ({
  page,
}) => {
  const id = await openTicket(page);
  await feedback(page, id);
  await pickedUp(page, id);
  await expect(page.getByText("Selesai diambil")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /^Diambil pukul \d{2}\.\d{2}$/ }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("list", { name: "Linimasa pesanan" })
      .getByText("Diambil", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(
      /^Kode dipakai \d{2}\.\d{2} dan tidak bisa digunakan lagi\.$/,
    ),
  ).toBeVisible();
  await expect(
    page.getByText(
      /^Diserahkan kasir .+\. Terima kasih sudah menyelamatkan 1 porsi dari terbuang\.$/,
    ),
  ).toBeVisible();
  await expect(page.getByText("Sudah dipakai", { exact: true })).toBeVisible();
  await expect(page.getByRole("img", { name: /^QR kode ambil/ })).toHaveCount(
    0,
  );
  await expect(page.getByRole("link", { name: /Buka rute/ })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Batalkan pesanan" }),
  ).toHaveCount(0);
});

test("after pickup the buyer rates the food with stars and chips", async ({
  page,
}) => {
  const id = await openTicket(page);
  await feedback(page, id);
  let sent: unknown = null;
  await page.route("**/api/reviews", async (route) => {
    sent = route.request().postDataJSON();
    await route.fulfill({
      status: 201,
      json: { id: 9, rating: 4, comment: "Masih segar, Porsi sesuai" },
    });
  });
  await pickedUp(page, id);
  const form = page.getByRole("region", { name: /^Bagaimana / });
  await expect(
    form.getByText(
      /^Ulasanmu tampil di halaman .+ dan membantu pembeli lain\.$/,
    ),
  ).toBeVisible();
  const send = form.getByRole("button", { name: "Kirim ulasan" });
  await expect(send).toBeDisabled();
  await form.getByRole("radio", { name: "4 bintang" }).check();
  for (const chip of ["Masih segar", "Porsi sesuai"])
    await form.getByRole("button", { name: chip }).click();
  await expect(
    form.getByRole("button", { name: "Masih segar" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(form.getByRole("button", { name: "Kasir ramah" })).toBeVisible();
  await expect(form.getByRole("button", { name: "Sesuai foto" })).toBeVisible();
  await send.click();
  await expect(
    page.getByText("Terima kasih! Ulasanmu sudah tersimpan."),
  ).toBeVisible();
  expect(sent).toEqual({
    reservation_id: id,
    rating: 4,
    comment: "Masih segar, Porsi sesuai",
  });
  await expect(
    page.getByRole("link", { name: "Laporkan masalah" }),
  ).toHaveAttribute("href", `/komplain/${id}`);
});

test("Nanti saja hides the review form, and a sent review is not asked again", async ({
  page,
}) => {
  const id = await openTicket(page);
  await feedback(page, id);
  await pickedUp(page, id);
  await page.getByRole("button", { name: "Nanti saja" }).click();
  await expect(page.getByRole("button", { name: "Kirim ulasan" })).toHaveCount(
    0,
  );
  await page.unroute(`**/api/reservations/${id}/feedback`);
  await feedback(page, id, {
    can_review: false,
    review: { id: 9, rating: 5, comment: "" },
  });
  await page.reload();
  await expect(page.getByText("Ulasanmu sudah tersimpan.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Ubah ulasan" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Kirim ulasan" })).toHaveCount(
    0,
  );
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

test("cancelled and expired tickets no longer ask to pick up", async ({
  page,
}) => {
  const id = await openTicket(page);
  await page.getByRole("button", { name: "Batalkan pesanan" }).click();
  await page.getByRole("button", { name: "Ya, batalkan pesanan" }).click();
  await expect(page.getByText("Pesanan dibatalkan")).toBeVisible();
  await expect(page.getByText(/^Ambil sebelum/)).toHaveCount(0);
  await showAs(page, id, (order) => {
    order.status = "expired";
  });
  await expect(
    page.getByText(/^Batas ambil \d{2}\.\d{2} sudah lewat$/),
  ).toBeVisible();
  await expect(page.getByText(/^Ambil sebelum/)).toHaveCount(0);
  await expect(
    page.getByText(
      /^Pesanan tidak diambil\. 1 porsi sudah kembali ke .+ pukul \d{2}\.\d{2}\.$/,
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Lihat di peta" }),
  ).toHaveAttribute("href", "/jelajahi");
});

test("offline, the ticket stays readable from the device", async ({ page }) => {
  const id = await openTicket(page);
  const code = await page.getByTestId("ticket-code").textContent();
  await page.route(`**/api/reservations/${id}`, (route) => route.abort());
  await page.reload();
  await expect(
    page.getByText("Tersimpan di perangkat", { exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId("ticket-code")).toHaveText(code!);
  await expect(page.getByRole("img", { name: /^QR kode ambil/ })).toBeVisible();
});

test("a failed refresh shows an error that clears once a refresh succeeds", async ({
  page,
}) => {
  const id = await openTicket(page);
  const path = `**/api/reservations/${id}`;
  await page.route(path, (route) =>
    route.fulfill({ status: 500, json: { detail: "Server sedang sibuk." } }),
  );
  // Next.js adds its own role="alert" route announcer, so match the text.
  const error = page
    .getByRole("alert")
    .filter({ hasText: "Server sedang sibuk" });
  await page.evaluate(() => dispatchEvent(new Event("focus")));
  await expect(error).toBeVisible();
  await page.unroute(path);
  await page.evaluate(() => dispatchEvent(new Event("focus")));
  await expect(error).toHaveCount(0);
});

test("a slow refresh started before cancelling never brings the QR back", async ({
  page,
}) => {
  const id = await openTicket(page);
  let release = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  // The read fetches the paid order now, but answers only after the cancel.
  await page.route(
    `**/api/reservations/${id}`,
    async (route) => {
      const response = await route.fetch();
      await held;
      await route.fulfill({ response });
    },
    { times: 1 },
  );
  await page.evaluate(() => dispatchEvent(new Event("focus")));
  await page.getByRole("button", { name: "Batalkan pesanan" }).click();
  await page.getByRole("button", { name: "Ya, batalkan pesanan" }).click();
  await expect(page.getByText("Pesanan dibatalkan")).toBeVisible();
  release();
  await page.waitForTimeout(500);
  await expect(page.getByText("Pesanan dibatalkan")).toBeVisible();
  await expect(page.getByRole("img", { name: /^QR kode ambil/ })).toHaveCount(
    0,
  );
});
