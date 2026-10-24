import { distance, type Listing } from "./api";
export type Origin = [number, number];
export type MapBounds = {
  south: number;
  north: number;
  west: number;
  east: number;
};
export type StoreGroup = {
  key: string;
  storeId: number | null;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  items: Listing[];
  minPrice: number;
  maxPrice: number;
};
export function validCoordinates(lat: number, lng: number) {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}
export function eligible(item: Listing, now: number) {
  return (
    item.active &&
    item.stock > 0 &&
    Date.parse(item.pickup_end) > now &&
    (!item.store_id || item.store_summary?.is_open !== false)
  );
}
export function locationDistance(lat: number, lng: number, origin: Origin) {
  return validCoordinates(lat, lng)
    ? `${distance(lat, lng, origin).toFixed(1)} km`
    : "Lokasi belum tersedia";
}
export function discover(
  items: Listing[],
  filters: {
    query: string;
    category: string;
    free: boolean;
    maxPrice: number;
    savedOnly: boolean;
    saved: number[];
    sort: string;
    minStock?: number;
    maxDistance?: number;
    bounds?: MapBounds | null;
  },
  origin: Origin,
  now: number,
) {
  const favorite = new Set(filters.saved);
  const visibleListings = items
    .filter(
      (item) =>
        eligible(item, now) &&
        (!filters.query ||
          `${item.name} ${item.store}`
            .toLowerCase()
            .includes(filters.query.toLowerCase().trim())) &&
        (filters.category === "Semua" || filters.category === item.category) &&
        (!filters.free || item.price === 0) &&
        item.price <= filters.maxPrice &&
        item.stock >= (filters.minStock || 1) &&
        (filters.maxDistance === undefined ||
          (validCoordinates(item.latitude, item.longitude) &&
            distance(item.latitude, item.longitude, origin) <=
              filters.maxDistance)) &&
        (!filters.bounds ||
          (validCoordinates(item.latitude, item.longitude) &&
            item.latitude >= filters.bounds.south &&
            item.latitude <= filters.bounds.north &&
            (filters.bounds.west <= filters.bounds.east
              ? item.longitude >= filters.bounds.west &&
                item.longitude <= filters.bounds.east
              : item.longitude >= filters.bounds.west ||
                item.longitude <= filters.bounds.east))) &&
        (!filters.savedOnly || favorite.has(item.id)),
    )
    .sort((a, b) =>
      filters.sort === "price"
        ? a.price - b.price
        : filters.sort === "pickup"
          ? Date.parse(a.pickup_end) - Date.parse(b.pickup_end)
          : (validCoordinates(a.latitude, a.longitude)
              ? distance(a.latitude, a.longitude, origin)
              : Infinity) -
            (validCoordinates(b.latitude, b.longitude)
              ? distance(b.latitude, b.longitude, origin)
              : Infinity),
    );
  const groups = new Map<string, StoreGroup>();
  const unmappableListings: Listing[] = [];
  for (const item of visibleListings) {
    if (!validCoordinates(item.latitude, item.longitude)) {
      unmappableListings.push(item);
      continue;
    }
    const storeId = item.store_id ?? null;
    const key =
      storeId === null ? `legacy-listing:${item.id}` : `store:${storeId}`;
    const group = groups.get(key);
    if (group) {
      group.items.push(item);
      group.minPrice = Math.min(group.minPrice, item.price);
      group.maxPrice = Math.max(group.maxPrice, item.price);
    } else
      groups.set(key, {
        key,
        storeId,
        name: item.store_summary?.name || item.store,
        address: item.store_summary?.address || item.address,
        latitude: item.latitude,
        longitude: item.longitude,
        items: [item],
        minPrice: item.price,
        maxPrice: item.price,
      });
  }
  return {
    visibleListings,
    storeGroups: [...groups.values()],
    unmappableListings,
  };
}

export function storePriceRange(group: StoreGroup) {
  const price = (n: number) => new Intl.NumberFormat("id-ID").format(n);
  return group.minPrice === group.maxPrice
    ? group.minPrice === 0
      ? "Gratis"
      : `Rp${price(group.minPrice)}`
    : `${group.minPrice === 0 ? "Gratis" : `Rp${price(group.minPrice)}`}–${price(group.maxPrice)}`;
}
