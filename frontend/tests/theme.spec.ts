import { expect, test } from "./fixtures";
import type { Page } from "@playwright/test";

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
  const logo = page.getByRole("banner").getByRole("img", { name: "habisin" });
  await expect(logo).toHaveAttribute("src", /logo-dark/);
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

// WCAG AA: 4.5:1 for normal text, 3:1 for large text (24px, or 18.66px bold).
async function lowContrastText(page: Page) {
  return page.evaluate(() => {
    const parse = (value: string) => {
      const [r, g, b, a = 1] = (value.match(/[\d.]+/g) ?? []).map(Number);
      return { r, g, b, a };
    };
    const over = (
      top: { r: number; g: number; b: number; a: number },
      under: { r: number; g: number; b: number },
    ) => ({
      r: top.r * top.a + under.r * (1 - top.a),
      g: top.g * top.a + under.g * (1 - top.a),
      b: top.b * top.a + under.b * (1 - top.a),
    });
    const luminance = ({ r, g, b }: { r: number; g: number; b: number }) => {
      const [R, G, B] = [r, g, b].map((v) => {
        const c = v / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * R + 0.7152 * G + 0.0722 * B;
    };
    // Composite every background from the root down; give up over images.
    const background = (element: Element) => {
      const layers: { r: number; g: number; b: number; a: number }[] = [];
      for (
        let node: Element | null = element;
        node;
        node = node.parentElement
      ) {
        const style = getComputedStyle(node);
        if (style.backgroundImage !== "none") return null;
        const color = parse(style.backgroundColor);
        if (color.a > 0) layers.push(color);
        if (color.a === 1) break;
      }
      return layers
        .reverse()
        .reduce((under, layer) => over(layer, under), {
          r: 255,
          g: 255,
          b: 255,
        });
    };
    const failures: string[] = [];
    for (const element of document.querySelectorAll("body *")) {
      const text = [...element.childNodes]
        .filter((node) => node.nodeType === Node.TEXT_NODE)
        .map((node) => node.textContent?.trim())
        .join("");
      if (
        !text ||
        element.closest("[aria-hidden=true], [disabled], .leaflet-container")
      )
        continue;
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      if (!rect.width || !rect.height || style.visibility === "hidden")
        continue;
      const back = background(element);
      if (!back) continue;
      let opacity = 1;
      for (let node: Element | null = element; node; node = node.parentElement)
        opacity *= Number(getComputedStyle(node).opacity);
      const color = parse(style.color);
      const front = over({ ...color, a: color.a * opacity }, back);
      const [light, dark] = [luminance(front), luminance(back)].sort(
        (a, b) => b - a,
      );
      const ratio = (light + 0.05) / (dark + 0.05);
      const size = parseFloat(style.fontSize);
      const large =
        size >= 24 || (size >= 18.66 && Number(style.fontWeight) >= 700);
      if (ratio < (large ? 3 : 4.5))
        failures.push(`${ratio.toFixed(2)} "${text.slice(0, 40)}"`);
    }
    return failures;
  });
}

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
