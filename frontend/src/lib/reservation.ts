import type { Reservation } from "./api";

export function isActiveReservation(order: Reservation, now: number) {
  return (
    order.status === "reserved" && Date.parse(order.listing.pickup_end) > now
  );
}
