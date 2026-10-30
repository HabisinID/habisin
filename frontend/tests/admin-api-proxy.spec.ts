import { expect, test } from "./fixtures";
import { mutate } from "./backend-fixtures";

test("admin API keeps slash, POST body and session across the frontend proxy", async ({
  request,
}) => {
  const login = await mutate(request, "auth/login", {
    username: process.env.E2E_ADMIN_USERNAME || "workspace_admin",
    password:
      process.env.E2E_ADMIN_PASSWORD || process.env.HABISIN_TEST_ADMIN_PASSWORD,
  });
  expect(login.status()).toBe(200);
  const foods = await (await request.get("/api/listings")).json();
  expect(foods.length).toBeGreaterThan(0);
  const csrf = await (await request.get("/api/auth/csrf")).json();
  // Invalid input cannot mutate the seeded food, but confirms that DRF saw
  // this POST body and the signed-in admin rather than a redirected GET.
  for (const path of [
    `/api/admin/listings/${foods[0].id}/take-down/`,
    `/api/admin/listings/${foods[0].id}/moderate`,
  ]) {
    const response = await request.post(path, {
      data: { action: "take_down", reason: "" },
      headers: { "X-CSRFToken": csrf.csrfToken },
      maxRedirects: 0,
    });
    expect(response.status()).toBe(400);
    expect(JSON.stringify(await response.json())).toMatch(/alasan/i);
    expect(response.headers().location).toBeUndefined();
  }
  const restore = await request.post("/api/admin/listings/999999999/restore/", {
    data: {},
    headers: { "X-CSRFToken": csrf.csrfToken },
    maxRedirects: 0,
  });
  expect(restore.status()).toBe(404);
  const cashier = await request.get("/api/partner/kasir", { maxRedirects: 0 });
  expect(cashier.status()).toBe(403);
  expect(cashier.headers()["content-type"]).toContain("text/html");
});
