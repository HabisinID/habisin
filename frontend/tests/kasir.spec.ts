import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QRCodeSVG } from "qrcode.react";
import type { APIRequestContext, Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import {
  cleanup,
  listing,
  mutate,
  register,
  password,
} from "./backend-fixtures";

// Modul 8: the HTMX cashier page served by Django through the /api proxy.
// Needs both servers, like role-workspaces.spec.ts.

// A partner with one store and listing, and a buyer's paid order for it.
async function paidOrder(partner: APIRequestContext, buyer: APIRequestContext) {
  const stores = await register(partner, "partner", 1);
  await register(buyer, "buyer");
  const item = await (
    await mutate(partner, "partner/listings", {
      ...listing("Kasir Roti"),
      store_id: stores[0].id,
    })
  ).json();
  const order = await (
    await mutate(buyer, "reservations", { listing_id: item.id, quantity: 2 })
  ).json();
  expect((await mutate(buyer, `reservations/${order.id}/pay`)).status()).toBe(
    200,
  );
  return order as { id: number; code: string };
}

// afterEach has its own timeout, so a failed test still removes its accounts.
// The buyer goes first, taking their orders, so the partner's listing can go.
test.afterEach(async ({ page, request }) => {
  await cleanup(request);
  await cleanup(page.request);
});

test("the cashier types a code, hands the order over and sees it used after", async ({
  page,
  request,
}) => {
  const order = await paidOrder(page.request, request);
  await page.goto("/");
  await page.getByRole("link", { name: /Verifikasi kode/ }).click();
  await expect(page).toHaveURL(/\/api\/partner\/kasir$/);
  await page.getByLabel("Karakter 1").click();
  await page.keyboard.type(order.code.toLowerCase());
  await expect(page.getByText("Kode cocok")).toBeVisible();
  await expect(page.getByText("Kasir Roti × 2")).toBeVisible();
  // HTMX settles new controls after swapping the visible response.
  await expect(page.locator("#result")).not.toHaveClass(/htmx-settling/);
  await page.keyboard.press("Enter");
  await expect(page.getByText(/^Diserahkan pukul/)).toBeVisible();
  await expect(
    page.getByRole("complementary").getByText("Diambil"),
  ).toBeVisible();
  await page.keyboard.type(order.code);
  await expect(page.getByText(/^Sudah dipakai pukul/)).toBeVisible();
  const after = await (
    await request.get(`/api/reservations/${order.id}`)
  ).json();
  expect(after.status).toBe("picked_up");
});

test("Enter on Kode lain clears the code instead of handing the order over", async ({
  page,
  request,
}) => {
  const order = await paidOrder(page.request, request);
  await page.goto("/api/partner/kasir");
  await page.getByLabel("Karakter 1").click();
  await page.keyboard.type(order.code);
  await expect(page.getByText("Kode cocok")).toBeVisible();
  await page.getByRole("button", { name: "Kode lain" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText(/^Menunggu kode/)).toBeVisible();
  const after = await (
    await request.get(`/api/reservations/${order.id}`)
  ).json();
  expect(after.status).toBe("paid");
});

// Feeds the camera a canvas with the ticket's QR. BarcodeDetector is removed so
// the jsQR fallback runs, as on Chrome for Windows.
async function fakeCamera(page: Page, code: string | null) {
  // An <img> only decodes SVG that declares its namespace.
  const svg = code
    ? renderToStaticMarkup(
        createElement(QRCodeSVG, {
          value: code,
          size: 240,
          marginSize: 2,
          xmlns: "http://www.w3.org/2000/svg",
        }),
      )
    : null;
  await page.addInitScript((svg) => {
    delete (window as { BarcodeDetector?: unknown }).BarcodeDetector;
    navigator.mediaDevices.getUserMedia = async () => {
      if (!svg) throw new DOMException("denied", "NotAllowedError");
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 320;
      const context = canvas.getContext("2d")!;
      const image = new Image();
      image.src = `data:image/svg+xml,${encodeURIComponent(svg)}`;
      await image.decode();
      const draw = () => {
        context.fillStyle = "#fff";
        context.fillRect(0, 0, 320, 320);
        context.drawImage(image, 40, 40, 240, 240);
      };
      draw();
      setInterval(draw, 100);
      return canvas.captureStream(10);
    };
  }, svg);
}

test("Pindai QR reads the ticket's QR with the laptop camera", async ({
  page,
  request,
}) => {
  const order = await paidOrder(page.request, request);
  // htmx and jsQR come from the app itself, so a demo without a CDN still works.
  await page.route("https://unpkg.com/**", (route) => route.abort());
  await fakeCamera(page, order.code);
  await page.goto("/api/partner/kasir");
  await page.getByRole("button", { name: "Pindai QR" }).click();
  await expect(page.getByText("Kode cocok")).toBeVisible();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByLabel("Karakter 5")).not.toHaveValue("");
});

test("a blocked camera explains how to continue by typing", async ({
  page,
}) => {
  await register(page.request, "partner", 0);
  await fakeCamera(page, null);
  await page.goto("/api/partner/kasir");
  await page.getByRole("button", { name: "Pindai QR" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText(/Kamera tidak bisa dibuka/)).toBeVisible();
  await dialog.getByRole("button", { name: "Tutup" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByLabel("Karakter 1")).toBeFocused();
});

test("closing the scanner while the camera is still opening turns it off", async ({
  page,
}) => {
  await register(page.request, "partner", 0);
  // A camera that takes a while to open, like one behind a permission prompt.
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      await new Promise((resolve) => setTimeout(resolve, 800));
      const stream = document.createElement("canvas").captureStream();
      (window as { camera?: MediaStream }).camera = stream;
      return stream;
    };
  });
  await page.goto("/api/partner/kasir");
  await page.getByRole("button", { name: "Pindai QR" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Tutup" }).click();
  await page.waitForFunction(() => (window as { camera?: MediaStream }).camera);
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as { camera?: MediaStream })
          .camera!.getTracks()
          .every((track) => track.readyState === "ended"),
      ),
    )
    .toBe(true);
});

