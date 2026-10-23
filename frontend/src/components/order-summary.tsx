"use client";
import { useState } from "react";
import { ArrowRight, Clock3, MapPin, Navigation, Pencil } from "lucide-react";
import Modal from "./modal";
import { distance, pickup, rupiah, type Reservation } from "@/lib/api";
import { orderApi, statusLabel } from "@/lib/orders";
import {
  errorClass,
  fieldClass,
  primaryButton,
  secondaryButton,
} from "./store-ui";

export default function OrderSummary({
  order,
  origin,
  onChange,
  onPaid,
  onCancelled,
  onClose,
}: {
  order: Reservation;
  origin: [number, number];
  onChange: (order: Reservation) => void;
  onPaid: (order: Reservation) => void;
  onCancelled: (order: Reservation) => void;
  onClose: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const { listing } = order;
  // Stock already held by this order can be kept when editing.
  const maxQuantity = Math.min(10, listing.stock + order.quantity);
  const km = distance(listing.latitude, listing.longitude, origin);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const quantity = Number(data.get("quantity"));
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > maxQuantity) {
      setError(`Pilih 1–${maxQuantity} porsi.`);
      return;
    }
    run(async () => {
      onChange(
        await orderApi.update(order.id, {
          quantity,
          note: String(data.get("note") ?? ""),
        }),
      );
      setEditing(false);
    });
  }

  return (
    <Modal
      title="Ringkasan pesanan"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <div className="space-y-5 text-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs text-muted">{listing.store}</p>
            <h3 className="mt-1 text-lg font-bold">{listing.name}</h3>
          </div>
          <span className="shrink-0 rounded-full bg-[#fff5d9] px-3 py-1 text-xs font-semibold text-[#8b763e]">
            {statusLabel[order.status]}
          </span>
        </div>

        <div className="space-y-2 rounded-lg bg-light p-4 text-xs text-[#6f8062]">
          <p className="flex items-center gap-2">
            <MapPin size={16} />
            {listing.address}
          </p>
          <p className="flex items-center gap-2">
            <Navigation size={16} />
            {km.toLocaleString("id-ID", { maximumFractionDigits: 1 })} km dari
            lokasi pencarian
          </p>
          <p className="flex items-center gap-2">
            <Clock3 size={16} />
            Ambil {pickup(listing.pickup_start)}–{pickup(listing.pickup_end)}{" "}
            WIB
          </p>
        </div>

        {editing ? (
          <form className="space-y-4" onSubmit={save}>
            <label className="block space-y-2 font-semibold">
              Jumlah porsi
              <input
                className={fieldClass}
                name="quantity"
                type="number"
                min={1}
                max={maxQuantity}
                defaultValue={order.quantity}
                required
              />
            </label>
            <label className="block space-y-2 font-semibold">
              Catatan pengambilan
              <textarea
                className={`${fieldClass} min-h-20 resize-y font-normal`}
                name="note"
                maxLength={200}
                defaultValue={order.note}
              />
            </label>
            <div className="flex flex-wrap gap-3">
              <button className={primaryButton} disabled={busy}>
                {busy ? "Menyimpan…" : "Simpan perubahan"}
              </button>
              <button
                type="button"
                className={secondaryButton}
                onClick={() => {
                  setEditing(false);
                  setError("");
                }}
                disabled={busy}
              >
                Batal
              </button>
            </div>
          </form>
        ) : (
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2">
            <dt className="text-muted">Jumlah porsi</dt>
            <dd>{order.quantity} porsi</dd>
            <dt className="text-muted">Catatan pengambilan</dt>
            <dd className="break-words">
              {order.note || <span className="text-muted">Tidak ada</span>}
            </dd>
          </dl>
        )}

        <div className="flex items-center justify-between border-t border-line pt-4">
          <span>Total</span>
          <strong className="text-xl text-brand" data-testid="order-total">
            {rupiah(order.total)}
          </strong>
        </div>

        {error && (
          <p className={errorClass} role="alert">
            {error}
          </p>
        )}

        {order.status === "pending" && !editing && (
          <div className="space-y-3">
            <button
              className={`${primaryButton} w-full`}
              disabled={busy}
              onClick={() =>
                run(async () => onPaid(await orderApi.pay(order.id)))
              }
            >
              {busy
                ? "Memproses…"
                : listing.price === 0
                  ? "Klaim donasi gratis"
                  : "Simulasikan pembayaran berhasil"}
              <ArrowRight size={18} />
            </button>
            <div className="flex items-center justify-between">
              <button
                className="inline-flex items-center gap-2 text-xs font-semibold text-brand"
                disabled={busy}
                onClick={() => setEditing(true)}
              >
                <Pencil size={14} />
                Ubah pesanan
              </button>
              <button
                className="text-xs text-[#ac7462]"
                disabled={busy}
                onClick={() =>
                  run(async () => onCancelled(await orderApi.cancel(order.id)))
                }
              >
                Batalkan pesanan
              </button>
            </div>
            <p className="text-[10px] leading-relaxed text-muted">
              Simulasi pembayaran demo. Tidak ada tagihan atau transaksi uang
              sungguhan.
            </p>
          </div>
        )}
      </div>
    </Modal>
  );
}
