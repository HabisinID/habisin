import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { cleanup, listing, mutate, register } from "./backend-fixtures";
import { deleteAccount, signUpBuyer, startOrder } from "./order-helpers";

// Modul 7 and 8 pages at phone, tablet and desktop widths: no horizontal
// scroll, and no two visible controls overlapping. Needs both servers.
const WIDTHS = [390, 760, 1440];

async function audit(page: Page, name: string) {
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(300);
    const result = await page.evaluate(() => {
      const controls = [
        ...document.querySelectorAll(
          "a, button, input:not([type=hidden]), select, textarea",
        ),
      ].filter((el) => {
        const box = el.getBoundingClientRect();
        return (
          box.width > 0 &&
          box.height > 0 &&
          getComputedStyle(el).visibility !== "hidden" &&
          !el.closest("dialog:not([open])")
        );
      });
      const label = (el: Element) =>
        (
          el.getAttribute("aria-label") ||
          (el as HTMLElement).innerText ||
          el.tagName
        )
          .trim()
          .slice(0, 30);
      const hits: string[] = [];
      for (let i = 0; i < controls.length; i++)
        for (let j = i + 1; j < controls.length; j++) {
          const [a, b] = [controls[i], controls[j]];
          if (a.contains(b) || b.contains(a)) continue;
          const x = a.getBoundingClientRect();
          const y = b.getBoundingClientRect();
          const width = Math.min(x.right, y.right) - Math.max(x.left, y.left);
          const height = Math.min(x.bottom, y.bottom) - Math.max(x.top, y.top);
          if (width > 2 && height > 2) hits.push(`${label(a)} <> ${label(b)}`);
        }
      return {
        scroll: document.documentElement.scrollWidth - innerWidth,
        hits,
      };
    });
    expect(result, `${name} @${width}px`).toEqual({ scroll: 0, hits: [] });
  }
}

test("order, payment, order list and ticket pages fit every width", async ({
  page,
}) => {
  test.setTimeout(120000);
  try {
    await signUpBuyer(page);
    await startOrder(page, "2", "Tolong dibungkus terpisah");
    await audit(page, "ringkasan");
    await page.getByRole("button", { name: /^Bayar Rp/ }).click();
    await expect(page).toHaveURL(/bayar$/);
    await audit(page, "bayar");
    await page.setViewportSize({ width: 1440, height: 900 });
    await page
      .getByRole("button", { name: "Simulasikan pembayaran berhasil" })
      .click();
    await expect(page).toHaveURL(/\/pesanan$/);
    await audit(page, "pesanan");
    await page.getByRole("link", { name: "Lihat tiket" }).click();
    await expect(page.getByText("HABISIN · STRUK AMBIL")).toBeVisible();
    await audit(page, "tiket");
  } finally {
    await deleteAccount(page);
  }
});

test("the cashier page fits every width", async ({ page, request }) => {
  test.setTimeout(120000);
  try {
    const stores = await register(page.request, "partner", 1);
    await register(request, "buyer");
    const item = await (
      await mutate(page.request, "partner/listings", {
        ...listing("Nasi Bakar Ayam Kampung Spesial"),
        store_id: stores[0].id,
      })
    ).json();
    const order = await (
      await mutate(request, "reservations", {
        listing_id: item.id,
        quantity: 2,
      })
    ).json();
    await mutate(request, `reservations/${order.id}/pay`);
    await page.goto("/api/partner/kasir");
    await page.getByLabel("Karakter 1").click();
    await page.keyboard.type(order.code);
    await expect(page.getByText("Kode cocok")).toBeVisible();
    await audit(page, "kasir");
  } finally {
    await cleanup(request);
    await cleanup(page.request);
  }
});
