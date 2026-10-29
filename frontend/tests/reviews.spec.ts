import { expect, test } from "./fixtures";
import type { Page } from "@playwright/test";

test.use({ serviceWorkers: "block" });

const buyer = {
  id: 21,
  username: "raihan_test",
  name: "Raihan Daffa",
  email: "raihan@example.test",
  role: "buyer" as const,
};

const listing = {
  id: 12,
  name: "Roti Surplus",
  store: "Dapur Ulasan",
  store_id: 4,
  image: "https://example.com/roti.jpg",
  price: 5000,
  pickup_start: "2026-10-28T08:00:00Z",
  pickup_end: "2026-10-28T12:00:00Z",
};

const review = {
  id: 31,
  reservation_id: 88,
  listing_id: listing.id,
  listing_name: listing.name,
  product_image: listing.image,
  store_name: listing.store,
  rating: 5,
  comment: "Rotinya masih enak.",
  created_at: "2026-10-27T08:00:00Z",
  updated_at: "2026-10-27T08:00:00Z",
};

const complaint = {
  id: 52,
  reservation_id: 88,
  store_name: listing.store,
  reason: "freshness",
  description: "Makanan berbau kurang segar.",
  status: "reviewed",
  created_at: "2026-10-28T08:00:00Z",
};

const reservation = {
  id: 88,
  listing: {
    id: listing.id,
    name: listing.name,
    store: listing.store,
    image: listing.image,
    price: listing.price,
    pickup_end: listing.pickup_end,
  },
  quantity: 2,
  total: 10000,
  code: "H7K49",
  note: "",
  status: "picked_up",
  created_at: "2026-10-27T08:00:00Z",
  pay_before: "2026-10-27T08:05:00Z",
  cancel_until: "2026-10-27T11:30:00Z",
  paid_at: "2026-10-27T08:01:00Z",
  picked_up_at: "2026-10-27T09:00:00Z",
};

const store = {
  id: 4,
  name: listing.store,
  description: "Roti rumahan.",
  address: "Jalan Margonda, Depok",
  opening_time: "08:00",
  closing_time: "20:00",
  latitude: -6.36,
  longitude: 106.83,
  is_open: true,
  created_at: "2026-10-27T08:00:00Z",
  updated_at: "2026-10-27T08:00:00Z",
};

const storeReviews = [
  { id: 1, listing_id: 12, listing_name: "Roti Surplus", user_name: "A", rating: 3, comment: "Ulasan terbaru", created_at: "2026-10-28T08:00:00Z", updated_at: "2026-10-28T08:00:00Z" },
  { id: 2, listing_id: 12, listing_name: "Roti Surplus", user_name: "B", rating: 5, comment: "Rating tertinggi", created_at: "2026-10-27T08:00:00Z", updated_at: "2026-10-27T08:00:00Z" },
  { id: 3, listing_id: 12, listing_name: "Roti Surplus", user_name: "C", rating: 1, comment: "Rating terendah", created_at: "2026-10-26T08:00:00Z", updated_at: "2026-10-26T08:00:00Z" },
];

type MockMode = "create-review" | "edit-review" | "complaint" | "account" | "store";

const browserDiagnostics = new WeakMap<Page, string[]>();

