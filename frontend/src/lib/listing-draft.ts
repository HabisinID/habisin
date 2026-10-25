import type { Listing } from "./api";
export type ListingFields = {
  name: string;
  category: string;
  description: string;
  store_id: string;
  price: string;
  original_price: string;
  stock: string;
  free: boolean;
  pickup_start: string;
  pickup_end: string;
  prepared_at: string;
  packaging: string;
  storage_notes: string;
  allergens: string;
  buyer_notes: string;
};
export type StoredPhoto = {
  mode: "url" | "upload";
  url: string;
  file: File | null;
};
export type ListingDraft = {
  version: 1;
  fields: ListingFields;
  photo: StoredPhoto;
  savedAt: string;
};
export function wibDateTime(value: string) {
  return new Date(value)
    .toLocaleString("sv-SE", { timeZone: "Asia/Jakarta" })
    .replace(" ", "T")
    .slice(0, 16);
}
export function newListingFields(
  item: Listing | null,
  now = new Date(),
): ListingFields {
  return {
    name: item?.name || "",
    category: item?.category || "Roti & kue",
    description: item?.description || "",
    store_id: item?.store_id ? String(item.store_id) : "",
    price: item?.price ? String(item.price) : "",
    original_price: item?.original_price ? String(item.original_price) : "",
    stock: String(item?.stock ?? 1),
    free: item?.price === 0,
    pickup_start: wibDateTime(item?.pickup_start || now.toISOString()),
    pickup_end: wibDateTime(
      item?.pickup_end || new Date(now.getTime() + 7200000).toISOString(),
    ),
    prepared_at: item?.prepared_at ? wibDateTime(item.prepared_at) : "",
    packaging: item?.packaging || "",
    storage_notes: item?.storage_notes || "",
    allergens: item?.allergens || "",
    buyer_notes: item?.buyer_notes || "",
  };
}
export function draftKey(userId: number, itemId?: number) {
  return `${userId}:${itemId ?? "new"}`;
}
async function database() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("habisin-listing-drafts", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("drafts");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(
        new Error(
          "Penyimpanan draf lokal tidak tersedia. Data form tetap ada; coba lagi atau tayangkan langsung.",
        ),
      );
    request.onblocked = () =>
      reject(
        new Error(
          "Penyimpanan draf sedang dipakai tab lain. Tutup tab lama dan coba lagi.",
        ),
      );
  });
}
async function operation<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
) {
  const db = await database();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction("drafts", mode);
      let result: T;
      const req = run(tx.objectStore("drafts"));
      req.onsuccess = () => {
        result = req.result;
      };
      tx.oncomplete = () => resolve(result);
      tx.onerror = () =>
        reject(
          new Error(
            "Draf lokal gagal disimpan atau dibaca. Data form tetap ada; coba lagi.",
          ),
        );
      tx.onabort = () =>
        reject(new Error("Penyimpanan draf dibatalkan. Data form tetap ada."));
    });
  } finally {
    db.close();
  }
}
export const listingDrafts = {
  load: (key: string) =>
    operation("readonly", (store) => store.get(key)).then((value) => {
      if (!value) return null;
      if (
        value.version !== 1 ||
        !value.fields ||
        Object.entries(newListingFields(null)).some(
          ([field, initial]) => typeof value.fields[field] !== typeof initial,
        ) ||
        !value.photo ||
        !["url", "upload"].includes(value.photo.mode) ||
        typeof value.photo.url !== "string" ||
        (value.photo.file !== null && !(value.photo.file instanceof File)) ||
        typeof value.savedAt !== "string" ||
        !Number.isFinite(Date.parse(value.savedAt))
      )
        throw new Error(
          "Format draf lokal tidak dikenali. Buat draf baru untuk melanjutkan.",
        );
      return value as ListingDraft;
    }),
  save: (key: string, value: ListingDraft) =>
    operation("readwrite", (store) => store.put(value, key)),
  remove: (key: string) => operation("readwrite", (store) => store.delete(key)),
};
