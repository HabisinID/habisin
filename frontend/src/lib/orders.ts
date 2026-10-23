import { api, type Reservation } from "./api";

export type OrderStatus = Reservation["status"];

// Must match Reservation.MAX_QUANTITY and NOTE_MAX_LENGTH in the backend.
export const MAX_QUANTITY = 4;
export const NOTE_MAX_LENGTH = 140;

export const statusLabel: Record<OrderStatus, string> = {
  pending: "Menunggu pembayaran",
  paid: "Dipesan",
  picked_up: "Sudah diambil",
  cancelled: "Dibatalkan",
};

// Pending and paid orders still hold stock; the others are history.
export const isActive = (order: Reservation) =>
  order.status === "pending" || order.status === "paid";

export const orderApi = {
  list: () => api<Reservation[]>("reservations"),
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
