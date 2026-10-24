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
  image_source?: "url" | "upload";
  latitude: number;
  longitude: number;
  prepared_at?: string | null;
  buyer_notes?: string;
  packaging?: string;
  storage_notes?: string;
  allergens?: string;
  pickup_start: string;
  pickup_end: string;
  active: boolean;
  store_id?: number | null;
  store_summary?: Pick<
    Store,
    "id" | "name" | "address" | "latitude" | "longitude" | "is_open"
  > | null;
};
export type ListingInput = Pick<
  Listing,
  | "name"
  | "category"
  | "description"
  | "price"
  | "original_price"
  | "stock"
  | "pickup_start"
  | "pickup_end"
> & {
  store_id: number;
  prepared_at: string;
  buyer_notes?: string;
  packaging?: string;
  storage_notes?: string;
  allergens?: string;
  image?: string;
  image_source?: "upload" | "url";
  image_file?: File;
};
export const listingCategories = [
  "Makanan berat",
  "Roti & kue",
  "Camilan",
  "Sehat",
  "Minuman",
  "Katering",
  "Kue basah",
  "Sayur & buah",
  "Lainnya",
];
export type Reservation = {
  id: number;
  listing: Listing;
  quantity: number;
  total: number;
  code: string;
  status: string;
  created_at: string;
  can_cancel?: boolean;
  cancellation_reason?: string;
  cancellation_note?: string;
  cancelled_by?: "buyer" | "partner" | "";
  cancelled_at?: string | null;
};

export type ReservationPolicy = {
  remaining_free_portions: number;
  active_free_reservation_id: number | null;
  max_quantity: number;
  reason: string;
  day: string;
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
  const multipart = typeof FormData !== "undefined" && body instanceof FormData;
  const headers: Record<string, string> = multipart
    ? {}
    : { "Content-Type": "application/json" };
  if (method !== "GET") {
    const csrf = await fetch("/api/auth/csrf", {
      credentials: "same-origin",
      cache: "no-store",
      signal,
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
    body:
      body === undefined
        ? undefined
        : multipart
          ? (body as FormData)
          : JSON.stringify(body),
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
function listingBody(data: Partial<ListingInput> & { active?: boolean }) {
  if (!data.image_file) return data;
  const form = new FormData();
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined)
      form.append(key, value instanceof File ? value : String(value));
  }
  return form;
}
export type UploadProgress = { loaded: number; total: number };
async function listingRequest(
  path: string,
  method: string,
  data: Partial<ListingInput>,
  onProgress?: (progress: UploadProgress) => void,
) {
  const body = listingBody(data);
  if (!(body instanceof FormData) || !onProgress)
    return api<Listing>(path, method, body);
  const csrf = await fetch("/api/auth/csrf", {
    credentials: "same-origin",
    cache: "no-store",
  });
  if (!csrf.ok) throw new Error("Server belum terhubung. Coba lagi sebentar.");
  const token = (await csrf.json()).csrfToken;
  return new Promise<Listing>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, `/api/${path}`);
    xhr.withCredentials = true;
    xhr.setRequestHeader("X-CSRFToken", token);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable)
        onProgress({ loaded: event.loaded, total: event.total });
    };
    xhr.onerror = () =>
      reject(
        new Error(
          "Foto gagal diunggah. Koneksi terputus; foto dan isian tetap tersimpan di form. Coba lagi.",
        ),
      );
    xhr.onabort = () => reject(new Error("Pengiriman dibatalkan. Coba lagi."));
    xhr.onload = () => {
      let result: Record<string, unknown>;
      try {
        result = JSON.parse(xhr.responseText);
      } catch {
        reject(new Error("Server belum terhubung. Coba lagi."));
        return;
      }
      if (xhr.status >= 200 && xhr.status < 300)
        resolve(result as unknown as Listing);
      else
        reject(
          new ApiError(
            Object.entries(result)
              .map(
                ([key, value]) =>
                  `${key === "detail" ? "" : `${key}: `}${Array.isArray(value) ? value.join(" ") : value}`,
              )
              .join(" "),
            xhr.status,
            result,
          ),
        );
    };
    xhr.send(body);
  });
}
export const partnerListingApi = {
  list: (signal?: AbortSignal) =>
    api<Listing[]>("partner/listings", "GET", undefined, signal),
  create: (
    data: ListingInput,
    onProgress?: (progress: UploadProgress) => void,
  ) => listingRequest("partner/listings", "POST", data, onProgress),
  update: (
    id: number,
    data: Partial<ListingInput> & { active?: boolean },
    onProgress?: (progress: UploadProgress) => void,
  ) => listingRequest(`partner/listings/${id}`, "PATCH", data, onProgress),
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
