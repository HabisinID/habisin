import { api, distance, type Reservation } from "./api";

export type OrderStatus = Reservation["status"];

// Must match Reservation.MAX_QUANTITY and NOTE_MAX_LENGTH in the backend.
export const MAX_QUANTITY = 4;
export const NOTE_MAX_LENGTH = 140;
// The home page searches around Beji, Depok until the buyer shares a location.
export const DEFAULT_ORIGIN: [number, number] = [-6.366, 106.829];

// Labels follow the "Arti status" legend in the design.
export const statusLabel: Record<OrderStatus, string> = {
  pending: "Menunggu pembayaran",
  paid: "Aktif",
  picked_up: "Selesai diambil",
  cancelled: "Dibatalkan",
  expired: "Kedaluwarsa",
};

// Pending and paid orders still hold stock; the others are history.
export const isActive = (order: Reservation) =>
  order.status === "pending" || order.status === "paid";

// "H7K49" is read aloud and typed at the till as two groups: "H7K · 49".
export const formatCode = (code: string) =>
  `${code.slice(0, 3)} · ${code.slice(3)}`;

// "19.30", the way pickup times are written on Indonesian receipts.
export const clock = (date: string) =>
  new Date(date)
    .toLocaleTimeString("id-ID", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Asia/Jakarta",
      hour12: false,
    })
    .replace(":", ".");

// "2 jam 43 menit lagi", or "" once the time has passed.
export function timeLeft(date: string, now: number) {
  const minutes = Math.floor((Date.parse(date) - now) / 60000);
  if (minutes < 0) return "";
  const hours = Math.floor(minutes / 60);
  return `${hours ? `${hours} jam ` : ""}${minutes % 60} menit lagi`;
}

// "450 m" nearby, "1,2 km" further away.
export function distanceLabel(latitude: number, longitude: number) {
  const km = distance(latitude, longitude, DEFAULT_ORIGIN);
  return km < 1
    ? `${Math.round((km * 1000) / 10) * 10} m`
    : `${km.toLocaleString("id-ID", { maximumFractionDigits: 1 })} km`;
}

export const orderApi = {
  list: () => api<Reservation[]>("reservations"),
  get: (id: number | string) => api<Reservation>(`reservations/${id}`),
  create: (listingId: number, quantity: number, note: string) =>
    api<Reservation>("reservations", "POST", {
      listing_id: listingId,
      quantity,
      note,
    }),
  update: (id: number, changes: { quantity?: number; note?: string }) =>
    api<Reservation>(`reservations/${id}`, "PATCH", changes),
  pay: (id: number) => api<Reservation>(`reservations/${id}/pay`, "POST"),
  cancel: (id: number) => api<Reservation>(`reservations/${id}/cancel`, "POST"),
  remove: (id: number) => api<void>(`reservations/${id}`, "DELETE"),
};
