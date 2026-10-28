import { expect, test } from "./fixtures";

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aS1cAAAAASUVORK5CYII=",
  "base64",
);

test("account picture previews, uploads and removes", async ({ page }) => {
  let user = {
    id: 1,
    username: "buyer",
    name: "Buyer Test",
    email: "buyer@example.com",
    role: "buyer",
    profile_picture: null as string | null,
  };
  let uploaded = false;
  await page.route("**/media/profiles/**", (route) =>
    route.fulfill({ body: png, contentType: "image/png" }),
  );
  await page.route("**/api/auth/csrf", (route) =>
    route.fulfill({ json: { csrfToken: "token" } }),
  );
  await page.route("**/api/auth/me", async (route) => {
    const request = route.request();
    if (request.method() === "PATCH") {
      if (request.headers()["content-type"].startsWith("multipart/form-data")) {
        expect(
          request
            .postDataBuffer()
            ?.includes(
              Buffer.from('name="profile_picture"; filename="portrait.png"'),
            ),
        ).toBe(true);
        uploaded = true;
        user = { ...user, profile_picture: "/media/profiles/test.jpg" };
      } else {
        expect(request.postDataJSON().profile_picture).toBe("");
        user = { ...user, profile_picture: null };
      }
    }
    await route.fulfill({ json: user });
  });
  await page.route("**/api/listings**", (route) => route.fulfill({ json: [] }));
  await page.goto("/jelajahi");
  await page.getByRole("button", { name: "Akun Buyer Test" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Foto profil", { exact: true }).setInputFiles({
    name: "portrait.png",
    mimeType: "image/png",
    buffer: png,
  });
  await expect(
    dialog.getByAltText("Foto Profil", { exact: true }),
  ).toHaveAttribute("src", /^blob:/);
  await dialog.getByRole("button", { name: "Simpan perubahan" }).click();
  await expect(dialog.getByRole("status")).toHaveText(
    "Profil berhasil disimpan.",
  );
  expect(uploaded).toBe(true);
  await expect(dialog.getByAltText("Foto Buyer Test")).toHaveAttribute(
    "src",
    "/media/profiles/test.jpg",
  );
  await dialog.getByRole("button", { name: "Hapus foto", exact: true }).click();
  await dialog.getByRole("button", { name: "Simpan perubahan" }).click();
  await expect(dialog.getByAltText("Foto Buyer Test")).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Akun Buyer Test" }),
  ).toHaveText("BT");
});

test("store picture uploads and appears on the public profile", async ({
  page,
}) => {
  const store = {
    id: 7,
    name: "Dapur Test",
    description: "Makanan rumahan",
    address: "Jalan Depok 10",
    opening_time: "08:00:00",
    closing_time: "20:00:00",
    latitude: -6.36,
    longitude: 106.83,
    is_open: true,
    category: "Roti & kue",
    profile_picture: null as string | null,
  };
  await page.route("**/api/auth/me", (route) =>
    route.fulfill({
      json: { id: 1, username: "partner", name: "Partner", role: "partner" },
    }),
  );
  await page.route("**/api/auth/csrf", (route) =>
    route.fulfill({ json: { csrfToken: "token" } }),
  );
  await page.route("**/api/partner/stores", (route) =>
    route.fulfill({ json: { stores: [store] } }),
  );
  await page.route("**/api/partner/stores/7", async (route) => {
    expect(route.request().headers()["content-type"]).toContain(
      "multipart/form-data",
    );
    expect(
      route
        .request()
        .postDataBuffer()
        ?.includes(Buffer.from('name="profile_picture"; filename="store.png"')),
    ).toBe(true);
    const payload = route.request().postDataBuffer()!.toString();
    expect(payload).toContain('name="weekly_hours"');
    expect(payload).toContain('name="category"');
    expect(payload).toContain('name="landmark"');
    store.profile_picture = "/media/stores/test.jpg";
    await route.fulfill({ json: store });
  });
  await page.route("**/media/stores/**", (route) =>
    route.fulfill({ body: png, contentType: "image/png" }),
  );
  await page.route("**/api/stores/7", (route) =>
    route.fulfill({ json: store }),
  );
  await page.route("**/api/stores/7/listings**", (route) =>
    route.fulfill({ json: [] }),
  );
  await page.goto("/partner/store");
  await page
    .getByLabel("Foto profil", { exact: true })
    .setInputFiles({ name: "store.png", mimeType: "image/png", buffer: png });
  await expect(
    page.getByAltText("Foto Profil", { exact: true }),
  ).toHaveAttribute("src", /^blob:/);
  await page.getByRole("checkbox", { name: "Saya sudah memastikan" }).check();
  await page.getByRole("button", { name: "Simpan perubahan toko" }).click();
  await expect(
    page.getByAltText("Foto Profil", { exact: true }),
  ).toHaveAttribute("src", "/media/stores/test.jpg");
  await page.goto("/stores/7");
  await expect(page.getByAltText("Foto Dapur Test")).toHaveAttribute(
    "src",
    "/media/stores/test.jpg",
  );
});

test("partner account picture uploads and updates the workspace avatar", async ({
  page,
}) => {
  let user = {
    id: 2,
    username: "partner",
    name: "Partner Test",
    email: "partner@example.com",
    role: "partner",
    profile_picture: null as string | null,
  };
  await page.route("**/api/auth/csrf", (route) =>
    route.fulfill({ json: { csrfToken: "token" } }),
  );
  await page.route("**/api/auth/me", async (route) => {
    if (route.request().method() === "PATCH") {
      expect(route.request().headers()["content-type"]).toContain(
        "multipart/form-data",
      );
      expect(route.request().postDataBuffer()!.toString()).toContain(
        'name="profile_picture"; filename="portrait.png"',
      );
      user = { ...user, profile_picture: "/media/profiles/partner.png" };
    }
    await route.fulfill({ json: user });
  });
  await page.route("**/media/profiles/**", (route) =>
    route.fulfill({ body: png, contentType: "image/png" }),
  );
  await page.goto("/partner/account");
  await page.getByRole("button", { name: "Data login", exact: true }).click();
  await page
    .getByLabel("Foto profil", { exact: true })
    .setInputFiles({
      name: "portrait.png",
      mimeType: "image/png",
      buffer: png,
    });
  await page
    .getByRole("button", { name: "Simpan perubahan", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Data login berhasil disimpan.",
  );
  await expect(
    page.getByRole("banner").getByAltText("Foto Partner Test"),
  ).toHaveAttribute("src", "/media/profiles/partner.png");
});
