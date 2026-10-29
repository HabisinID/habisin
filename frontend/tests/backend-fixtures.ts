import type { APIRequestContext } from "@playwright/test";
import { expect, request as playwrightRequest } from "@playwright/test";
export const password = "Module3-Secure-927!";
export const image = "https://example.com/module3-photo.svg";

export async function mutate(
  request: APIRequestContext,
  path: string,
  data?: unknown,
  method = "POST",
) {
  const csrfResponse = await request.get("/api/auth/csrf");
  const expectedOrigin = new URL(
    process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3000",
  ).origin;
  if (new URL(csrfResponse.url()).origin !== expectedOrigin) {
    throw new Error(
      "Backend fixture menolak mutasi ke origin di luar PLAYWRIGHT_BASE_URL.",
    );
  }
  const csrf = await csrfResponse.json();
  return request.fetch(`/api/${path}`, {
    method,
    data,
    headers: { "X-CSRFToken": csrf.csrfToken },
  });
}

export async function register(
  request: APIRequestContext,
  role: "buyer" | "partner",
  storeCount = 2,
) {
  const response = await mutate(request, "auth/register", {
    username: `m3_${role}_${Date.now()}`,
    name: "Module Three",
    email: "module3@example.com",
    password,
    role,
  });
  expect(response.status()).toBe(201);
  const stores = [];
  if (role === "partner") {
    // Operational fixtures follow Modul 6's real approval API. Never bypass
    // the production permission or auto-approve accounts in application code.
    if (!process.env.HABISIN_TEST_ADMIN_PASSWORD)
      throw new Error(
        "Partner fixtures require the disposable backend admin (HABISIN_TEST_ADMIN_PASSWORD).",
      );
    const user = await response.json();
    const admin = await playwrightRequest.newContext({
      baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3000",
    });
    try {
      expect(
        (
          await mutate(admin, "auth/login", {
            username: "workspace_admin",
            password: process.env.HABISIN_TEST_ADMIN_PASSWORD,
          })
        ).status(),
      ).toBe(200);
      const approvals = await (
        await admin.get("/api/admin/partner-approvals/?status=pending")
      ).json();
      const approval = approvals.find(
        (row: { user: number }) => row.user === user.id,
      );
      expect(approval).toBeDefined();
      expect(
        (
          await mutate(admin, `admin/partner-approvals/${approval.id}/approve/`)
        ).status(),
      ).toBe(200);
    } finally {
      await admin.dispose();
    }
    for (const [name, address, latitude, longitude] of [
      ["Toko Modul Tiga", "Jalan Margonda, Beji, Depok", -6.366, 106.829],
      [
        "Toko Modul Tiga Cabang Dua",
        "Jalan Pondok Cina 22, Depok",
        -6.369,
        106.831,
      ],
    ].slice(0, storeCount)) {
      const geocode = await mutate(request, "partner/geocode", { address });
      expect(geocode.status()).toBe(200);
      const token = (await geocode.json()).geocode_token;
      const created = await mutate(request, "partner/stores", {
        name,
        address,
        latitude,
        longitude,
        description: "Dapur roti surplus",
        opening_time: "08:00",
        // Keep the test store open beyond now, including runs after 23:00 WIB.
        closing_time: new Date(Date.now() + 4 * 3600000).toLocaleTimeString(
          "en-GB",
          {
            timeZone: "Asia/Jakarta",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          },
        ),
        location_confirmed: true,
        geocode_token: token,
      });
      expect(created.status()).toBe(201);
      stores.push(await created.json());
    }
  }
  return stores;
}

export function listing(name: string) {
  return {
    name,
    category: "Roti & kue",
    description: "Surplus roti untuk diambil hari ini.",
    image,
    price: 8000,
    original_price: 16000,
    stock: 4,
    prepared_at: new Date(Date.now() - 3600000).toISOString(),
    pickup_start: new Date(Date.now() - 60000).toISOString(),
    pickup_end: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
  };
}

export async function cleanup(request: APIRequestContext) {
  const inventory = await request.get("/api/partner/listings");
  if (inventory.ok()) {
    for (const item of await inventory.json())
      await mutate(request, `partner/listings/${item.id}`, undefined, "DELETE");
  }
  await mutate(request, "auth/me", { password }, "DELETE");
}
