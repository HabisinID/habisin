import { type Page } from "@playwright/test";
import { expect, test } from "./fixtures";

import {
  password,
  image,
  mutate,
  register,
  listing,
  cleanup,
} from "./backend-fixtures";

async function openFormDetails(page: Page) {
  await expect(
    page.getByRole("heading", { name: "Detail toko & informasi makanan" }),
  ).toBeVisible();
}
async function finishPublished(page: Page) {
  await expect(
    page.getByRole("dialog").getByText("Listing berhasil ditayangkan."),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Kembali ke listing", exact: true })
    .click();
}
async function fillListing(page: Page, name: string, free = false) {
  const data = listing(name);
  await page.getByLabel("Nama makanan", { exact: true }).fill(name);
  await page.getByRole("radio", { name: data.category, exact: true }).click();
  await openFormDetails(page);
  await page.getByLabel("Deskripsi makanan").fill(data.description);
  await page
    .getByLabel("Makanan dibuat (WIB)")
    .fill(
      new Date(Date.now() - 3600000)
        .toLocaleString("sv-SE", { timeZone: "Asia/Jakarta" })
        .replace(" ", "T")
        .slice(0, 16),
    );
  await page.getByRole("radio", { name: "Gunakan URL" }).check();
  await page.getByLabel("URL foto makanan").fill(data.image);
  await page.getByLabel("Jumlah porsi", { exact: true }).fill("4");
  if (free) await page.getByLabel("Gratis (donasi)").check();
  else {
    await page.getByLabel("Harga normal (Rp)").fill("16000");
    await page.getByLabel("Harga sekarang (Rp)").fill("8000");
  }
  await page
    .getByLabel("Toko penjual", { exact: true })
    .selectOption({ index: 1 });
}

test.beforeEach(async ({ page }) => {
  for (const url of ["https://images.unsplash.com/**", image]) {
    await page.route(url, (route) =>
      route.fulfill({
        contentType: "image/svg+xml",
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="#f6eacb"/></svg>',
      }),
    );
  }
});

test("partner CRUD validates, updates the catalog, and preserves ownership", async ({
  page,
}) => {
  const errors: string[] = [];
  const failed: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("requestfailed", (request) => {
    if (
      request.url().includes("/api/") &&
      !request.failure()?.errorText.includes("ERR_ABORTED")
    )
      failed.push(request.url());
  });
  await register(page.request, "partner");
  const name = `Roti CRUD ${Date.now()}`;
  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await page.goto("/partner/listings");
    await expect(
      page.getByText("Belum ada listing.", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Tambah listing", exact: true })
      .click();
    await openFormDetails(page);
    await fillListing(page, name);
    await page.getByLabel("Harga sekarang (Rp)").fill("20000");
    await page.getByRole("button", { name: "Tayangkan listing" }).click();
    await expect(page.locator("#listing-price-error")).toHaveText(
      "Harga sekarang harus lebih rendah dari harga normal.",
    );
    await page.getByLabel("Harga sekarang (Rp)").fill("8000");
    await page.getByRole("button", { name: "Tayangkan listing" }).click();
    await finishPublished(page);
    const item = (
      await (await page.request.get("/api/partner/listings")).json()
    )[0];
    await page.screenshot({ path: "/tmp/habisin-module3-desktop.png" });
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await expect(
      page.getByRole("button", { name: "Tambah listing", exact: true }),
    ).toBeFocused();
    expect(
      (await (await page.request.get("/api/listings")).json()).some(
        (row: { id: number }) => row.id === item.id,
      ),
    ).toBe(true);
    await page.goto("/partner/listings");
    await page
      .getByRole("button", { name: `Ubah ${name}`, exact: true })
      .click();
    await page.getByLabel("Nama makanan", { exact: true }).fill(`${name} Baru`);
    await page.getByLabel("Jumlah porsi", { exact: true }).fill("2");
    await page
      .getByRole("button", { name: "Simpan perubahan", exact: true })
      .click();
    const updatedName = `${name} Baru`;
    await expect(
      page.getByText("Perubahan listing berhasil disimpan."),
    ).toBeVisible();
    await page
      .getByRole("switch", { name: `Nonaktifkan ${updatedName}`, exact: true })
      .click();
    await page.getByRole("button", { name: "Batal" }).click();
    await expect(page.getByRole("switch")).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await page
      .getByRole("switch", { name: `Nonaktifkan ${updatedName}`, exact: true })
      .click();
    await page.getByRole("button", { name: "Ya, nonaktifkan" }).click();
    await expect(page.getByRole("switch")).toHaveAttribute(
      "aria-checked",
      "false",
    );
    expect(
      (await (await page.request.get("/api/listings")).json()).some(
        (row: { id: number }) => row.id === item.id,
      ),
    ).toBe(false);
    await page
      .getByRole("switch", { name: `Aktifkan ${updatedName}`, exact: true })
      .click();
    await expect(
      page
        .getByRole("status")
        .filter({ hasText: `${updatedName} ditayangkan.` }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: `Hapus ${updatedName}`, exact: true })
      .click();
    await page.getByRole("dialog").getByRole("checkbox").check();
    await page
      .getByRole("button", { name: "Hapus permanen", exact: true })
      .click();
    await expect(
      page.getByText("Belum ada listing.", { exact: true }),
    ).toBeVisible();
    expect(errors).toEqual([]);
    expect(failed).toEqual([]);
  } finally {
    await cleanup(page.request);
  }
});

test("mobile inventory handles loading, server failure, retry, and a free listing", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await register(page.request, "partner");
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/partner/listings", async (route) => {
    await gate;
    await route.fulfill({
      status: 503,
      json: { detail: "Inventaris sementara tidak tersedia." },
    });
  });
  try {
    await page.goto("/");
    await page.goto("/partner/listings");
    await expect(page.getByText("Memuat listing…")).toBeVisible();
    release();
    await expect(
      page
        .getByRole("alert")
        .filter({ hasText: "Inventaris sementara tidak tersedia." }),
    ).toContainText("Inventaris sementara tidak tersedia.");
    await page.unroute("**/api/partner/listings");
    await page
      .getByRole("button", { name: "Coba lagi listing", exact: true })
      .click();
    await expect(
      page.getByText("Belum ada listing.", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Tambah listing", exact: true })
      .click();
    await openFormDetails(page);
    const name = `Donasi ${Date.now()}`;
    await fillListing(page, name, true);
    await expect(page.getByLabel("Harga sekarang (Rp)")).toHaveCount(0);
    await page.screenshot({ path: "/tmp/habisin-module3-mobile-form.png" });
    await page.getByRole("button", { name: "Tayangkan listing" }).click();
    await finishPublished(page);
    await expect(
      page.getByRole("cell").filter({ hasText: "Gratis" }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    expect(
      await page
        .locator("main")
        .evaluate((main) => main.scrollWidth <= main.clientWidth),
    ).toBe(true);
    await page.screenshot({ path: "/tmp/habisin-module3-mobile.png" });
  } finally {
    release();
    await page.unroute("**/api/partner/listings");
    await cleanup(page.request);
  }
});

test("reserved listing fields and delete are locked, remaining stock and deactivate still work", async ({
  page,
  request,
}) => {
  const stores = await register(page.request, "partner", 1);
  const item = await (
    await mutate(page.request, "partner/listings", {
      ...listing(`Reserved ${Date.now()}`),
      store_id: stores[0].id,
    })
  ).json();
  await register(request, "buyer");
  const order = await (
    await mutate(request, "reservations", { listing_id: item.id, quantity: 1 })
  ).json();
  await page.goto("/partner/listings");
  await page
    .getByRole("button", { name: `Hapus ${item.name}`, exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("checkbox").check();
  await expect(
    dialog.getByRole("button", { name: "Hapus permanen", exact: true }),
  ).toBeDisabled();
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: `Ubah ${item.name}`, exact: true })
    .click();
  await expect(page.getByLabel("Harga sekarang (Rp)")).toBeDisabled();
  await expect(page.getByLabel("Toko penjual", { exact: true })).toBeDisabled();
  await page.getByLabel("Jumlah porsi", { exact: true }).fill("2");
  await page
    .getByRole("button", { name: "Simpan perubahan", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("switch").click();
  await page.getByRole("button", { name: "Ya, nonaktifkan" }).click();
  await expect(page.getByRole("switch")).toHaveAttribute(
    "aria-checked",
    "false",
  );
  expect(
    (
      await mutate(
        page.request,
        `partner/listings/${item.id}`,
        { price: 5000 },
        "PATCH",
      )
    ).status(),
  ).toBe(400);
  await mutate(request, `reservations/${order.id}/cancel`);
  await cleanup(request);
  await cleanup(page.request);
});

test("store selection is explicit and pickup location follows the selected branch", async ({
  page,
}) => {
  const stores = await register(page.request, "partner");
  try {
    await page.goto("/");
    await page.goto("/partner/listings");
    await page
      .getByRole("button", { name: "Tambah listing", exact: true })
      .click();
    await openFormDetails(page);
    const select = page.getByLabel("Toko penjual", { exact: true });
    await expect(select).toHaveValue("");
    await fillListing(page, `Cabang ${Date.now()}`);
    await select.selectOption(String(stores[1].id));
    await expect(page.getByLabel("Lokasi pengambilan dari toko")).toContainText(
      "Jalan Pondok Cina 22",
    );
    await expect(
      page.getByLabel("Alamat pengambilan", { exact: true }),
    ).toHaveCount(0);
    await page.getByRole("button", { name: "Tayangkan listing" }).click();
    await finishPublished(page);
    const saved = (
      await (await page.request.get("/api/partner/listings")).json()
    )[0];
    expect(saved.store_id).toBe(stores[1].id);
    expect(saved.address).toBe(stores[1].address);
    expect(saved.latitude).toBe(stores[1].latitude);
  } finally {
    await cleanup(page.request);
  }
});

test("store loading failures, empty options, and retry preserve the listing draft", async ({
  page,
}) => {
  await register(page.request, "partner", 1);
  await page.route("**/api/partner/stores", (route) =>
    route.fulfill({
      status: 503,
      json: { detail: "Toko sementara tidak tersedia." },
    }),
  );
  try {
    await page.goto("/");
    await page.goto("/partner/listings");
    await page
      .getByRole("button", { name: "Tambah listing", exact: true })
      .click();
    await openFormDetails(page);
    await page
      .getByLabel("Nama makanan", { exact: true })
      .fill("Draft tidak hilang");
    await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
      "Toko sementara tidak tersedia",
    );
    await page.unroute("**/api/partner/stores");
    await page.getByRole("button", { name: "Coba lagi", exact: true }).click();
    await expect(
      page.getByLabel("Toko penjual", { exact: true }),
    ).toBeEnabled();
    await expect(page.getByLabel("Toko penjual", { exact: true })).toHaveValue(
      "",
    );
    await expect(page.getByLabel("Nama makanan", { exact: true })).toHaveValue(
      "Draft tidak hilang",
    );
    await page.route("**/api/partner/stores", (route) =>
      route.fulfill({ json: { stores: [] } }),
    );
    await page
      .getByRole("button", { name: "Muat ulang toko", exact: true })
      .click();
    await expect(
      page.getByText(
        "Belum ada toko. Daftarkan toko terlebih dahulu untuk menayangkan listing.",
      ),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Daftarkan atau kelola toko (tab baru)" }),
    ).toHaveAttribute("target", "_blank");
    await expect(
      page.getByRole("button", { name: "Tayangkan listing" }),
    ).toBeDisabled();
    await expect(page.getByLabel("Nama makanan", { exact: true })).toHaveValue(
      "Draft tidak hilang",
    );
  } finally {
    await cleanup(page.request);
  }
});

for (const [fixture, mobile] of [
  ["landscape", false],
  ["portrait", true],
  ["orientation", false],
] as const) {
  test(`upload crop ${fixture} preserves photo, branch and reservations`, async ({
    page,
    request,
  }) => {
    const stores = await register(page.request, "partner");
    const name = `Crop ${fixture} ${Date.now()}`;
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    try {
      await page.setViewportSize(
        mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 },
      );
      await page.goto("/");
      await page.goto("/partner/listings");
      await page
        .getByRole("button", { name: "Tambah listing", exact: true })
        .click();
      await openFormDetails(page);
      await fillListing(page, name);
      await page
        .getByLabel("Toko penjual", { exact: true })
        .selectOption(String(stores[1].id));
      await page
        .getByRole("radio", { name: "Upload foto", exact: true })
        .check();
      await page.getByRole("button", { name: "Tayangkan listing" }).click();
      await expect(page.locator("#listing-image-error")).toContainText(
        "Pilih dan crop",
      );
      const fileInput = page.getByLabel("Pilih file foto", { exact: true });
      await fileInput.setInputFiles(`tests/fixtures/${fixture}.jpg`);
      await expect(
        page.getByRole("region", { name: "Editor crop foto" }),
      ).toBeVisible();
      await page.getByRole("slider", { name: /Zoom foto/ }).fill("1.2");
      const crop = page.locator(".reactEasyCrop_Container");
      await crop.locator('[tabindex="0"]').focus();
      await page.keyboard.press("ArrowLeft");
      await page.keyboard.press("ArrowUp");
      await page.getByRole("button", { name: "Putar 90°" }).click();
      await page.getByRole("button", { name: "Reset crop" }).click();
      if (mobile) {
        const box = (await crop.boundingBox())!;
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await page.mouse.move(
          box.x + box.width / 2 + 25,
          box.y + box.height / 2 + 15,
        );
        await page.mouse.up();
      }
      await page.screenshot({ path: `/tmp/habisin-crop-${fixture}.png` });
      await page
        .getByRole("button", { name: "Gunakan foto", exact: true })
        .click();
      await expect(
        page.getByRole("img", { name: "Preview foto listing 4:3" }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Crop ulang" }),
      ).toBeFocused();
      await page.getByRole("button", { name: "Crop ulang" }).click();
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toBeVisible();
      await expect(
        page.getByRole("region", { name: "Editor crop foto" }),
      ).toHaveCount(0);
      const pending = page.waitForRequest(
        (req) =>
          req.method() === "POST" &&
          req.url().endsWith("/api/partner/listings"),
      );
      await page.getByRole("button", { name: "Tayangkan listing" }).click();
      const submitted = await pending;
      expect(submitted.headers()["content-type"]).toContain(
        "multipart/form-data",
      );
      expect(submitted.postDataBuffer()?.toString()).not.toContain(image);
      await finishPublished(page);
      let item = (
        await (await page.request.get("/api/partner/listings")).json()
      )[0];
      expect(item.image_source).toBe("upload");
      expect(item.store_id).toBe(stores[1].id);
      expect(item.address).toBe(stores[1].address);
      const media = await page.request.get(item.image);
      expect(media.status()).toBe(200);
      expect(media.headers()["content-type"]).toContain("image/jpeg");
      const dimensions = await page.evaluate(async (url) => {
        const im = new Image();
        im.src = url;
        await im.decode();
        return [im.naturalWidth, im.naturalHeight];
      }, item.image);
      expect(dimensions[0] * 3).toBe(dimensions[1] * 4);
      expect(dimensions[0]).toBeGreaterThanOrEqual(400);
      expect(dimensions[0]).toBeLessThanOrEqual(1600);
      const savedImage = item.image;
      await page
        .getByRole("button", { name: `Ubah ${name}`, exact: true })
        .click();
      await page.getByLabel("Pilih file foto").setInputFiles({
        name: "fake.heic",
        mimeType: "image/heic",
        buffer: Buffer.from("invalid"),
      });
      await expect(page.locator("#listing-image-error")).toContainText("HEIC");
      await page
        .getByLabel("Nama makanan", { exact: true })
        .fill(`${name} Baru`);
      await page
        .getByRole("button", { name: "Simpan perubahan", exact: true })
        .click();
      await expect(
        page.getByText("Perubahan listing berhasil disimpan."),
      ).toBeVisible();
      item = (
        await (await page.request.get("/api/partner/listings")).json()
      )[0];
      expect(item.image).toBe(savedImage);
      // Partner landing is operational; inspect the public detail through its deep link.
      await page.goto(`/?listing=${item.id}`);
      await expect(
        page
          .getByRole("region", { name: "Detail makanan", exact: true })
          .getByRole("img", { name: `${name} Baru`, exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("region", { name: "Detail makanan", exact: true }),
      ).toContainText(stores[1].address);
      await page.keyboard.press("Escape");
      await register(request, "buyer");
      const booked = await mutate(request, "reservations", {
        listing_id: item.id,
        quantity: 1,
      });
      expect(booked.status()).toBe(201);
      expect(
        (
          await mutate(
            page.request,
            `partner/listings/${item.id}`,
            { store_id: stores[0].id },
            "PATCH",
          )
        ).status(),
      ).toBe(409);
      expect(
        (
          await mutate(
            page.request,
            `partner/stores/${stores[1].id}`,
            { name: "Lokasi tetap" },
            "PATCH",
          )
        ).status(),
      ).toBe(409);
      expect(
        (await (await page.request.get("/api/partner/listings")).json())[0]
          .stock,
      ).toBe(3);
      expect(
        (
          await mutate(
            page.request,
            `partner/listings/${item.id}`,
            { active: false },
            "PATCH",
          )
        ).status(),
      ).toBe(200);
      expect(
        (await (await request.get("/api/listings")).json()).some(
          (row: { id: number }) => row.id === item.id,
        ),
      ).toBe(false);
      const reservation = await booked.json();
      expect(
        (
          await mutate(request, `reservations/${reservation.id}/cancel`)
        ).status(),
      ).toBe(200);
      await page.screenshot({ path: `/tmp/habisin-upload-${fixture}.png` });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      expect(errors).toEqual([]);
    } finally {
      await mutate(request, "auth/me", { password }, "DELETE");
      await cleanup(page.request);
    }
  });
}

test("crop cancel, upload retry and URL replacement keep drafts intact", async ({
  page,
}) => {
  await register(page.request, "partner");
  try {
    await page.goto("/");
    await page.goto("/partner/listings");
    await page
      .getByRole("button", { name: "Tambah listing", exact: true })
      .click();
    await openFormDetails(page);
    const name = `Retry upload ${Date.now()}`;
    await fillListing(page, name);
    await page.getByRole("radio", { name: "Upload foto", exact: true }).check();
    await page
      .getByLabel("Pilih file foto")
      .setInputFiles("tests/fixtures/landscape.jpg");
    await page.getByRole("button", { name: "Batal crop" }).click();
    await expect(
      page.getByRole("button", { name: "Tambahkan foto makanan", exact: true }),
    ).toBeFocused();
    await page.getByRole("button", { name: "Crop ulang" }).click();
    await page
      .getByRole("button", { name: "Gunakan foto", exact: true })
      .click();
    await page.route("**/api/partner/listings", (route) =>
      route.request().method() === "POST"
        ? route.fulfill({
            status: 503,
            json: { detail: "Storage sementara gagal." },
          })
        : route.continue(),
    );
    await page.getByRole("button", { name: "Tayangkan listing" }).click();
    await expect(
      page.getByRole("dialog").getByRole("alert").first(),
    ).toContainText("Storage sementara gagal.");
    await expect(page.getByLabel("Nama makanan", { exact: true })).toHaveValue(
      name,
    );
    await page.unroute("**/api/partner/listings");
    await page.getByRole("button", { name: "Tayangkan listing" }).click();
    await finishPublished(page);
    const old = (
      await (await page.request.get("/api/partner/listings")).json()
    )[0];
    await page
      .getByRole("button", { name: `Ubah ${name}`, exact: true })
      .click();
    await page.getByRole("radio", { name: "Gunakan URL" }).check();
    await page.getByLabel("URL foto makanan").fill(image);
    await page
      .getByRole("button", { name: "Simpan perubahan", exact: true })
      .click();
    await expect(
      page.getByText("Perubahan listing berhasil disimpan."),
    ).toBeVisible();
    const item = (
      await (await page.request.get("/api/partner/listings")).json()
    )[0];
    expect(item.image_source).toBe("url");
    expect(item.image).toBe(image);
    expect((await page.request.get(old.image)).status()).toBe(404);
  } finally {
    await cleanup(page.request);
  }
});

test("photo source checks reject animation, oversize and undersized crops before upload", async ({
  page,
}) => {
  await register(page.request, "partner", 1);
  try {
    await page.goto("/");
    await page.goto("/partner/listings");
    await page
      .getByRole("button", { name: "Tambah listing", exact: true })
      .click();
    await openFormDetails(page);
    const file = page.getByLabel("Pilih file foto");
    for (const [name, buffer, message] of [
      [
        "fake.svg",
        Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
        "HEIC",
      ],
      ["large.jpg", Buffer.alloc(10 * 1024 * 1024 + 1), "10 MiB"],
      [
        "animated.webp",
        Buffer.concat([Buffer.from("RIFFxxxxWEBPANIM"), Buffer.alloc(8)]),
        "animasi",
      ],
    ] as const) {
      await file.setInputFiles({ name, mimeType: "image/jpeg", buffer });
      await expect(page.locator("#listing-image-error")).toContainText(message);
    }
    const small = await page.evaluate(async () => {
      const c = document.createElement("canvas");
      c.width = 200;
      c.height = 150;
      return c.toDataURL("image/png").split(",")[1];
    });
    await file.setInputFiles({
      name: "small.png",
      mimeType: "image/png",
      buffer: Buffer.from(small, "base64"),
    });
    await page
      .getByRole("button", { name: "Gunakan foto", exact: true })
      .click();
    await expect(
      page.getByRole("region", { name: "Editor crop foto" }).getByRole("alert"),
    ).toContainText("terlalu kecil");
    await page.getByRole("button", { name: "Batal crop" }).click();
    await file.setInputFiles("tests/fixtures/landscape.jpg");
    await expect(
      page.getByRole("region", { name: "Editor crop foto" }),
    ).toBeVisible();
    const cdp = await page.context().newCDPSession(page);
    const box = (await page.locator(".reactEasyCrop_Container").boundingBox())!;
    const x = box.x + box.width / 2,
      y = box.y + box.height / 2;
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [
        { x: x - 30, y, id: 0 },
        { x: x + 30, y, id: 1 },
      ],
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [
        { x: x - 50, y, id: 0 },
        { x: x + 50, y, id: 1 },
      ],
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await expect(
      page.getByRole("slider", { name: /Zoom foto/ }),
    ).not.toHaveValue("1");
    await page.getByRole("button", { name: "Batal crop" }).click();
  } finally {
    await cleanup(page.request);
  }
});
