"use client";
import { useState } from "react";
import { ArrowLeft, MapPin, Clock3 } from "lucide-react";
import { pickup, rupiah, type Reservation } from "@/lib/api";
import { URGENT_WINDOW } from "@/lib/listing-time";
import { designFont } from "@/lib/design-font";
import s from "./workspace.module.css";
export default function BuyerTicket({
  order,
  now,
  busy,
  error,
  onClose,
  onOrders,
  onCancel,
}: {
  order: Reservation;
  now: number;
  busy: boolean;
  error: string;
  onClose: () => void;
  onOrders: () => void;
  onCancel: () => void;
}) {
  const [confirm, setConfirm] = useState(false);
  const item = order.listing;
  const expired = Date.parse(item.pickup_end) <= now;
  const cancelled = order.status === "cancelled";
  const urgent = Date.parse(item.pickup_end) - now < URGENT_WINDOW;
  const canCancel = !cancelled && !urgent && order.can_cancel !== false;
  return (
    <section
      className={`${s.ticketPage} ${designFont.className}`}
      aria-label="Tiket pengambilan"
    >
      <div className={`ticket ${s.receipt}`}>
        <h2 className="sr-only">Makananmu sudah dipesan!</h2>
        <p className={s.eyebrow}>HABISIN · STRUK AMBIL</p>
        <h2>{item.store}</h2>
        <p>{item.address}</p>
        <div className={s.claim}>
          <p>KODE PENGAMBILAN</p>
          <strong>{order.code}</strong>
          <p>Tunjukkan 5 karakter ini saat mengambil makanan.</p>
          <small>QR dan verifikasi kasir menyusul.</small>
        </div>
        <p className={s.eyebrow}>
          AMBIL ·{" "}
          {new Date(item.pickup_end).toLocaleDateString("id-ID", {
            timeZone: "Asia/Jakarta",
            weekday: "long",
            day: "numeric",
            month: "short",
          })}
        </p>
        <h2 className={s.mono}>
          {pickup(item.pickup_start)} – {pickup(item.pickup_end)}
        </h2>
        <h3>{item.name}</h3>
        <dl className={s.receiptLines}>
          <div>
            <dt>Porsi</dt>
            <dd>{order.quantity} porsi</dd>
          </div>
          <div>
            <dt>{item.price === 0 ? "Donasi" : "Dibayar (simulasi)"}</dt>
            <dd>{rupiah(order.total)}</dd>
          </div>
          <div>
            <dt>Hemat</dt>
            <dd>
              {rupiah(
                Math.max(0, item.original_price - item.price) * order.quantity,
              )}
            </dd>
          </div>
          <div>
            <dt>No. pesanan</dt>
            <dd>HBS-{order.id}</dd>
          </div>
        </dl>
        <small>
          Dipesan{" "}
          {new Date(order.created_at).toLocaleString("id-ID", {
            timeZone: "Asia/Jakarta",
          })}{" "}
          WIB
        </small>
      </div>
      <div className={s.ticketInfo}>
        <button className={s.textButton} onClick={onClose}>
          <ArrowLeft size={16} /> Kembali
        </button>
        <button className={s.textButton} onClick={onOrders}>
          Lihat pesanan saya
        </button>
        <span className={s.badge}>
          {cancelled
            ? "Dibatalkan"
            : expired
              ? "Kedaluwarsa"
              : "Aktif · sudah dibayar (simulasi)"}
        </span>
        <h1 className={urgent ? s.error : undefined}>
          {cancelled
            ? "Pesanan dibatalkan"
            : expired
              ? "Waktu pengambilan berakhir"
              : `Ambil sebelum ${pickup(item.pickup_end)}`}
        </h1>
        <p>
          <Clock3 size={17} />{" "}
          {cancelled
            ? "Stok telah dikembalikan sesuai hasil server."
            : "Pesanan disimpan sampai batas pengambilan. Belum ditandai selesai diambil."}
        </p>
        <section className={s.ticketLocation}>
          <p className={s.eyebrow}>LOKASI AMBIL</p>
          <h2>{item.store}</h2>
          <p>
            <MapPin size={16} /> {item.address}
          </p>
          <a
            className={s.textButton}
            href={`https://www.openstreetmap.org/directions?to=${item.latitude}%2C${item.longitude}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Buka rute ↗
          </a>
          <small>Terbuka di aplikasi peta, tab baru.</small>
        </section>
        {cancelled && order.cancellation_note && (
          <p className={s.status}>
            Alasan pembatalan mitra: {order.cancellation_note}
          </p>
        )}
        {!cancelled && (
          <section className={s.cancellation}>
            {confirm && canCancel ? (
              <>
                <h2>Batalkan pesanan ini?</h2>
                <p>Porsi akan dikembalikan ke stok toko.</p>
                <div className={s.row}>
                  <button
                    className={s.secondary}
                    disabled={busy}
                    onClick={() => setConfirm(false)}
                  >
                    Tetap simpan tiket
                  </button>
                  <button
                    className={s.danger}
                    disabled={busy}
                    onClick={onCancel}
                  >
                    {busy ? "Membatalkan…" : "Ya, batalkan"}
                  </button>
                </div>
              </>
            ) : (
              <button
                className={s.textButton}
                disabled={busy || !canCancel}
                onClick={() => setConfirm(true)}
              >
                Batalkan pesanan
              </button>
            )}
            <p className={s.muted}>
              {canCancel
                ? "Bisa dibatalkan hingga 30 menit sebelum batas ambil."
                : order.cancellation_reason ||
                  "Tidak bisa dibatalkan: sisa waktu kurang dari 30 menit atau sudah berakhir."}
            </p>
          </section>
        )}
        {error && (
          <p role="alert" className={s.error}>
            {error}
          </p>
        )}
      </div>
    </section>
  );
}
