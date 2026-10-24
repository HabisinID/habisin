import { type Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import {
  register,
  cleanup,
  mutate,
  listing,
  image,
  password,
} from "./backend-fixtures";

async function open(page: Page, mobile = false) {
  await page.setViewportSize({
    width: mobile ? 390 : 1440,
    height: mobile ? 844 : 900,
  });
  await page.goto("/");
  await page
    .getByRole("button", {
      name: "Listing",
      exact: true,
    })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Tambah listing", exact: true })
    .click();
}
async function details(page: Page) {
  const panel = page.locator("details").filter({
    has: page
      .locator("summary")
      .filter({ hasText: "Detail toko & informasi makanan" }),
  });
  if (!(await panel.evaluate((el) => (el as HTMLDetailsElement).open)))
    await panel.locator("summary").click();
}
async function fill(page: Page, name: string) {
  await page.getByRole("radio", { name: "Gunakan URL" }).check();
  await page.getByLabel("URL foto makanan").fill(image);
  await page.getByLabel("Nama makanan", { exact: true }).fill(name);
  await page.getByLabel("Harga normal (Rp)").fill("20000");
  await page.getByLabel("Harga sekarang (Rp)").fill("8000");
  await page.getByLabel("Jumlah porsi", { exact: true }).fill("6");
  await page
    .getByLabel("Catatan untuk pembeli (opsional)")
    .fill("Bawa wadah sendiri");
  await details(page);
  await page
    .getByLabel("Toko penjual", { exact: true })
    .selectOption({ index: 1 });
  await page
    .getByLabel("Deskripsi makanan")
    .fill("Roti surplus dari dapur kami.");
  await page
    .getByLabel("Makanan dibuat (WIB)")
    .fill(
      new Date(Date.now() - 3600000)
        .toLocaleString("sv-SE", { timeZone: "Asia/Jakarta" })
        .replace(" ", "T")
        .slice(0, 16),
    );
}
async function upload(page: Page) {
  await page.getByRole("radio", { name: "Upload foto" }).check();
  await page
    .getByLabel("Pilih file foto")
    .setInputFiles("tests/fixtures/landscape.jpg");
  await page.getByRole("button", { name: "Gunakan foto" }).click();
  await expect(page.getByAltText("Preview foto listing 4:3")).toBeVisible();
}

test("desktop composer matches measured columns and publishes notes once", async ({
  page,
}) => {
  await register(page.request, "partner");
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    await open(page);
    expect(
      (
        await page
          .getByRole("complementary", { name: "Navigasi mitra" })
          .boundingBox()
      )?.width,
    ).toBe(248);
    const preview = page.getByRole("complementary", {
      name: "Pratinjau listing",
    });
    expect((await preview.boundingBox())?.width).toBe(400);
    const photo = page.getByRole("button", { name: "Tambahkan foto makanan" });
    expect((await photo.boundingBox())?.width).toBe(320);
    expect((await photo.boundingBox())?.height).toBe(240);
    expect(
      (await page.getByLabel("Nama makanan", { exact: true }).boundingBox())
        ?.height,
    ).toBe(48);
    await fill(page, "Roti Composer Desktop");
    await expect(preview.getByText("Hemat 60%", { exact: true })).toBeVisible();
    await expect(
      preview.getByText("Siap tayang", { exact: false }),
    ).toBeVisible();
    await page.screenshot({ path: "/tmp/habisin-composer-filled-desktop.png" });
    await page.getByRole("button", { name: "Tayangkan listing" }).click();
    await expect(page.getByText("Listing berhasil ditayangkan.")).toBeVisible();
    const rows = await (await page.request.get("/api/partner/listings")).json();
    expect(rows).toHaveLength(1);
    expect(rows[0].buyer_notes).toBe("Bawa wadah sendiri");
    await expect(
      page.getByRole("button", { name: "Tambah listing lain" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Lihat", exact: true }).click();
    await expect(
      page.getByText("Bawa wadah sendiri", { exact: true }),
    ).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    await cleanup(page.request);
  }
});

test("mobile composer validates strict prices and keeps donation prices and controls", async ({
  page,
}) => {
  await register(page.request, "partner");
  try {
    await open(page, true);
    await fill(page, "Roti Composer Mobile");
    await page.getByLabel("Gratis (donasi)").check();
    await expect(page.getByLabel("Harga sekarang (Rp)")).not.toBeVisible();
    await page.getByLabel("Gratis (donasi)").uncheck();
    await expect(page.getByLabel("Harga sekarang (Rp)")).toHaveValue("8000");
    await page.getByRole("button", { name: "Tambah porsi" }).click();
    await expect(page.getByLabel("Jumlah porsi", { exact: true })).toHaveValue(
      "7",
    );
    await page.getByRole("button", { name: "Kurangi porsi" }).click();
    await page.getByLabel("Harga sekarang (Rp)").fill("20000");
    await page.getByRole("button", { name: "Tayangkan listing" }).click();
    await expect(page.locator("#listing-price-error")).toHaveText(
      "Harga sekarang harus lebih rendah dari harga normal.",
    );
    await expect(page.getByLabel("Harga sekarang (Rp)")).toBeFocused();
    await page.getByLabel("Harga sekarang (Rp)").fill("8000");
    const cta = await page
      .getByRole("button", { name: "Tayangkan listing" })
      .boundingBox();
    expect(cta?.height).toBe(48);
    expect(cta!.y + cta!.height).toBe(828);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({ path: "/tmp/habisin-composer-filled-mobile.png" });
    await page.getByRole("button", { name: "Tayangkan listing" }).click();
    await expect(page.getByText("Listing berhasil ditayangkan.")).toBeVisible();
    expect(
      await (await page.request.get("/api/partner/listings")).json(),
    ).toHaveLength(1);
  } finally {
    await cleanup(page.request);
  }
});

test("cropped File draft restores after reload, publishes and copies without stale preparation", async ({
  page,
}) => {
  await register(page.request, "partner");
  try {
    await open(page, true);
    await fill(page, "Roti Draf Foto");
    await upload(page);
    await page
      .getByRole("button", { name: "Simpan draf", exact: true })
      .click();
    await expect(
      page.getByRole("status").filter({ hasText: "Draf tersimpan" }),
    ).toBeVisible();
    await open(page, true);
    await page.getByRole("button", { name: "Pulihkan draf" }).click();
    await expect(page.getByLabel("Nama makanan", { exact: true })).toHaveValue(
      "Roti Draf Foto",
    );
    await expect(page.getByAltText("Preview foto listing 4:3")).toBeVisible();
    await page.getByRole("button", { name: "Tayangkan listing" }).click();
    await expect(page.getByText("Listing berhasil ditayangkan.")).toBeVisible();
    const rows = await (await page.request.get("/api/partner/listings")).json();
    expect(rows).toHaveLength(1);
    expect(rows[0].image_source).toBe("upload");
    await page.getByRole("button", { name: "Tambah listing lain" }).click();
    await expect(
      page.getByRole("button", { name: "Pulihkan draf" }),
    ).toHaveCount(0);
    await page
      .getByRole("button", { name: /Salin dari listing kemarin/ })
      .click();
    await page
      .getByRole("button", { name: "Salin Roti Draf Foto", exact: true })
      .click();
    await expect(page.getByLabel("Nama makanan", { exact: true })).toHaveValue(
      "Roti Draf Foto",
    );
    await details(page);
    await expect(page.getByLabel("Makanan dibuat (WIB)")).toHaveValue("");
    await expect(page.getByAltText("Preview foto listing 4:3")).toBeVisible();
    expect(
      await (await page.request.get("/api/partner/listings")).json(),
    ).toHaveLength(1);
  } finally {
    await cleanup(page.request);
  }
});

test("copy sheet excludes foreign listings and clears a closed store", async ({
  page,
  playwright,
  baseURL,
}) => {
  const stores = await register(page.request, "partner");
  const other = await playwright.request.newContext({
    baseURL,
  });
  await register(other, "partner", 1);
  try {
    const own = await mutate(page.request, "partner/listings", {
      ...listing("Roti Saya"),
      store_id: stores[0].id,
      buyer_notes: "Tetap tersimpan",
    });
    expect(own.status()).toBe(201);
    const foreignStores = (
      await (await other.get("/api/partner/stores")).json()
    ).stores;
    expect(
      (
        await mutate(other, "partner/listings", {
          ...listing("Rahasia Toko Lain"),
          store_id: foreignStores[0].id,
        })
      ).status(),
    ).toBe(201);
    expect(
      (
        await mutate(
          page.request,
          `partner/stores/${stores[0].id}`,
          { is_open: false },
          "PATCH",
        )
      ).ok(),
    ).toBe(true);
    await open(page, true);
    await page
      .getByRole("button", { name: /Salin dari listing kemarin/ })
      .click();
    await expect(
      page.getByRole("button", { name: "Salin Rahasia Toko Lain" }),
    ).toHaveCount(0);
    await page
      .getByRole("button", { name: "Salin Roti Saya", exact: true })
      .click();
    await details(page);
    await expect(page.getByLabel("Toko penjual", { exact: true })).toHaveValue(
      "",
    );
    await expect(page.getByLabel("Makanan dibuat (WIB)")).toHaveValue("");
    expect(
      (await (await page.request.get("/api/partner/listings")).json())[0]
        .buyer_notes,
    ).toBe("Tetap tersimpan");
  } finally {
    await cleanup(page.request);
    await cleanup(other);
    await other.dispose();
  }
});

test("blocked local draft storage reports failure but keeps form and allows publication", async ({
  page,
}) => {
  await register(page.request, "partner");
  await page.addInitScript(() =>
    Object.defineProperty(window, "indexedDB", {
      value: {
        open: () => {
          throw new Error("Penyimpanan draf diblokir");
        },
      },
    }),
  );
  try {
    await open(page, true);
    await fill(page, "Roti Tanpa Draf");
    await page
      .getByRole("button", { name: "Simpan draf", exact: true })
      .click();
    await expect(page.getByText("Penyimpanan draf diblokir")).toBeVisible();
    await expect(page.getByLabel("Nama makanan", { exact: true })).toHaveValue(
      "Roti Tanpa Draf",
    );
    await page.getByRole("button", { name: "Tayangkan listing" }).click();
    await expect(page.getByText("Listing berhasil ditayangkan.")).toBeVisible();
    expect(
      await (await page.request.get("/api/partner/listings")).json(),
    ).toHaveLength(1);
    await expect(
      page.getByText(/Listing sudah tayang, tetapi draf lokal/),
    ).toBeVisible();
  } finally {
    await cleanup(page.request);
  }
});

test("local drafts are isolated between accounts on the same browser", async ({
  page,
}) => {
  await register(page.request, "partner");
  const first = await (await page.request.get("/api/auth/me")).json();
  try {
    await open(page, true);
    await page
      .getByLabel("Nama makanan", { exact: true })
      .fill("Draf Akun Pertama");
    await page
      .getByRole("button", { name: "Simpan draf", exact: true })
      .click();
    await expect(
      page.getByRole("status").filter({ hasText: "Draf tersimpan" }),
    ).toBeVisible();
    await mutate(page.request, "auth/logout");
    await register(page.request, "partner");
    await open(page, true);
    await expect(
      page.getByRole("button", { name: "Pulihkan draf" }),
    ).toHaveCount(0);
    await cleanup(page.request);
    expect(
      (
        await mutate(page.request, "auth/login", {
          username: first.username,
          password,
        })
      ).ok(),
    ).toBe(true);
    await open(page, true);
    await page.getByRole("button", { name: "Pulihkan draf" }).click();
    await expect(page.getByLabel("Nama makanan", { exact: true })).toHaveValue(
      "Draf Akun Pertama",
    );
  } finally {
    await cleanup(page.request);
  }
});
