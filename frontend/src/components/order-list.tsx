"use client";
import { useState } from "react";
import { ShoppingBag, Ticket } from "lucide-react";
import Modal from "./modal";
import { pickup, rupiah, type Listing, type Reservation } from "@/lib/api";
import { orderApi, statusLabel } from "@/lib/orders";
import { errorClass, primaryButton } from "./store-ui";

const labelClass: Record<Reservation["status"], string> = {
  pending: "bg-[#fff5d9] text-[#8b763e]",
  paid: "bg-[#eaf3e2] text-[#618348]",
  picked_up: "bg-light text-brand",
  cancelled: "bg-[#f1e8e4] text-[#9a7d6f]",
  expired: "bg-[#e9ecef] text-[#5c6670]",
};

export default function OrderList({
  orders,
  setOrders,
  loading,
  loadError,
  onListing,
  onResume,
  onTicket,
  onClose,
}: {
  orders: Reservation[];
  setOrders: React.Dispatch<React.SetStateAction<Reservation[]>>;
  loading: boolean;
  loadError: string;
  onListing: (listing: Listing) => void;
  onResume: (order: Reservation) => void;
  onTicket: (order: Reservation) => void;
  onClose: () => void;
}) {
  const [error, setError] = useState("");
  const [inFlight, setInFlight] = useState<number[]>([]);

  // Optimistic update: show the result immediately, then confirm with the
  // server; restore only the affected order if the server refuses.
  async function optimistic(
    order: Reservation,
    preview: (current: Reservation[]) => Reservation[],
    request: () => Promise<void>,
    rollback: (current: Reservation[]) => Reservation[],
  ) {
    setError("");
    setInFlight((ids) => [...ids, order.id]);
    setOrders(preview);
    try {
      await request();
    } catch (e) {
      setOrders(rollback);
      setError((e as Error).message);
    } finally {
      setInFlight((ids) => ids.filter((id) => id !== order.id));
    }
  }

  const replace = (order: Reservation) => (current: Reservation[]) =>
    current.map((item) => (item.id === order.id ? order : item));

  function cancel(order: Reservation) {
    optimistic(
      order,
      replace({ ...order, status: "cancelled" }),
      async () => {
        const updated = await orderApi.cancel(order.id);
        setOrders(replace(updated));
        onListing(updated.listing);
      },
      replace(order),
    );
  }

  function remove(order: Reservation) {
    const index = orders.findIndex((item) => item.id === order.id);
    optimistic(
      order,
      (current) => current.filter((item) => item.id !== order.id),
      () => orderApi.remove(order.id),
      (current) => [...current.slice(0, index), order, ...current.slice(index)],
    );
  }

  return (
    <Modal title="Pesanan saya" onClose={onClose}>
      {loading ? (
        <p className="text-sm text-muted" role="status">
          Memuat pesanan…
        </p>
      ) : orders.length === 0 && !error ? (
        <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-[#d6dfca] bg-[#f2f5ec] px-5 py-12 text-center text-[#69815e]">
          <ShoppingBag size={35} />
          <h3 className="text-lg font-bold">
            Petualangan enakmu dimulai di sini.
          </h3>
          <p className="text-xs text-[#849477]">
            Belum ada pesanan. Yuk, selamatkan porsi pertamamu.
          </p>
          <button className={primaryButton} onClick={onClose}>
            Jelajahi makanan
          </button>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {orders.map((order) => {
            const busy = inFlight.includes(order.id);
            return (
              <li
                className="order-item rounded-lg border border-[#dfe6d6] bg-white p-4 text-xs"
                key={order.id}
              >
                <div className="flex items-center justify-between gap-3 text-sm">
                  <strong>{order.listing.name}</strong>
                  <span
                    className={`rounded px-2 py-1 text-[10px] font-semibold ${labelClass[order.status]}`}
                  >
                    {statusLabel[order.status]}
                  </span>
                </div>
                <p className="my-2 text-[#8a967e]">
                  {order.quantity} porsi · {rupiah(order.total)} ·{" "}
                  {order.listing.store}
                </p>
                {order.note && (
                  <p className="mb-2 break-words text-[#8a967e]">
                    Catatan: {order.note}
                  </p>
                )}
                <small className="text-[10px] text-[#8a967e]">
                  Ambil sebelum {pickup(order.listing.pickup_end)} WIB
                </small>
                <div className="mt-2 flex items-center justify-between gap-3">
                  {order.status === "pending" && (
                    <button
                      className="text-xs font-semibold text-brand"
                      disabled={busy}
                      onClick={() => onResume(order)}
                    >
                      Lanjutkan pembayaran
                    </button>
                  )}
                  {order.status === "paid" && (
                    <button
                      className="inline-flex items-center gap-2 text-xs font-semibold text-brand"
                      disabled={busy}
                      onClick={() => onTicket(order)}
                    >
                      Tiket {order.code}
                      <Ticket size={15} />
                    </button>
                  )}
                  {order.status === "pending" || order.status === "paid" ? (
                    <button
                      className="ml-auto p-2 text-[11px] text-[#ac7462]"
                      disabled={busy}
                      onClick={() => cancel(order)}
                    >
                      Batalkan
                    </button>
                  ) : (
                    <button
                      className="ml-auto p-2 text-[11px] text-[#8a967e]"
                      disabled={busy}
                      onClick={() => remove(order)}
                    >
                      Hapus dari riwayat
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {(error || loadError) && (
        <p className={`${errorClass} mt-4`} role="alert">
          {error || loadError}
        </p>
      )}
    </Modal>
  );
}
