import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QRCodeSVG } from "qrcode.react";
import type { APIRequestContext, Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { cleanup, listing, mutate, register } from "./backend-fixtures";

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