test.beforeEach(async ({ page }) => {
  const entries: string[] = [];
  browserDiagnostics.set(page, entries);
  page.on("request", (request) => {
    if (["document", "script", "xhr", "fetch"].includes(request.resourceType()))
      entries.push(`REQUEST ${request.resourceType()} ${request.method()} ${request.url()}`);
  });
  page.on("response", (response) => {
    if (["document", "script", "xhr", "fetch"].includes(response.request().resourceType()))
      entries.push(`RESPONSE ${response.status()} ${response.url()}`);
  });
  page.on("requestfailed", (request) => {
    if (["document", "script", "xhr", "fetch"].includes(request.resourceType()))
      entries.push(`FAILED ${request.resourceType()} ${request.method()} ${request.url()} ${request.failure()?.errorText ?? ""}`);
  });
  page.on("pageerror", (error) => entries.push(`PAGE ERROR ${error.stack ?? error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") entries.push(`CONSOLE ERROR ${message.text()}`);
  });
});

test.afterEach(async ({ page }, testInfo) => {
  const entries = browserDiagnostics.get(page) ?? [];
  const mockState = await page
    .evaluate(() =>
      ({
        installed: (window as Window & { __reviewTestMockInstalled?: boolean })
          .__reviewTestMockInstalled ?? false,
        requests: (window as Window & {
          __reviewTestRequests?: { path: string; method: string; body: unknown }[];
        }).__reviewTestRequests ?? [],
      }),
    )
    .catch(() => ({ installed: false, requests: [] }));
  const diagnosticText = [
    ...entries,
    `MOCK STATE ${JSON.stringify(mockState)}`,
  ].join("\n");
  await testInfo.attach("api-diagnostics.txt", {
    body: diagnosticText || "No API requests or browser errors were recorded.",
    contentType: "text/plain",
  });
  if (testInfo.status !== testInfo.expectedStatus)
    console.log(`[review test diagnostics: ${testInfo.title}]\n${diagnosticText}`);
});

async function installApiMock(page: Page, mode: MockMode) {
  await page.addInitScript(
    ({ mode, buyer, listing, review, complaint, reservation, store, storeReviews }) => {
      const originalFetch = window.fetch.bind(window);
      let existingReview: typeof review | null = mode === "edit-review" ? review : null;
      let deletedReview = false;
      const requests: { path: string; method: string; body: unknown }[] = [];
      (window as Window & { __reviewTestMockInstalled?: boolean }).__reviewTestMockInstalled = true;
      (window as Window & { __reviewTestRequests?: typeof requests }).__reviewTestRequests = requests;

      window.fetch = async (input, init) => {
        const rawUrl = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        const url = new URL(rawUrl, window.location.href);
        const apiIndex = url.pathname.lastIndexOf("/api/");
        if (apiIndex < 0) return originalFetch(input, init);

        const path = url.pathname.slice(apiIndex + 5).replace(/\/+$/, "");
        const method = init?.method ?? (input instanceof Request ? input.method : "GET");
        let body: Record<string, unknown> = {};
        if (typeof init?.body === "string") {
          try { body = JSON.parse(init.body); } catch { body = {}; }
        }
        requests.push({ path, method, body });

        const json = (data: unknown, status = 200) =>
          new Response(JSON.stringify(data), {
            status,
            headers: { "Content-Type": "application/json" },
          });
        if (path === "auth/me")
          return mode === "store"
            ? json({ detail: "Authentication required" }, 403)
            : json(buyer);
        if (path === "auth/csrf") return json({ csrfToken: "review-test-csrf" });
        if (path === "listings/12/review-eligibility")
          return json({
            listing,
            can_review: mode === "create-review" && !existingReview,
            reservation_id: 88,
            review: existingReview,
          });
        if (path === "reservations/88") return json(reservation);
        if (path === "reservations/88/feedback")
          return json({ can_review: false, review, can_complain: true, complaint: null });
        if (path === "reviews/mine")
          return json({
            reviews: deletedReview ? [] : [review],
            complaints: [complaint],
          });
        if (path === "reviews" && method === "POST")
          return json({ ...review, ...body }, 201);
        if (path === "reviews/31" && method === "PATCH") {
          existingReview = { ...review, ...body } as typeof review;
          return json(existingReview);
        }
        if (path === "reviews/31" && method === "DELETE") {
          existingReview = null;
          deletedReview = true;
          return new Response(null, { status: 204 });
        }
        if (path === "complaints" && method === "POST")
          return json({ ...complaint, ...body, status: "open" }, 201);
        if (path === "stores/4") return json(store);
        if (path === "stores/4/listings") return json([]);
        if (path === "stores/4/reviews")
          return json({ store_id: 4, average_rating: 3, review_count: 3, reviews: storeReviews });
        if (path === "listings") return json([]);
        return json({ detail: `Unmocked test API endpoint: ${method} ${path}` }, 404);
      };
    },
    { mode, buyer, listing, review, complaint, reservation, store, storeReviews },
  );
}

async function capturedRequest(page: Page, path: string, method: string) {
  return page.evaluate(
    ({ path, method }) =>
      (window as Window & { __reviewTestRequests?: { path: string; method: string; body: unknown }[] })
        .__reviewTestRequests?.find((request) => request.path === path && request.method === method)?.body,
    { path, method },
  );
}

test("buyer submits a review for an eligible picked-up product", async ({ page }) => {
  await installApiMock(page, "create-review");
  await page.goto("/ulasan/12");
  await expect(page.getByRole("heading", { name: "Tulis ulasan" })).toBeVisible();
  await expect(
    page.getByRole("complementary").getByRole("heading", {
      name: listing.name,
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "4 bintang" }).click();
  await expect(page.getByText("4 dari 5 bintang")).toBeVisible();
  await page.getByLabel(/Ceritakan pengalamanmu/).fill("Roti masih enak dan lembut.");
  await page.getByRole("button", { name: "Kirim ulasan" }).click();

  await expect(page.getByText("Terima kasih atas ulasanmu!")).toBeVisible();
  expect(await capturedRequest(page, "reviews", "POST")).toEqual({
    reservation_id: 88,
    rating: 4,
    comment: "Roti masih enak dan lembut.",
  });
});

test("buyer can edit or delete an existing review from its review page", async ({ page }) => {
  await installApiMock(page, "edit-review");
  await page.goto("/ulasan/12");
  await expect(page.getByRole("heading", { name: "Edit ulasan" })).toBeVisible();
  await page.getByRole("button", { name: "2 bintang" }).click();
  await page.getByLabel(/Ceritakan pengalamanmu/).fill("Saya mengubah komentar ini.");
  await page.getByRole("button", { name: "Simpan perubahan" }).click();
  await expect(page.getByText("Terima kasih atas ulasanmu!")).toBeVisible();
  expect(await capturedRequest(page, "reviews/31", "PATCH")).toEqual({
    rating: 2,
    comment: "Saya mengubah komentar ini.",
  });

  await page.reload();
  await expect(page.getByRole("heading", { name: "Edit ulasan" })).toBeVisible();
  await page.getByRole("button", { name: "Hapus ulasan" }).click();
  await page.getByRole("button", { name: "Ya, hapus" }).click();
  await expect(page.getByRole("heading", { name: "Tulis ulasan" })).toBeVisible();
  expect(await capturedRequest(page, "reviews/31", "DELETE")).toBeDefined();
});

test("buyer files a complaint and sees the submitted confirmation", async ({ page }) => {
  await installApiMock(page, "complaint");
  await page.goto("/komplain/88");
  await expect(page.getByRole("heading", { name: "Laporkan masalah" })).toBeVisible();
  await page.getByLabel("Makanan basi atau tidak segar").check();
  await page.getByLabel("Detail masalah").fill("Makanan berbau kurang segar.");
  await page.getByRole("button", { name: "Kirim laporan" }).click();

  await expect(page.getByText("Laporanmu sudah diterima")).toBeVisible();
  await expect(page.getByText("Makanan berbau kurang segar.")).toBeVisible();
  expect(await capturedRequest(page, "complaints", "POST")).toEqual({
    reservation_id: 88,
    reason: "freshness",
    description: "Makanan berbau kurang segar.",
  });
});

test("buyer account shows review controls and the complaint status", async ({ page }) => {
  await installApiMock(page, "account");
  await page.goto("/");
  await page.getByRole("button", { name: "Akun Raihan Daffa" }).click();
  await page.getByRole("button", { name: "Ulasan saya" }).click();
  await expect(page.getByText(listing.name, { exact: true })).toBeVisible();
  await expect(page.getByText("Sedang ditinjau", { exact: true })).toBeVisible();
  await expect(page.getByText(complaint.description)).toBeVisible();

  await page.getByRole("button", { name: "Edit ulasan" }).click();
  await page.getByRole("textbox", { name: "Ulasan" }).fill("Komentar yang diperbarui.");
  await page.getByRole("button", { name: "Simpan perubahan" }).click();
  await expect(page.getByText("Komentar yang diperbarui.")).toBeVisible();

  await page.getByRole("button", { name: "Hapus", exact: true }).click();
  await page.getByRole("button", { name: "Ya, hapus" }).click();
  await expect(page.getByText("Kamu belum menulis ulasan.")).toBeVisible();
  expect(await capturedRequest(page, "reviews/31", "DELETE")).toBeDefined();
  await expect(page.getByText(complaint.description)).toBeVisible();
});

test("store ratings show the distribution and sort reviews", async ({ page }) => {
  await installApiMock(page, "store");
  await page.goto("/stores/4");
  const section = page.getByRole("region", { name: "Ulasan pembeli" });
  await expect(section.getByText("3,0", { exact: true })).toBeVisible();
  await expect(section.getByText("dari 3 ulasan", { exact: true })).toBeVisible();
  const reviewList = section.locator("ul").first();
  await expect(reviewList.locator("li").first()).toContainText("Ulasan terbaru");

  await section.getByRole("button", { name: "Rating tertinggi" }).click();
  await expect(reviewList.locator("li").first()).toContainText("Rating tertinggi");
  await section.getByRole("button", { name: "Rating terendah" }).click();
  await expect(reviewList.locator("li").first()).toContainText("Rating terendah");
  await section.getByRole("button", { name: "Terbaru" }).click();
  await expect(reviewList.locator("li").first()).toContainText("Ulasan terbaru");
});
