import { expect, test } from "./fixtures";

const buyer = {
  id: 1,
  username: "rani",
  name: "Rani Ayu",
  email: "rani@example.com",
  role: "buyer",
};

for (const mode of ["register", "password"] as const) {
  test(`${mode} rejects mismatched confirmation before sending a mutation`, async ({
    page,
  }) => {
    const writes: Record<string, string>[] = [];
    await page.route("**/api/**", (route) => route.fulfill({ json: [] }));
    await page.route("**/api/auth/me", (route) =>
      route.fulfill(
        mode === "register"
          ? { status: 403, json: { detail: "Sign in" } }
          : { json: buyer },
      ),
    );
    await page.route("**/api/auth/username?*", (route) =>
      route.fulfill({ json: { available: true, valid: true } }),
    );
    await page.route("**/api/auth/csrf", (route) =>
      route.fulfill({ json: { csrfToken: "test-token" } }),
    );
    await page.route(`**/api/auth/${mode}`, async (route) => {
      writes.push(route.request().postDataJSON());
      await route.fulfill({
        json: mode === "register" ? buyer : { detail: "Changed" },
      });
    });
    await page.goto("/jelajahi", { waitUntil: "domcontentloaded" });
    if (mode === "register") {
      await page
        .getByRole("banner")
        .getByRole("button", { name: "Daftar gratis", exact: true })
        .click();
      await page.getByLabel("Nama lengkap").fill("Rani Ayu");
      await page.getByLabel("Username", { exact: true }).fill("rani");
      await page.getByLabel("Email", { exact: true }).fill(buyer.email);
      await page
        .getByLabel("Password", { exact: true })
        .fill("Secure-Meal-927!");
    } else {
      await page
        .getByRole("button", { name: "Akun Rani Ayu", exact: true })
        .click();
      await page.getByRole("button", { name: "Password", exact: true }).click();
      await page.getByLabel("Password lama").fill("Previous-Meal-927!");
      await page
        .getByLabel("Password baru", { exact: true })
        .fill("Secure-Meal-927!");
    }
    const confirmation = page.getByLabel(
      mode === "register" ? "Konfirmasi password" : "Konfirmasi password baru",
      { exact: true },
    );
    const save = page.getByRole("button", {
      name: mode === "register" ? "Buat akun" : "Simpan perubahan",
      exact: true,
    });
    await confirmation.fill("Different-Meal-927!");
    await save.click();
    await expect(
      page
        .getByRole("alert")
        .filter({ hasText: "Konfirmasi password harus sama" }),
    ).toBeVisible();
    expect(writes).toHaveLength(0);
    await confirmation.fill("Secure-Meal-927!");
    await save.click();
    await expect.poll(() => writes.length).toBe(1);
    expect(
      writes[0][
        mode === "register" ? "password_confirm" : "new_password_confirm"
      ],
    ).toBe("Secure-Meal-927!");
  });
}
