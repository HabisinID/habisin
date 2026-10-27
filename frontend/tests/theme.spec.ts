import { expect, test } from "./fixtures";
import type { Page } from "@playwright/test";
import { lowContrastText } from "./contrast";

// Dark tokens from design.pen ("Fondasi" frame, mode: dark).
const darkPaper = "rgb(16, 38, 26)";
const darkInk = "rgb(238, 243, 236)";
const lightPaper = "rgb(246, 248, 243)";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/**", (route) =>
    route.fulfill({ status: 503, json: { detail: "Offline preview" } }),
  );
  // A guest on the partner page needs 403, not 503, to see its sign-in prompt.
  await page.route("**/api/auth/me", (route) =>
    route.fulfill({ status: 403, json: { detail: "Belum masuk." } }),
  );
});

const theme = (page: Page) =>
  page.evaluate(() => document.documentElement.dataset.theme);

test("the system dark preference applies before the page is interactive", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  expect(await theme(page)).toBe("dark");
  await expect(page.locator("body")).toHaveCSS("background-color", darkPaper);
  await expect(page.locator("body")).toHaveCSS("color", darkInk);
  // The wordmark is text, so it follows the theme's ink colour.
  const logo = page.getByRole("banner").getByRole("link", {
    name: "Habisin beranda",
  });
  await expect(logo).toHaveCSS("color", darkInk);
});

test("the theme switcher cycles Sistem, Terang, Gelap and remembers the choice", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const toggle = page
    .getByRole("banner")
    .getByRole("button", { name: /^Tema tampilan/ });
  await expect(toggle).toHaveAccessibleName("Tema tampilan: Sistem");
  await page.waitForLoadState("networkidle");
  await toggle.click();
  await expect(toggle).toHaveAccessibleName("Tema tampilan: Terang");
  expect(await theme(page)).toBe("light");
  await toggle.click();
  await expect(toggle).toHaveAccessibleName("Tema tampilan: Gelap");
  expect(await theme(page)).toBe("dark");
  await expect(page.locator("body")).toHaveCSS("background-color", darkPaper);

  await page.reload({ waitUntil: "domcontentloaded" });
  expect(await theme(page)).toBe("dark");
  await expect(toggle).toHaveAccessibleName("Tema tampilan: Gelap");
  await toggle.click();
  await expect(toggle).toHaveAccessibleName("Tema tampilan: Sistem");
  await expect(page.locator("body")).toHaveCSS("background-color", lightPaper);
});

// Accessible names of the header controls, left to right.
const headerControls = (page: Page) =>
  page
    .getByRole("banner")
    .locator("button:visible, a:visible")
    .evaluateAll((els) =>
      els.map(
        (el) =>
          el.getAttribute("aria-label") ||
          (el as HTMLElement).innerText.replace(/\s+/g, " ").trim(),
      ),
    );

// TopNav in design.pen: the theme switcher is a bordered circle right before
// the last header item (Daftar gratis for guests, the avatar once signed in).
test("the theme switcher sits right before Daftar gratis for guests", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const controls = await headerControls(page);
  expect(controls.slice(-3)).toEqual([
    "Masuk",
    "Tema tampilan: Sistem",
    "Daftar gratis",
  ]);
  const toggle = page
    .getByRole("banner")
    .getByRole("button", { name: /^Tema tampilan/ });
  expect(await toggle.boundingBox()).toMatchObject({ width: 44, height: 44 });
  await expect(toggle).toHaveCSS("border-top-width", "1px");
  // A circle: Tailwind's rounded-full computes to a huge px radius.
  const radius = await toggle.evaluate((el) =>
    parseFloat(getComputedStyle(el).borderTopLeftRadius),
  );
  expect(radius).toBeGreaterThanOrEqual(22);

  await page.setViewportSize({ width: 390, height: 844 });
  expect((await headerControls(page)).slice(-3)).toEqual([
    "Tema tampilan: Sistem",
    "Masuk",
    "Daftar gratis",
  ]);
  expect(await toggle.boundingBox()).toMatchObject({ width: 44, height: 44 });
});

test("the theme switcher sits right before the avatar once signed in", async ({
  page,
}) => {
  await page.route("**/api/auth/me", (route) =>
    route.fulfill({
      json: {
        id: 1,
        username: "rani",
        name: "Rani Ayu",
        email: "rani@example.com",
        role: "buyer",
      },
    }),
  );
  await page.setViewportSize({ width: 1440, height: 900 });
  for (const path of ["/", "/pesanan"]) {
    await page.goto(path, { waitUntil: "domcontentloaded" });
    const toggle = page
      .getByRole("banner")
      .getByRole("button", { name: /^Tema tampilan/ });
    // The avatar shows the initials ("R" or "RA") once /api/auth/me resolves.
    await expect
      .poll(
        () =>
          toggle.evaluate(
            (el) => el.nextElementSibling?.textContent?.trim() ?? "",
          ),
        { message: path },
      )
      .toMatch(/^R/);
  }
});

for (const mode of ["light", "dark"] as const) {
  test(`text meets WCAG AA contrast in the ${mode} theme`, async ({ page }) => {
    await page.addInitScript(
      (value) => localStorage.setItem("habisin-theme", value),
      mode,
    );
    for (const path of ["/", "/stores/1", "/partner/store", "/pesanan"]) {
      await page.goto(path, { waitUntil: "networkidle" });
      expect(await theme(page)).toBe(mode);
      expect(await lowContrastText(page), path).toEqual([]);
    }
  });
}
