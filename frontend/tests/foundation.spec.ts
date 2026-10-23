import { expect, test } from "./fixtures";
import type { Page } from "@playwright/test";

// Design tokens from design.pen ("Fondasi" frame).
const primary = "rgb(31, 77, 51)";
const paper = "rgb(246, 248, 243)";
const ink = "rgb(20, 48, 31)";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/**", (route) =>
    route.fulfill({ status: 503, json: { detail: "Offline preview" } }),
  );
});

async function signInAs(page: Page, role: "buyer" | "partner") {
  await page.route("**/api/auth/me", (route) =>
    route.fulfill({
      json: {
        id: 1,
        username: "tester",
        name: "Test User",
        email: "test@example.com",
        role,
      },
    }),
  );
}

async function expectSharedHeader(page: Page) {
  const header = page.getByRole("banner");
  const logo = header.getByRole("img", { name: "habisin" });
  await expect(logo).toBeVisible();
  expect(
    await logo.evaluate((img: HTMLImageElement) => img.naturalWidth),
  ).toBeGreaterThan(0);
  await expect(
    header.getByRole("link", { name: "Habisin beranda" }),
  ).toHaveAttribute("href", "/");
  return header;
}

test("design tokens, fonts, logo and header apply across pages", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const body = page.locator("body");
  await expect(body).toHaveCSS("background-color", paper);
  await expect(body).toHaveCSS("color", ink);
  await expect(body).toHaveCSS("font-family", /Plus[ _]Jakarta[ _]Sans/);
  expect(
    await page.evaluate(() =>
      getComputedStyle(document.body).getPropertyValue("--font-mono"),
    ),
  ).toMatch(/JetBrains[ _]Mono/);

  const header = await expectSharedHeader(page);
  await expect(
    header
      .getByRole("navigation", { name: "Navigasi utama" })
      .getByRole("link", { name: "Jelajahi" }),
  ).toHaveAttribute("aria-current", "page");
  await expect(
    header.getByRole("button", { name: "Daftar gratis", exact: true }),
  ).toHaveCSS("background-color", primary);

  await page.goto("/stores/1", { waitUntil: "domcontentloaded" });
  await expectSharedHeader(page);
  // A guest (403 from auth/me) sees the partner sign-in prompt.
  await page.route("**/api/auth/me", (route) =>
    route.fulfill({ status: 403, json: { detail: "Belum masuk." } }),
  );
  await page.goto("/partner/store", { waitUntil: "domcontentloaded" });
  await expectSharedHeader(page);
  const button = page.getByRole("button", { name: "Masuk sebagai mitra" });
  await expect(button).toHaveCSS("background-color", primary);
  await expect(button).toHaveCSS("border-radius", "12px");
  await expect(button).toHaveCSS("min-height", "48px");
});

test("header actions follow the signed-in role", async ({ page }) => {
  await signInAs(page, "buyer");
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const header = page.getByRole("banner");
  await expect(
    header.getByRole("button", { name: "T Test", exact: true }),
  ).toBeVisible();
  await expect(
    header
      .getByRole("navigation", { name: "Navigasi utama" })
      .getByRole("button", { name: "Pesanan" }),
  ).toBeVisible();
  await expect(header.getByRole("link", { name: "Toko saya" })).toHaveCount(0);

  await page.unroute("**/api/auth/me");
  await signInAs(page, "partner");
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(header.getByRole("link", { name: "Toko saya" })).toHaveAttribute(
    "href",
    "/partner/store",
  );
});
