import type { Page } from "@playwright/test";

// WCAG AA: 4.5:1 for normal text, 3:1 for large text (24px, or 18.66px bold).
export async function lowContrastText(page: Page) {
  return page.evaluate(() => {
    // rgb()/rgba() use 0–255; color(srgb …), e.g. from color-mix(), uses 0–1.
    const parse = (value: string) => {
      const [r, g, b, a = 1] = (value.match(/[\d.]+/g) ?? []).map(Number);
      const scale = value.startsWith("color(") ? 255 : 1;
      return { r: r * scale, g: g * scale, b: b * scale, a };
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
      return layers.reverse().reduce((under, layer) => over(layer, under), {
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
