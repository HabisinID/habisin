import { expect, test } from "./fixtures";
import type { Page } from "@playwright/test";
import { lowContrastText } from "./contrast";
import {
  cleanup,
  listing,
  mutate,
  password,
  register,
} from "./backend-fixtures";

// Signed-in pages (modules 3, 4 and 7) against the real backend, like
// demo.spec.ts: both servers and a fresh seed_demo catalog are required.
async function checkContrast(page: Page, mode: string, label: string) {
  await page.waitForLoadState("networkidle");
  expect(
    await page.evaluate(() => document.documentElement.dataset.theme),
  ).toBe(mode);
  expect(await lowContrastText(page), `${mode} · ${label}`).toEqual([]);
}

for (const mode of ["light", "dark"] as const) {
  test(`signed-in buyer and partner pages meet WCAG AA contrast in the ${mode} theme`, async ({
    page,
    request,
  }) => {
    test.setTimeout(120000);
    await page.addInitScript(
      (value) => localStorage.setItem("habisin-theme", value),
      mode,
    );
    const stores = await register(request, "partner", 1);
    try {
      const created = await mutate(request, "partner/listings", {
        ...listing(`Kontras ${mode} ${Date.now()}`),
        store_id: stores[0].id,
      });
      expect(created.status()).toBe(201);
      const item = await created.json();

      await register(page.request, "buyer");
      try {
        await page.goto("/");
        await checkContrast(page, mode, "pembeli · katalog");
        await page.goto(`/?listing=${item.id}`);
        await checkContrast(page, mode, "pembeli · detail makanan");
        await page.getByRole("button", { name: "Lanjut ke ringkasan" }).click();
        await expect(page).toHaveURL(/\/pesanan\/\d+$/);
        await checkContrast(page, mode, "pembeli · ringkasan pesanan");
        await page.getByRole("button", { name: /^Bayar Rp/ }).click();
        await expect(page).toHaveURL(/\/bayar$/);
        await checkContrast(page, mode, "pembeli · pembayaran");
        await page
          .getByRole("button", { name: "Simulasikan pembayaran berhasil" })
          .click();
        await expect(page).toHaveURL(/\/pesanan$/);
        await checkContrast(page, mode, "pembeli · pesanan saya");
      } finally {
        await mutate(page.request, "auth/me", { password }, "DELETE");
      }

      await register(page.request, "partner", 1);
      try {
        await page.goto("/");
        await checkContrast(page, mode, "mitra · dasbor");
        await page
          .getByRole("button", { name: "Listing", exact: true })
          .click();
        await checkContrast(page, mode, "mitra · kelola listing");
        await page
          .getByRole("dialog")
          .getByRole("button", { name: "Tambah listing", exact: true })
          .click();
        await checkContrast(page, mode, "mitra · tambah listing");
      } finally {
        await cleanup(page.request);
      }
    } finally {
      await cleanup(request);
    }
  });
}
