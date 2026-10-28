import { expect, test } from "./fixtures";
import type { Page } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/**", (route) =>
    route.fulfill({ status: 503, json: { detail: "Offline preview" } }),
  );
  await page.route("**/api/auth/me", (route) =>
    route.fulfill({ status: 403, json: { detail: "Belum masuk." } }),
  );
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

// Offline pages are short, so add a long block after the header (as a long
// list would be) and scroll well past the top.
const scrollPastHeader = (page: Page) =>
  page.locator("header").first().evaluate((header) => {
    const filler = document.createElement("div");
    filler.style.height = "3000px";
    header.parentElement!.append(filler);
    // "instant": the app scrolls smoothly, which would still be moving here.
    window.scrollTo({ top: 1200, behavior: "instant" });
  });

// The TopNav stays at the top of the screen while the page scrolls, for every
// role and screen size, and nothing scrolls visibly through it.
for (const [who, paths] of [
  ["guest", ["/", "/jelajahi"]],
  ["buyer", ["/", "/pesanan"]],
  ["partner", ["/", "/partner/store"]],
] as const) {
  test(`the TopNav stays at the top while scrolling for ${who}`, async ({
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
        await scrollPastHeader(page);
        const header = page.locator("header").first();
        await expect(header, where).toBeInViewport();
        const top = await header.evaluate(
          (el) => el.getBoundingClientRect().top,
        );
        expect(Math.round(top), where).toBe(0);
        await expect(header, where).not.toHaveCSS(
          "background-color",
          "rgba(0, 0, 0, 0)",
        );
      }
    }
  });
}
