import { expect, test } from "@playwright/test";

test("discovery filters, favorites, interactive map, and responsive layout", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "dihabisin",
  );
  await expect(page.locator(".food-card")).toHaveCount(6);
  await page
    .getByRole("textbox", { name: "Cari makanan atau toko" })
    .fill("pastry");
  await expect(page.locator(".food-card")).toHaveCount(1);
  await page.getByRole("button", { name: "Hapus pencarian" }).click();
  await page.getByLabel("Donasi gratis", { exact: true }).check();
  await expect(page.locator(".food-card")).toHaveCount(1);
  await expect(page.locator(".card-title")).toHaveText("Roti Berbagi");
  await page.getByLabel("Donasi gratis", { exact: true }).uncheck();
  await page
    .getByRole("button", { name: "Simpan Surprise Pastry Box ke favorit" })
    .click();
  await page.reload();
  await expect(
    page.getByRole("button", {
      name: "Hapus Surprise Pastry Box dari favorit",
    }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Peta", exact: true }).click();
  await expect(page.locator(".leaflet-marker-icon.food-pin")).toHaveCount(6);
  await page.locator(".leaflet-marker-icon.food-pin").first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Tutup", exact: true }).click();
  await page.getByRole("button", { name: "Daftar", exact: true }).click();
  await page.screenshot({ path: "/tmp/habisin-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "/tmp/habisin-mobile.png", fullPage: true });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
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
  await page.goto("/");
  try {
    await page
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
    await page.reload();
    await expect(
      page.getByRole("button", { name: "B Browser", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Pesan Surprise Pastry Box", exact: true })
      .click();
    await page.getByLabel("Jumlah porsi").fill("2");
    await page
      .getByRole("button", { name: "Simulasikan pembayaran berhasil" })
      .click();
    await expect(
      page.getByRole("heading", { name: "Makananmu sudah dipesan!" }),
    ).toBeVisible();
    await expect(page.locator(".ticket > strong")).toHaveText(/^[A-Z2-9]{5}$/);
    await page.getByRole("button", { name: "Lihat pesanan saya" }).click();
    await expect(page.locator(".order-item")).toHaveCount(1);
    await page.getByRole("button", { name: "Batalkan", exact: true }).click();
    await expect(page.getByText("Dibatalkan", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Tutup", exact: true }).click();
    await page.getByRole("button", { name: "B Browser", exact: true }).click();
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
    await page.getByRole("button", { name: "Masuk", exact: true }).click();
    await page.getByLabel("Username", { exact: true }).fill(username);
    await page.getByLabel("Password", { exact: true }).fill(newPassword);
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Masuk", exact: true })
      .click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await page.getByRole("button", { name: "U Updated", exact: true }).click();
    await page.getByRole("button", { name: "Hapus akun", exact: true }).click();
    await page.getByLabel("Konfirmasi password").fill(newPassword);
    await page.getByRole("dialog").getByRole("checkbox").check();
    await page.getByRole("button", { name: "Hapus akun permanen" }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await expect(
      page.getByRole("button", { name: "Masuk", exact: true }),
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
