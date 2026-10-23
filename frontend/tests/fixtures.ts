import { test as base } from "@playwright/test";

// Keep layout and map interaction tests independent of public image/tile servers.
export const test = base.extend<{ publicImages: void }>({
  publicImages: [
    async ({ page }, use) => {
      const image = {
        contentType: "image/svg+xml",
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#e9efdf"/></svg>',
      };
      await page.route("https://images.unsplash.com/**", (route) =>
        route.fulfill(image),
      );
      await page.route("https://tile.openstreetmap.org/**", (route) =>
        route.fulfill(image),
      );
      await use();
    },
    { auto: true },
  ],
});
export { expect } from "@playwright/test";
