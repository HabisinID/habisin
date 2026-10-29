import { expect, test } from "./fixtures";
import type { Page } from "@playwright/test";

async function openCatalog(page: Page) {
  const ready = page.waitForResponse(
    (response) => new URL(response.url()).pathname === "/api/listings",
  );
  await page.goto("/", { waitUntil: "domcontentloaded" });
  // The catalog request starts in useEffect, after hydration attaches handlers.
  await ready;
}

test("discovery filters, favorites, interactive map, and responsive layout", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await openCatalog(page);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Roti, nasi, dan kue",
  );
  await expect(
    page
      .getByRole("region", { name: "Makanan di sekitarmu" })
      .locator(".food-card"),
  ).toHaveCount(4);
  await page
    .getByRole("link", { name: "Lihat makanan di sekitar saya", exact: true })
    .click();
  await expect(page.locator(".food-card")).toHaveCount(6);
  await page
    .getByRole("textbox", { name: "Cari makanan atau toko" })
    .fill("pastry");
  await expect(page.locator(".food-card")).toHaveCount(1);
  await page.getByRole("button", { name: "Hapus pencarian" }).click();
  await page.getByRole("button", { name: "Gratis", exact: true }).click();
  await expect(page.locator(".food-card")).toHaveCount(1);
  await page.getByRole("button", { name: "Gratis", exact: true }).click();
  await page
    .getByRole("button", { name: "Simpan Surprise Pastry Box ke favorit" })
    .click();
  await expect(page.getByRole("dialog", { name: "Login" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".food-pin")).toHaveCount(6);
  await page.locator(".food-pin").filter({ hasText: "Kopi Tuku" }).click();
  await expect(page.getByText("Profil toko belum terhubung.")).toBeVisible();
  await page
    .getByRole("region", { name: /^Pilihan makanan/ })
    .getByRole("button", { name: /Surprise Pastry Box/ })
    .click();
  await expect(
    page.getByRole("region", { name: "Detail makanan", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("navigation", { name: "Breadcrumb" })
    .getByRole("button", { name: "Jelajahi", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Detail makanan", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Daftar", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});

test("register, reserve, ticket, cancel, profile, password, login, and delete", async ({
  page,
}) => {
  const username = `browser_${Date.now()}`;
  const password = "Demo-Meal-Secure-927!";
  const newPassword = "Demo-New-Secure-638!";
  let registered = false;
  let changed = false;
  await openCatalog(page);
  try {
    await page
      .getByRole("banner")
      .getByRole("button", { name: "Daftar gratis", exact: true })
      .click();
    await page.getByLabel("Nama lengkap").fill("Browser Tester");
    await page.getByLabel("Username", { exact: true }).fill(username);
    await expect(page.getByText("Username tersedia ✓")).toBeVisible();
    await page.getByLabel("Email", { exact: true }).fill("browser@example.com");
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Buat akun", exact: true }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
    registered = true;
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(
      page.getByRole("button", { name: "Akun Browser Tester", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Daftar", exact: true }).click();
    await page
      .getByRole("button", { name: "Pesan Surprise Pastry Box", exact: true })
      .click();
    await page.getByLabel("Jumlah porsi").fill("2");
    await page.getByRole("button", { name: "Lanjut ke ringkasan" }).click();
    await page.getByRole("button", { name: /^Bayar Rp/ }).click();
    await page
      .getByRole("button", { name: "Simulasikan pembayaran berhasil" })
      .click();
    await expect(page).toHaveURL(/\/pesanan$/);
    const order = page.locator(".order-card");
    await expect(order).toHaveCount(1);
    await expect(order.getByTestId("ticket-code")).toHaveText(
      /^[A-Z0-9]{3} · [A-Z0-9]{2}$/,
    );
    await order.getByRole("button", { name: "Batalkan pesanan" }).click();
    await order.getByRole("button", { name: "Ya, batalkan" }).click();
    await page.getByRole("tab", { name: /^Riwayat/ }).click();
    await expect(order).toContainText("Dibatalkan");
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page
      .getByRole("button", { name: "Akun Browser Tester", exact: true })
      .click();
    await page.getByLabel("Nama lengkap").fill("Updated Tester");
    await page.getByRole("button", { name: "Simpan perubahan" }).click();
    await expect(page.getByText("Profil berhasil disimpan.")).toBeVisible();
    await page.getByRole("button", { name: "Password", exact: true }).click();
    await page.getByLabel("Password lama").fill(password);
    await page.getByLabel("Password baru").fill(newPassword);
    await page.getByRole("button", { name: "Simpan perubahan" }).click();
    await expect(page.getByText("Password berhasil diubah.")).toBeVisible();
    changed = true;
    await page.getByRole("button", { name: "Tutup", exact: true }).click();
    await page.getByRole("button", { name: "Keluar", exact: true }).click();
    await page
      .getByRole("banner")
      .getByRole("button", { name: "Masuk", exact: true })
      .click();
    await page.getByLabel("Username", { exact: true }).fill(username);
    await page.getByLabel("Password", { exact: true }).fill(newPassword);
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Masuk", exact: true })
      .click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await page
      .getByRole("button", { name: "Akun Updated Tester", exact: true })
      .click();
    await page.getByRole("button", { name: "Hapus akun", exact: true }).click();
    await page.getByLabel("Konfirmasi password").fill(newPassword);
    await page.getByRole("dialog").getByRole("checkbox").check();
    await page.getByRole("button", { name: "Hapus akun permanen" }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await expect(
      page
        .getByRole("banner")
        .getByRole("button", { name: "Masuk", exact: true }),
    ).toBeVisible();
    registered = false;
  } finally {
    if (registered) {
      let csrf = (await (await page.request.get("/api/auth/csrf")).json())
        .csrfToken;
      await page.request.post("/api/auth/login", {
        data: { username, password: changed ? newPassword : password },
        headers: { "X-CSRFToken": csrf },
      });
      csrf = (await (await page.request.get("/api/auth/csrf")).json())
        .csrfToken;
      await page.request.delete("/api/auth/me", {
        data: { password: changed ? newPassword : password },
        headers: { "X-CSRFToken": csrf },
      });
    }
  }
});
