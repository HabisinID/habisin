export type User = {
  id: number;
  username: string;
  name: string;
  email: string;
  role: "buyer" | "partner" | "admin";
};
export type Listing = {
  id: number;
  name: string;
  store: string;
  category: string;
  description: string;
  address: string;
  price: number;
  original_price: number;
  stock: number;
  image: string;
  latitude: number;
  longitude: number;
  pickup_start: string;
  pickup_end: string;
  active: boolean;
};
export type ListingInput = Omit<Listing, "id" | "active">;
export const listingCategories = [
  "Makanan berat",
  "Roti & kue",
  "Camilan",
  "Sehat",
];
export type Reservation = {
  id: number;
  listing: Listing;
  quantity: number;
  total: number;
  code: string;
  status: string;
  created_at: string;
};

export type Store = {
  id: number;
  name: string;
  description: string;
  address: string;
  opening_time: string;
  closing_time: string;
  latitude: number;
  longitude: number;
  is_open: boolean;
  created_at: string;
  updated_at: string;
};

export type GeocodeResult = {
  display_name: string;
  latitude: number;
  longitude: number;
};

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (method !== "GET") {
    const csrf = await fetch("/api/auth/csrf", {
      credentials: "same-origin",
      cache: "no-store",
    });
    if (!csrf.ok)
      throw new Error("Server belum terhubung. Coba lagi sebentar.");
    headers["X-CSRFToken"] = (await csrf.json()).csrfToken;
  }
  const response = await fetch(`/api/${path}`, {
    method,
    headers,
    credentials: "same-origin",
    cache: "no-store",
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  });
  if (response.status === 204) return undefined as T;
  const data = await response.json().catch(() => ({
    detail: "Server belum terhubung. Pastikan backend berjalan.",
  }));
  if (!response.ok)
    throw new ApiError(
      Object.entries(data)
        .map(
          ([key, value]) =>
            `${key === "detail" ? "" : `${key}: `}${Array.isArray(value) ? value.join(" ") : value}`,
        )
        .join(" "),
      response.status,
      data,
    );
  return data as T;
}
export const partnerListingApi = {
  list: (signal?: AbortSignal) =>
    api<Listing[]>("partner/listings", "GET", undefined, signal),
  create: (data: ListingInput) =>
    api<Listing>("partner/listings", "POST", data),
  update: (id: number, data: Partial<ListingInput> & { active?: boolean }) =>
    api<Listing>(`partner/listings/${id}`, "PATCH", data),
  remove: (id: number) => api<void>(`partner/listings/${id}`, "DELETE"),
};
export const rupiah = (value: number) =>
  value === 0
    ? "Gratis"
    : new Intl.NumberFormat("id-ID", {
        style: "currency",
        currency: "IDR",
        maximumFractionDigits: 0,
      }).format(value);
export const pickup = (date: string) =>
  new Date(date).toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  });
export function distance(lat: number, lng: number, origin: [number, number]) {
  const rad = Math.PI / 180;
  const a =
    Math.sin(((lat - origin[0]) * rad) / 2) ** 2 +
    Math.cos(origin[0] * rad) *
      Math.cos(lat * rad) *
      Math.sin(((lng - origin[1]) * rad) / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
