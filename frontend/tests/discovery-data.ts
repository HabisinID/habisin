import type { Listing } from "../src/lib/api";
export const origin: [number, number] = [-6.366, 106.829];
export function food(
  id: number,
  storeId: number | null,
  changes: Partial<Listing> = {},
): Listing {
  return {
    id,
    name: `Food ${id}`,
    store: "Toko sama <b>aman</b>",
    category: "Roti & kue",
    description: "Food today",
    address: `Alamat ${storeId}`,
    price: 5000,
    original_price: 10000,
    stock: 4,
    image: "https://images.unsplash.com/test.jpg",
    latitude: origin[0],
    longitude: origin[1],
    pickup_start: new Date(Date.now() - 60000).toISOString(),
    pickup_end: new Date(Date.now() + 3600000).toISOString(),
    active: true,
    store_id: storeId,
    store_summary:
      storeId === null
        ? null
        : {
            id: storeId,
            name: "Toko sama <b>aman</b>",
            address: `Alamat ${storeId}`,
            latitude: origin[0],
            longitude: origin[1],
            is_open: true,
          },
    ...changes,
  };
}
export const baseFilters = {
  query: "",
  category: "Semua",
  free: false,
  maxPrice: 60000,
  savedOnly: false,
  saved: [],
  sort: "near",
};
export const store = (id: number) => ({
  id,
  name: "Toko sama <b>aman</b>",
  description: "Dapur pilihan",
  address: `Alamat ${id}`,
  latitude: origin[0],
  longitude: origin[1],
  is_open: true,
  opening_time: "08:00",
  closing_time: "22:00",
  created_at: "2026-10-23",
  updated_at: "2026-10-23",
});
