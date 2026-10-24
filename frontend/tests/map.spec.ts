import { expect, test } from "./fixtures";
import type { Page } from "@playwright/test";
import { food } from "./discovery-data";
import type { Listing } from "../src/lib/api";
const pins = (page: Page) => page.locator(".leaflet-marker-icon.food-pin");
async function catalog(page: Page, items: Listing[]) {
  await page.route("**/api/auth/me", (r) =>
    r.fulfill({ status: 403, json: { detail: "Anonymous" } }),
  );
  await page.route("**/api/listings", (r) => r.fulfill({ json: items }));
  await page.goto("/jelajahi");
  await expect(page.locator(".food-card")).toHaveCount(items.length);
  await page.getByRole("button", { name: "Peta", exact: true }).click();
}

test("store popup identities, keyboard, filters and viewport survive repeated toggles", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await catalog(page, [
    food(301, 31),
    food(302, 31, { price: 0 }),
    food(303, 32),
  ]);
  await expect(pins(page)).toHaveCount(2);
  await expect(page.getByText(/^3 listing tersedia/)).toBeVisible();
  const canvas = page.locator(".map-canvas");
  const id = () =>
    canvas.evaluate(
      (el) => (el as HTMLElement & { _leaflet_id?: number })._leaflet_id,
    );
  const instance = await id();
  await pins(page).first().focus();
  await page.keyboard.press("Enter");
  const popup = page.getByRole("region", { name: /^Pilihan makanan/ });
  await expect(popup).toContainText("2 makanan cocok · Mulai Gratis");
  await expect(popup.getByRole("heading")).toBeFocused();
  await expect(popup.getByRole("button", { name: /Food 303/ })).toHaveCount(0);
  await expect(popup.locator("b")).toHaveCount(0);
  await expect(popup.getByRole("link", { name: "Lihat toko" })).toHaveAttribute(
    "href",
    "/stores/31",
  );
  await expect(popup.getByRole("link", { name: "Lihat toko" })).toHaveCSS(
    "color",
    "rgb(62, 107, 38)",
  );
  await popup.getByLabel("Toko lain di lokasi ini").selectOption("store:32");
  await expect(popup).toContainText("Food 303");
  await expect(popup.getByRole("link", { name: "Lihat toko" })).toHaveAttribute(
    "href",
    "/stores/32",
  );
  await page.keyboard.press("Escape");
  await expect(popup).toHaveCount(0);
  await expect(pins(page).nth(1)).toBeFocused();
  await page.keyboard.press("Space");
  await expect(popup).toContainText("Food 303");
  await popup.getByRole("button", { name: /Food 303/ }).click();
  await expect(
    page.getByRole("region", { name: "Detail makanan", exact: true }),
  ).toContainText("Food 303");
  await expect(
    page
      .getByRole("region", { name: "Detail makanan", exact: true })
      .getByRole("heading", { level: 1 }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(popup.getByRole("button", { name: /Food 303/ })).toBeFocused();
  await page.getByRole("button", { name: "Tutup popup toko" }).click();
  await page.getByRole("button", { name: "Zoom in" }).click();
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    box.x + box.width / 2 + 70,
    box.y + box.height / 2 + 30,
    { steps: 8 },
  );
  await page.mouse.up();
  const pane = page.locator(".map-canvas .leaflet-map-pane");
  await expect.poll(() => pane.getAttribute("style")).toContain("transform");
  const position = await pane.getAttribute("style");
  const query = page.getByRole("textbox", { name: "Cari makanan atau toko" });
  await query.fill("Food 301");
  await expect(pins(page)).toHaveCount(1);
  expect(await id()).toBe(instance);
  expect(await pane.getAttribute("style")).toBe(position);
  await pins(page).first().focus();
  await page.keyboard.press("Enter");
  await expect(popup).toContainText("1 makanan cocok");
  await query.fill("no matching food");
  await expect(pins(page)).toHaveCount(0);
  await expect(popup).toHaveCount(0);
  await expect(query).toBeFocused();
  await page.getByRole("button", { name: "Reset filter peta" }).click();
  await expect(pins(page)).toHaveCount(2);
  for (let i = 0; i < 3; i++) {
    await page.getByRole("button", { name: "Daftar", exact: true }).click();
    await page.getByRole("button", { name: "Peta", exact: true }).click();
  }
  expect(await id()).toBe(instance);
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await canvas.scrollIntoViewIfNeeded();
    await pins(page).first().focus();
    await page.keyboard.press("Enter");
    await expect(popup).toBeVisible();
    await expect
      .poll(async () => {
        const bounds = (await popup.boundingBox())!;
        return bounds.x >= 0 && bounds.x + bounds.width <= viewport.width;
      })
      .toBe(true);
    await expect(
      page.getByRole("link", { name: "OpenStreetMap", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Zoom in" })).toBeVisible();
    await expect(page.locator(".leaflet-popup")).toHaveCSS("opacity", "1");
    await popup.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: `/tmp/habisin-map-popup-${viewport.width}.png`,
    });
    await page.getByRole("button", { name: "Tutup popup toko" }).click();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  expect(errors).toEqual([]);
});

test("legacy, invalid coordinates, donations and favorites share the same results", async ({
  page,
}) => {
  await catalog(page, [
    food(301, 31),
    food(302, 31, { price: 0 }),
    food(303, null),
    food(304, null, { latitude: 99 }),
  ]);
  await expect(pins(page)).toHaveCount(2);
  await expect(
    page.getByText(
      "1 makanan belum memiliki koordinat valid dan tetap tersedia di daftar.",
    ),
  ).toBeVisible();
  await pins(page).nth(1).click();
  const popup = page.getByRole("region", { name: /^Pilihan makanan/ });
  await expect(popup.getByText("Profil toko belum terhubung.")).toBeVisible();
  await expect(popup.getByRole("link", { name: "Lihat toko" })).toHaveCount(0);
  await page.getByRole("button", { name: "Gratis", exact: true }).click();
  await expect(pins(page)).toHaveCount(1);
  await pins(page).first().click();
  await expect(popup).toContainText("1 makanan cocok · Mulai Gratis");
  await page.getByRole("button", { name: "Daftar", exact: true }).click();
  await expect(page.locator(".food-card")).toHaveCount(1);
  await page.getByRole("button", { name: "Gratis", exact: true }).click();
  await page
    .getByRole("button", { name: "Simpan Food 303 ke favorit" })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  expect(
    await page.evaluate(() => localStorage.getItem("habisin-saved")),
  ).toBeNull();
  await expect(page.locator(".food-card")).toHaveCount(4);
  await page.getByRole("button", { name: "Peta", exact: true }).click();
  await expect(pins(page)).toHaveCount(2);
});

for (const outcome of [
  "denied",
  "timeout",
  "invalid",
  "unsupported",
  "success-then-denied",
]) {
  test(`GPS ${outcome} preserves the correct search origin`, async ({
    page,
  }) => {
    await page.addInitScript((outcome) => {
      let count = 0;
      Object.defineProperty(navigator, "geolocation", {
        configurable: true,
        value:
          outcome === "unsupported"
            ? undefined
            : {
                getCurrentPosition(
                  success: PositionCallback,
                  failure: PositionErrorCallback,
                  options: PositionOptions,
                ) {
                  (window as Window & { gpsTimeout?: number }).gpsTimeout =
                    options.timeout;
                  count++;
                  if (outcome === "success-then-denied" && count === 1)
                    success({
                      coords: { latitude: -6.4, longitude: 106.8 },
                    } as GeolocationPosition);
                  else if (outcome === "invalid")
                    success({
                      coords: { latitude: NaN, longitude: 181 },
                    } as GeolocationPosition);
                  else
                    failure({
                      code: outcome === "timeout" ? 3 : 1,
                    } as GeolocationPositionError);
                },
              },
      });
    }, outcome);
    await catalog(page, [food(301, 31)]);
    const location = page.getByRole("button", { name: / · Ubah$/ });
    const popup = page.getByRole("region", { name: /^Pilihan makanan/ });
    await pins(page).first().click();
    await expect(popup).toContainText("0.0 km");
    await page
      .getByRole("button", {
        name: "Gunakan lokasi saya pada peta",
        exact: true,
      })
      .click();
    if (outcome === "success-then-denied") {
      await expect(location).toContainText("Lokasi kamu");
      await expect(popup).not.toContainText("0.0 km");
      const last = await popup.innerText();
      await page
        .getByRole("button", {
          name: "Gunakan lokasi saya pada peta",
          exact: true,
        })
        .click();
      await expect(
        page.getByText(/Lokasi valid terakhir tetap digunakan/),
      ).toBeVisible();
      await expect(location).toContainText("Lokasi kamu");
      expect(await popup.innerText()).toBe(last);
    } else {
      await expect(location).toContainText("Beji, Depok");
      await expect(
        page.getByText(/Pencarian tetap di Beji, Depok/),
      ).toBeVisible();
    }
    if (outcome !== "unsupported")
      expect(
        await page.evaluate(
          () => (window as Window & { gpsTimeout?: number }).gpsTimeout,
        ),
      ).toBe(10000);
    await expect(location).toBeEnabled();
  });
}

test("expiry and ordered refresh prevent stale results from being reserved", async ({
  page,
}) => {
  await page.clock.install();
  await catalog(page, [
    food(301, 31, { pickup_end: new Date(Date.now() + 5000).toISOString() }),
  ]);
  await pins(page).first().click();
  const popup = page.getByRole("region", { name: /^Pilihan makanan/ });
  await popup.getByRole("button", { name: /Food 301/ }).click();
  await page.clock.fastForward(6000);
  await expect(pins(page)).toHaveCount(0);
  await expect(
    page
      .getByRole("region", { name: "Detail makanan", exact: true })
      .getByText(/Makanan ini sudah tidak tersedia/),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Masuk untuk memesan" }),
  ).toBeDisabled();
  await page.clock.runFor(20);
  await page.keyboard.press("Escape");
  await page.route("**/api/listings", (r) =>
    r.fulfill({ json: [food(302, 32)] }),
  );
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(pins(page)).toHaveCount(1);
  await pins(page).first().click();
  await expect(popup).toContainText("Food 302");
  await page.route("**/api/listings", (r) =>
    r.fulfill({ status: 503, json: { detail: "Intended failure" } }),
  );
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByText(/Intended failure/)).toBeVisible();
  await popup.getByRole("button", { name: /Food 302/ }).click();
  await expect(
    page.getByRole("button", { name: "Masuk untuk memesan" }),
  ).toBeDisabled();
  await page.clock.runFor(20);
  await page.keyboard.press("Escape");
  await page.unroute("**/api/listings");
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let count = 0;
  await page.route("**/api/listings", async (r) => {
    count++;
    if (count === 1) {
      await gate;
      await r.fulfill({ json: [food(303, 33)] }).catch(() => {});
    } else await r.fulfill({ json: [food(304, 34)] });
  });
  await page.getByRole("button", { name: "Coba lagi katalog" }).click();
  await expect.poll(() => count).toBe(1);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect.poll(() => count).toBe(2);
  release();
  await expect(pins(page).first()).toHaveAttribute("title", /toko #34/);
  await expect(pins(page)).toHaveCount(1);
});

test("tile failure preserves attribution and choices with explicit retry", async ({
  page,
}) => {
  await page.route("https://tile.openstreetmap.org/**", (r) =>
    r.abort("failed"),
  );
  await catalog(page, [food(301, 31)]);
  await expect(page.getByText(/Gambar peta gagal dimuat/)).toBeVisible();
  await expect(
    page.getByRole("link", { name: "OpenStreetMap", exact: true }),
  ).toBeVisible();
  await pins(page).first().click();
  await expect(
    page.getByRole("region", { name: /^Pilihan makanan/ }),
  ).toContainText("Food 301");
  await page.getByRole("button", { name: "Daftar", exact: true }).click();
  await expect(page.locator(".food-card")).toHaveCount(1);
});

test("failed Leaflet import can retry without losing the list or duplicating instances", async ({
  page,
}) => {
  let blocked = true;
  await page.route("**/_next/static/chunks/*.js", async (route) => {
    const response = await route.fetch();
    const body = await response.text();
    if (blocked && body.includes("leaflet-pane")) await route.abort("failed");
    else await route.fulfill({ response });
  });
  await catalog(page, [food(301, 31)]);
  await expect(
    page.getByText(
      "Peta belum dapat dimuat. Makanan tetap tersedia melalui daftar.",
    ),
  ).toBeVisible();
  blocked = false;
  await page
    .getByRole("button", { name: "Coba lagi peta", exact: true })
    .click();
  await expect(pins(page)).toHaveCount(1);
  await page.getByRole("button", { name: "Daftar", exact: true }).click();
  await expect(page.locator(".food-card")).toHaveCount(1);
});

test("GPS is opt-in, reorders nearest foods and recenters only on location actions", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const state = window as Window & { gpsCalls?: number };
    state.gpsCalls = 0;
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition(success: PositionCallback) {
          state.gpsCalls!++;
          success({
            coords: { latitude: -6.4, longitude: 106.8 },
          } as GeolocationPosition);
        },
      },
    });
  });
  await page.route("**/api/auth/me", (r) =>
    r.fulfill({ status: 403, json: { detail: "Anonymous" } }),
  );
  await page.route("**/api/listings", (r) =>
    r.fulfill({
      json: [
        food(301, 31),
        food(302, 32, { latitude: -6.4, longitude: 106.8 }),
      ],
    }),
  );
  await page.goto("/jelajahi");
  await page.getByLabel("Urutkan makanan").selectOption("near");
  await expect(page.locator(".card-title").first()).toHaveText("Food 301");
  expect(
    await page.evaluate(
      () => (window as Window & { gpsCalls?: number }).gpsCalls,
    ),
  ).toBe(0);
  await page.getByRole("button", { name: "Peta", exact: true }).click();
  await expect(pins(page)).toHaveCount(2);
  await page
    .getByRole("button", { name: "Gunakan lokasi saya pada peta", exact: true })
    .click();
  const canvas = page.locator(".map-canvas");
  await expect
    .poll(async () => {
      const area = (await canvas.boundingBox())!;
      const dot = (await page
        .locator(".leaflet-overlay-pane path")
        .boundingBox())!;
      return (
        Math.abs(dot.x + dot.width / 2 - (area.x + area.width / 2)) +
        Math.abs(dot.y + dot.height / 2 - (area.y + area.height / 2))
      );
    })
    .toBeLessThan(6);
  await page.getByRole("button", { name: "Daftar", exact: true }).click();
  await expect(page.locator(".card-title").first()).toHaveText("Food 302");
});
