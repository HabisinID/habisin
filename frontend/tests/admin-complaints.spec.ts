import { expect, test } from "./fixtures";

type TestComplaint = {
  id: number;
  status: "open" | "reviewed" | "resolved";
  status_label: string;
  reason: "freshness";
  reason_label: string;
  description: string;
  created_at: string;
  buyer_name: string;
  buyer_username: string;
  store_name: string;
  listing_id: number;
  listing_name: string;
  listing_image: string;
  listing_active: boolean;
  listing_moderated_at: string | null;
  listing_moderation_reason: string;
  reservation_id: number;
  reservation_code: string;
  reservation_status: string;
  quantity: number;
  total: number;
  picked_up_at: string | null;
};

const complaint = (id: number, status: TestComplaint["status"]): TestComplaint => ({
  id,
  status,
  status_label:
    status === "open"
      ? "Terbuka"
      : status === "reviewed"
        ? "Ditinjau"
        : "Selesai",
  reason: "freshness",
  reason_label: "Makanan basi atau tidak segar",
  description: `Laporan detail untuk komplain ${id}; makanan terasa basi.`,
  created_at: `2026-10-${String(30 - id).padStart(2, "0")}T10:00:00+07:00`,
  buyer_name: `Pembeli ${id}`,
  buyer_username: `pembeli_${id}`,
  store_name: `Toko ${id}`,
  listing_id: 100 + id,
  listing_name: `Makanan ${id}`,
  listing_image: "https://example.com/module3-photo.svg",
  listing_active: true,
  listing_moderated_at: null,
  listing_moderation_reason: "",
  reservation_id: 200 + id,
  reservation_code: `A${id}345`,
  reservation_status: "picked_up",
  quantity: 2,
  total: 16000,
  picked_up_at: `2026-10-${String(30 - id).padStart(2, "0")}T09:30:00+07:00`,
});

async function setupAdmin(page: import("@playwright/test").Page) {
  let reports = [
    complaint(1, "open"),
    complaint(2, "open"),
    complaint(3, "resolved"),
  ];
  let takedownRequest: { action: string; reason: string } | null = null;

  await page.route("**/api/auth/me", (route) =>
    route.fulfill({
      json: {
        id: 99,
        username: "complaint_admin",
        name: "Admin Uji",
        email: "admin@example.com",
        role: "admin",
      },
    }),
  );
  await page.route("**/api/admin/complaints**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === "PATCH") {
      const pathSegments = url.pathname.split("/");
      const id = Number(pathSegments[pathSegments.length - 1]);
      const body = request.postDataJSON() as { status: TestComplaint["status"] };
      reports = reports.map((item) =>
        item.id === id
          ? {
              ...item,
              status: body.status,
              status_label:
                body.status === "open"
                  ? "Terbuka"
                  : body.status === "reviewed"
                    ? "Ditinjau"
                    : "Selesai",
            }
          : item,
      );
      return route.fulfill({ json: reports.find((item) => item.id === id) });
    }

    const requestedStatus = url.searchParams.get("status") ?? "open";
    const filtered = reports.filter(
      (item) => requestedStatus === "all" || item.status === requestedStatus,
    );
    const counts = {
      open: reports.filter((item) => item.status === "open").length,
      reviewed: reports.filter((item) => item.status === "reviewed").length,
      resolved: reports.filter((item) => item.status === "resolved").length,
    };
    return route.fulfill({
      json: {
        results: filtered,
        count: filtered.length,
        page: 1,
        page_size: 25,
        counts,
      },
    });
  });
  await page.route("**/api/admin/listings/*/moderate", async (route) => {
    takedownRequest = route.request().postDataJSON();
    await route.fulfill({ json: { id: 101, moderated_at: "2026-10-30T12:00:00Z" } });
  });

  return {
    getTakedownRequest: () => takedownRequest,
  };
}

test("selecting a complaint highlights its row and updates the detail panel", async ({
  page,
}) => {
  await setupAdmin(page);
  await page.goto("/admin/complaints");

  const rows = page.getByRole("table").getByRole("row");
  const first = rows.filter({ hasText: "LK-0001" });
  const second = rows.filter({ hasText: "LK-0002" });
  const detail = page.getByLabel("Detail laporan terpilih");

  await expect(first).toHaveAttribute("aria-selected", "true");
  await expect(detail).toContainText("Makanan 1");
  await second.click();
  await expect(second).toHaveAttribute("aria-selected", "true");
  await expect(first).toHaveAttribute("aria-selected", "false");
  await expect(detail).toContainText("Makanan 2");
  await expect(detail).toContainText("Laporan detail untuk komplain 2");
});

test("admin can mark a complaint in review and then resolve it", async ({
  page,
}) => {
  await setupAdmin(page);
  await page.goto("/admin/complaints");
  await page.getByRole("button", { name: "Tandai sedang ditinjau" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Laporan ditandai sedang ditinjau.",
  );
  await expect(
    page.getByRole("row").filter({ hasText: "LK-0001" }),
  ).toHaveCount(0);

  await page.getByRole("button", { name: /Semua/ }).click();
  const first = page.getByRole("row").filter({ hasText: "LK-0001" });
  await first.click();
  await expect(first).toContainText("Ditinjau");
  await page.getByRole("button", { name: /Tandai selesai/ }).click();
  await expect(page.getByRole("status")).toContainText(
    "Laporan ditandai selesai.",
  );
  await expect(first).toContainText("Selesai");
});

test("taking down a reported listing records the reason and resolves the complaint", async ({
  page,
}) => {
  const admin = await setupAdmin(page);
  await page.goto("/admin/complaints");
  await page.getByRole("button", { name: "Turunkan listing" }).click();

  const dialog = page.getByRole("dialog", { name: "Turunkan listing?" });
  await dialog
    .getByLabel("Alasan penurunan (wajib)")
    .fill("Laporan menunjukkan makanan tidak layak konsumsi.");
  await dialog.getByRole("button", { name: "Turunkan listing" }).click();

  await expect(page.getByRole("status")).toContainText(
    "Listing diturunkan dan laporan ditandai selesai.",
  );
  expect(admin.getTakedownRequest()).toEqual({
    action: "take_down",
    reason: "Laporan menunjukkan makanan tidak layak konsumsi.",
  });
  await expect(
    page.getByRole("row").filter({ hasText: "LK-0001" }),
  ).toHaveCount(0);
});
