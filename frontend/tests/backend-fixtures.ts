import type { APIRequestContext } from "@playwright/test";
import { expect, request as api } from "@playwright/test";
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

// New partners wait for an admin's approval before they can add stores. CI
// creates this admin (see .github/workflows/ci.yml); locally, create it once with
// `createsuperuser` or point E2E_ADMIN_USERNAME/E2E_ADMIN_PASSWORD at your own.
const admin = {
  username: process.env.E2E_ADMIN_USERNAME || "e2e_admin",
  password: process.env.E2E_ADMIN_PASSWORD || "E2e-Admin-Secure-927!",
};
// One signed-in admin per worker, so approvals don't run into the login limit.
let adminSession: Promise<APIRequestContext> | undefined;
function signedInAdmin() {
  adminSession ??= (async () => {
    const context = await api.newContext({
      baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3000",
    });
    const response = await mutate(context, "auth/login", admin);
    expect(response.status(), "E2E admin could not sign in").toBe(200);
    return context;
  })();
  return adminSession;
}
async function approvePartner(username: string) {
  const context = await signedInAdmin();
  const pending = await context.get(
    "/api/admin/partner-approvals?status=pending",
  );
  expect(pending.status()).toBe(200);
  const body = await pending.json();
  const rows: { id: number; username: string }[] = Array.isArray(body)
    ? body
    : body.results;
  const row = rows.find((item) => item.username === username);
  expect(row, `no pending approval for ${username}`).toBeTruthy();
  const approved = await mutate(
    context,
    `admin/partner-approvals/${row!.id}/approve`,
  );
  expect(approved.status()).toBe(200);
}

export async function register(
  request: APIRequestContext,
  role: "buyer" | "partner",
  storeCount = 2,
) {
  const username = `m3_${role}_${Date.now()}`;
  const response = await mutate(request, "auth/register", {
    username,
    name: "Module Three",
    email: "module3@example.com",
    password,
    role,
  });
  expect(response.status()).toBe(201);
  const stores = [];
  if (role === "partner") {
    await approvePartner(username);
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
