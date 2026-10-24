import type { Reservation } from "./api";
export function isActiveReservation(order: Reservation, now: number) {
  return (
    (order.status === "pending" || order.status === "paid") &&
    Date.parse(order.listing.pickup_end) > now &&
    (order.status !== "pending" || Date.parse(order.pay_before) > now)
  );
}
