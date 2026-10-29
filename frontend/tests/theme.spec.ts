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
  // The header settles once the account check answers.
  await page.goto("/", { waitUntil: "networkidle" });
  const toggle = page
    .getByRole("banner")
    .getByRole("button", { name: /^Tema tampilan/ });
  await expect(toggle).toHaveAccessibleName("Tema tampilan: Sistem");
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

const signInAs = (page: Page, role: "buyer" | "partner") =>
  page.route("**/api/auth/me", (route) =>
    route.fulfill({
      json: {
        id: 1,
        username: "rani",
        name: "Rani Ayu",
        email: "rani@example.com",
        role,
      },
    }),
  );

// Where the switcher sits in the first header: distance to the right edge of
// the viewport, how far it is from the logo's row, header items on its right in
// the same row, and items it overlaps.
const switcherLayout = (page: Page) =>
  page
    .locator("header")
    .first()
    .evaluate((header) => {
      const toggle = header.querySelector("[data-theme-toggle]");
      if (!toggle) return null;
      const box = (el: Element) => el.getBoundingClientRect();
      const t = box(toggle);
      const label = (el: Element) =>
        el.getAttribute("aria-label") ||
        (el as HTMLElement).innerText?.trim().slice(0, 24) ||
        el.tagName;
      const others = [
        ...header.querySelectorAll("a, button, input, select"),
      ].filter((el) => {
        const r = box(el);
        return (
          el !== toggle &&
          r.width > 0 &&
          r.height > 0 &&
          getComputedStyle(el).visibility !== "hidden"
        );
      });
      const sameRow = (r: DOMRect) => r.top < t.bottom && r.bottom > t.top;
      const logo = header.querySelector('a[aria-label="Habisin beranda"]');
      const middle = (r: DOMRect) => r.top + r.height / 2;
      return {
        gapToRightEdge: Math.round(window.innerWidth - t.right),
        offLogoRow: logo
          ? Math.round(Math.abs(middle(t) - middle(box(logo))))
          : Math.round(Math.abs(middle(t) - middle(box(header)))),
        onItsRight: others
          .filter((el) => sameRow(box(el)) && box(el).left >= t.right - 1)
          .map(label),
        overlapping: others
          .filter((el) => {
            const r = box(el);
            return sameRow(r) && r.left < t.right && r.right > t.left;
          })
          .map(label),
      };
    });

// The switcher is always the top-right item of the header, for every role and
// screen size, and never collides with other header controls.
for (const [who, paths] of [
  ["guest", ["/", "/jelajahi"]],
  ["buyer", ["/", "/pesanan"]],
  ["partner", ["/", "/partner/store"]],
] as const) {
  test(`the theme switcher is the top-right header item for ${who}`, async ({
    page,
  }) => {
    if (who !== "guest") await signInAs(page, who);
    for (const [width, height] of [
      [1440, 900],
      [390, 844],
    ] as const) {
      await page.setViewportSize({ width, height });
      for (const path of paths) {
        await page.goto(path, { waitUntil: "networkidle" });
        const where = `${who} ${path} @${width}px`;
        await expect(
          page.locator("header").first().locator("[data-theme-toggle]"),
          where,
        ).toBeVisible();
        const layout = await switcherLayout(page);
        // Top right: on the logo's row, with nothing further right.
        expect(layout?.offLogoRow, where).toBeGreaterThanOrEqual(0);
        expect(layout?.offLogoRow, where).toBeLessThanOrEqual(12);
        expect(layout?.onItsRight, where).toEqual([]);
        expect(layout?.overlapping, where).toEqual([]);
        expect(layout?.gapToRightEdge, where).toBeGreaterThanOrEqual(0);
        expect(layout?.gapToRightEdge, where).toBeLessThanOrEqual(48);
      }
    }
  });
}

test("the theme switcher is a bordered circle, 44px on desktop and mobile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  // The header settles once the account check answers.
  await page.goto("/", { waitUntil: "networkidle" });
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
  expect(await toggle.boundingBox()).toMatchObject({ width: 44, height: 44 });
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