test("reopening the scanner before the first camera arrives leaves no camera on", async ({
  page,
}) => {
  await register(page.request, "partner", 0);
  // The first camera is slow (permission prompt), the second one is quick.
  await page.addInitScript(() => {
    const cameras: MediaStream[] = [];
    (window as { cameras?: MediaStream[] }).cameras = cameras;
    let calls = 0;
    navigator.mediaDevices.getUserMedia = async () => {
      const wait = ++calls === 1 ? 800 : 100;
      await new Promise((resolve) => setTimeout(resolve, wait));
      const stream = document.createElement("canvas").captureStream();
      cameras.push(stream);
      return stream;
    };
  });
  await page.goto("/api/partner/kasir");
  const open = page.getByRole("button", { name: "Pindai QR" });
  const close = page.getByRole("dialog").getByRole("button", { name: "Tutup" });
  await open.click();
  await close.click();
  await open.click();
  await page.waitForFunction(
    () => (window as { cameras?: MediaStream[] }).cameras!.length === 2,
  );
  await close.click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as { cameras?: MediaStream[] })
          .cameras!.flatMap((stream) => stream.getTracks())
          .every((track) => track.readyState === "ended"),
      ),
    )
    .toBe(true);
});

test("the theme switcher is the top-right item of the cashier page at every width", async ({
  page,
}) => {
  await register(page.request, "partner", 0);
  await page.goto("/api/partner/kasir");
  for (const width of [390, 760, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const layout = await page.evaluate(() => {
      const visible = (el: Element) => {
        const box = el.getBoundingClientRect();
        return box.width > 0 && getComputedStyle(el).display !== "none";
      };
      const toggles = [
        ...document.querySelectorAll("[data-theme-toggle]"),
      ].filter(visible);
      const toggle = toggles[0].getBoundingClientRect();
      const sameRow = (box: DOMRect) =>
        box.top < toggle.bottom && box.bottom > toggle.top;
      const onItsRight = [...document.querySelectorAll("a, button, input")]
        .filter((el) => visible(el) && !el.hasAttribute("data-theme-toggle"))
        .map((el) => el.getBoundingClientRect())
        .filter((box) => sameRow(box) && box.left >= toggle.right - 1);
      return {
        toggles: toggles.length,
        top: toggle.top,
        onItsRight: onItsRight.length,
      };
    });
    expect(layout, `@${width}px`).toEqual({
      toggles: 1,
      top: layout.top,
      onItsRight: 0,
    });
    expect(layout.top, `@${width}px`).toBeLessThan(40);
  }
});

test("a QR read from a closed scanner session is ignored", async ({ page }) => {
  await register(page.request, "partner", 0);
  // A slow detector: the first read finishes only after the dialog is reopened.
  await page.addInitScript(() => {
    const state = { reads: 0 };
    (window as { detector?: typeof state }).detector = state;
    class SlowDetector {
      static async getSupportedFormats() {
        return ["qr_code"];
      }
      async detect() {
        if (++state.reads > 1) return [];
        await new Promise((resolve) => setTimeout(resolve, 600));
        return [{ rawValue: "H7K49" }];
      }
    }
    (window as { BarcodeDetector?: unknown }).BarcodeDetector = SlowDetector;
    // A canvas that keeps drawing, so the video starts playing.
    navigator.mediaDevices.getUserMedia = async () => {
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d")!;
      setInterval(() => context.fillRect(0, 0, 10, 10), 50);
      return canvas.captureStream(10);
    };
  });
  await page.goto("/api/partner/kasir");
  const open = page.getByRole("button", { name: "Pindai QR" });
  const dialog = page.getByRole("dialog");
  await open.click();
  // The first session's slow read has started.
  await page.waitForFunction(
    () => (window as { detector?: { reads: number } }).detector!.reads === 1,
  );
  await dialog.getByRole("button", { name: "Tutup" }).click();
  await open.click();
  // The second session is scanning too, and the first read has finished.
  await page.waitForFunction(
    () => (window as { detector?: { reads: number } }).detector!.reads > 1,
  );
  await page.waitForTimeout(800);
  await expect(dialog).toBeVisible();
  await expect(page.getByLabel("Karakter 1")).toHaveValue("");
});

test("cashier and partner workspace share navigation order on desktop and mobile", async ({
  page,
}) => {
  await register(page.request, "partner", 1);
  const labels = [
    "Dasbor",
    "Listing",
    "Pesanan",
    "Verifikasi kode",
    "Profil toko",
    "Akun",
  ];
  const hrefs = [
    "/partner",
    "/partner/listings",
    "/partner/orders",
    "/api/partner/kasir",
    "/partner/store",
    "/partner/account",
  ];
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ["/partner", "/partner/orders", "/api/partner/kasir"]) {
      await page.goto(path);
      if (width === 390)
        await page
          .getByRole("button", { name: "Menu mitra", exact: true })
          .click();
      const nav =
        width === 390
          ? page
              .getByRole("dialog")
              .getByRole("navigation", { name: "Menu mitra", exact: true })
          : page.getByRole("navigation", {
              name: "Navigasi mitra",
              exact: true,
            });
      await expect(nav.getByRole("link")).toHaveText(labels);
      for (let i = 0; i < hrefs.length; i++)
        await expect(nav.getByRole("link").nth(i)).toHaveAttribute(
          "href",
          hrefs[i],
        );
      if (path === "/api/partner/kasir")
        await expect(
          nav.getByRole("link", { name: "Verifikasi kode", exact: true }),
        ).toHaveAttribute("aria-current", "page");
      if (width === 390) {
        await page.keyboard.press("Escape");
        await expect(page.getByRole("dialog")).toHaveCount(0);
        await expect(
          page.getByRole("button", { name: "Menu mitra", exact: true }),
        ).toBeFocused();
      }
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
  }
  await page.getByLabel("Karakter 1", { exact: true }).fill("A");
  await page.getByRole("button", { name: "Menu mitra", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByLabel("Karakter 1", { exact: true })).toHaveValue("A");
  await page.getByRole("button", { name: "Menu mitra", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("link", { name: "Pesanan", exact: true })
    .click();
  await expect(page).toHaveURL(/\/partner\/orders$/);
});

test("cashier logout can be cancelled and retries safely after a server error", async ({
  page,
}) => {
  await register(page.request, "partner", 0);
  const user = await (await page.request.get("/api/auth/me")).json();
  await page.goto("/api/partner/kasir");
  await page.getByRole("button", { name: "Keluar", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Keluar dari akun?" });
  await dialog.getByRole("button", { name: "Batal", exact: true }).click();
  expect((await page.request.get("/api/auth/me")).status()).toBe(200);
  await page.route("**/api/auth/logout", (route) =>
    route.fulfill({ status: 503, json: { detail: "Offline" } }),
  );
  await page.getByRole("button", { name: "Keluar", exact: true }).click();
  await dialog.getByRole("button", { name: "Ya, keluar", exact: true }).click();
  await expect(dialog.getByRole("alert")).toHaveText(
    "Gagal keluar. Coba lagi.",
  );
  await expect(
    dialog.getByRole("button", { name: "Ya, keluar", exact: true }),
  ).toBeEnabled();
  await page.unroute("**/api/auth/logout");
  await dialog.getByRole("button", { name: "Ya, keluar", exact: true }).click();
  await expect(page).toHaveURL("/");
  expect((await page.request.get("/api/auth/me")).status()).toBe(403);
  // Restore this disposable account's session so afterEach can delete it.
  expect(
    (
      await mutate(page.request, "auth/login", {
        username: user.username,
        password,
      })
    ).status(),
  ).toBe(200);
});
