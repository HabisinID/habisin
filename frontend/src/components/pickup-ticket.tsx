"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { ArrowLeft, Check, MapPin } from "lucide-react";
import { rupiah, type Reservation } from "@/lib/api";
import {
  clock,
  formatCode,
  orderApi,
  statusLabel,
  timeLeft,
} from "@/lib/orders";
import { OrderSkeleton } from "./order-shell";
import { errorClass } from "./store-ui";

// A full sumbu bar means four hours or more left to pick up.
const FUSE_SPAN = 4 * 60 * 60000;
const URGENT_SPAN = 30 * 60000;
// Picks up the cashier's "Tandai sudah diambil" while the ticket stays open.
const REFRESH_EVERY = 15000;

// Modul 8: the buyer's pickup ticket. The receipt on the left is what the
// cashier reads (QR or code); the right side is for the buyer.
export default function PickupTicket({ id }: { id: string }) {
  const router = useRouter();
  const [order, setOrder] = useState<Reservation | null>(null);
  const [printed, setPrinted] = useState(0);
  const [now, setNow] = useState(0);
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    const load = () =>
      orderApi
        .get(id)
        .then((data) => {
          if (!active) return;
          // An unpaid order has no ticket yet: finish paying first.
          if (data.status === "pending")
            return router.replace(`/pesanan/${id}`);
          setOrder(data);
          setNow(Date.now());
          setPrinted((first) => first || Date.now());
        })
        .catch((e) => active && setError(e.message));
    load();
    const refresh = setInterval(load, REFRESH_EVERY);
    const tick = setInterval(() => setNow(Date.now()), 30000);
    window.addEventListener("focus", load);
    return () => {
      active = false;
      clearInterval(refresh);
      clearInterval(tick);
      window.removeEventListener("focus", load);
    };
  }, [id, router]);

  if (!order)
    return error ? (
      <main className="mx-auto max-w-[1440px] px-16 py-10 tablet:px-4">
        <p className={errorClass} role="alert">
          {error}
        </p>
      </main>
    ) : (
      <main className="mx-auto max-w-[1440px] px-16 py-10 tablet:px-4">
        <OrderSkeleton label="Memuat tiket" />
      </main>
    );

  async function cancel() {
    setBusy(true);
    setError("");
    try {
      setOrder(await orderApi.cancel(order!.id));
      setConfirming(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const { listing } = order;
  const paid = order.status === "paid";
  const used = order.status === "picked_up";
  const left = Date.parse(listing.pickup_end) - now;
  const urgent = paid && left < URGENT_SPAN;
  const canCancel = paid && now < Date.parse(order.cancel_until);
  const saved = (listing.original_price - listing.price) * order.quantity;
  const route = `https://www.google.com/maps/dir/?api=1&destination=${listing.latitude},${listing.longitude}`;
  const timeline: [string, string | null][] = [
    ["Dibayar", order.paid_at],
    ["Toko buka", listing.pickup_start],
    ["Batas batal", order.cancel_until],
    ["Batas ambil", listing.pickup_end],
  ];

  return (
    <main className="mx-auto grid max-w-[1440px] grid-cols-[440px_minmax(0,1fr)] items-start gap-16 px-16 py-10 compact:grid-cols-1 compact:gap-8 compact:px-8 tablet:px-4 tablet:py-6">
      <section
        aria-label="Struk ambil"
        className="rounded-2xl border border-line bg-surface p-8 tablet:p-5"
      >
        <p className="font-mono text-xs tracking-widest text-muted">
          HABISIN · STRUK AMBIL
        </p>
        <h1 className="mt-3 text-2xl font-bold">{listing.store}</h1>
        <p className="text-sm text-muted">{listing.address}</p>

        <div className="mt-6 border-y border-dashed border-line py-6 text-center">
          <p className="font-mono text-xs tracking-widest text-muted">
            KODE AMBIL
          </p>
          <div className="mt-3 grid place-items-center">
            {used ? (
              <div className="grid h-[168px] w-[168px] place-items-center rounded-xl border-2 border-dashed border-success text-success">
                <span className="flex flex-col items-center gap-2 font-bold">
                  <Check size={32} />
                  Sudah dipakai
                </span>
              </div>
            ) : paid ? (
              // White behind the QR so scanners read it in the dark theme too.
              <div className="rounded-xl bg-white p-3">
                <QRCodeSVG
                  value={order.code}
                  size={144}
                  role="img"
                  aria-label={`QR kode ambil ${formatCode(order.code)}`}
                />
              </div>
            ) : null}
          </div>
          <p
            data-testid="ticket-code"
            className={`mt-4 font-mono text-4xl font-bold ${used || !paid ? "text-muted line-through" : ""}`}
          >
            {formatCode(order.code)}
          </p>
          <p className="mt-2 font-mono text-sm">
            Ambil {clock(listing.pickup_start)} – {clock(listing.pickup_end)}
          </p>
        </div>

        <dl className="mt-6 grid grid-cols-[1fr_auto] gap-y-2 text-sm">
          <dt className="text-muted">{listing.name}</dt>
          <dd className="font-semibold">{order.quantity} porsi</dd>
          <dt className="text-muted">
            {order.total ? "Dibayar (simulasi)" : "Harga"}
          </dt>
          <dd data-testid="ticket-price" className="font-semibold">
            {rupiah(order.total)}
          </dd>
          {saved > 0 && order.total > 0 && (
            <>
              <dt className="text-muted">Hemat</dt>
              <dd className="font-semibold text-success">{rupiah(saved)}</dd>
            </>
          )}
          <dt className="text-muted">No. pesanan</dt>
          <dd className="font-mono">HBS-{order.id}</dd>
        </dl>
        <p className="mt-6 text-center font-mono text-xs text-muted">
          Dicetak {clock(new Date(printed).toISOString())} WIB
        </p>
      </section>

      <section className="min-w-0">
        <Link
          href="/pesanan"
          className="inline-flex items-center gap-2 text-sm font-bold text-brand"
        >
          <ArrowLeft size={16} /> Pesanan saya
        </Link>

        <div
          data-testid="ticket-status"
          data-urgent={urgent}
          className={`mt-6 rounded-2xl p-6 ${urgent ? "bg-urgency-tint text-urgency-text" : "bg-inverse text-on-inverse"}`}
        >
          <p className="font-mono text-xs tracking-widest uppercase opacity-80">
            {statusLabel[order.status]}
          </p>
          <p className="mt-2 text-3xl font-bold tablet:text-2xl">
            {used && order.picked_up_at
              ? `Diambil pukul ${clock(order.picked_up_at)}`
              : `Ambil sebelum ${clock(listing.pickup_end)}`}
          </p>
          {paid && (
            <>
              <p className="mt-1 opacity-90">
                {timeLeft(listing.pickup_end, now) || "Batas ambil sudah lewat"}
              </p>
              <div className="mt-4 h-[3px] rounded-full bg-current/20">
                <div
                  className={`h-full rounded-full ${urgent ? "bg-urgency" : "bg-inverse-accent"}`}
                  style={{
                    width: `${Math.max(0, Math.min(1, left / FUSE_SPAN)) * 100}%`,
                  }}
                />
              </div>
            </>
          )}
        </div>

        <ol
          aria-label="Linimasa pesanan"
          className="mt-6 grid grid-cols-4 gap-3 tablet:grid-cols-2"
        >
          {timeline.map(([label, at]) => {
            const done = at !== null && Date.parse(at) <= now;
            return (
              <li
                key={label}
                className={`border-t-[3px] pt-2 ${done ? "border-brand" : "border-line"}`}
              >
                <p className="text-xs text-muted">{label}</p>
                <p className="font-mono font-bold">{at ? clock(at) : "–"}</p>
              </li>
            );
          })}
        </ol>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-control border border-line bg-surface p-5">
          <div className="flex min-w-0 items-start gap-3">
            <MapPin size={20} className="mt-0.5 shrink-0 text-brand" />
            <div className="min-w-0">
              <p className="font-bold">{listing.store}</p>
              <p className="text-sm text-muted">{listing.address}</p>
            </div>
          </div>
          <a
            href={route}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center rounded-control border border-brand px-4 font-bold text-brand hover:bg-surface-2"
          >
            Buka rute
            <span className="sr-only"> (tab baru)</span>
          </a>
        </div>

        {error && (
          <p className={`${errorClass} mt-6`} role="alert">
            {error}
          </p>
        )}

        {paid && (
          <div className="mt-6 text-sm">
            {!canCancel ? (
              <p className="text-muted">
                Pembatalan ditutup {clock(order.cancel_until)}
              </p>
            ) : confirming ? (
              <div className="rounded-control border border-error/40 bg-error-tint p-4 text-error">
                <p>
                  Bisa dibatalkan sampai {clock(order.cancel_until)} · 30 menit
                  sebelum batas ambil. Porsi dikembalikan ke toko.
                </p>
                <div className="mt-3 flex gap-3">
                  <button
                    className="min-h-11 rounded-field bg-error px-4 font-bold text-on-error"
                    disabled={busy}
                    onClick={cancel}
                  >
                    Ya, batalkan
                  </button>
                  <button
                    className="min-h-11 px-3 font-semibold"
                    onClick={() => setConfirming(false)}
                  >
                    Tidak
                  </button>
                </div>
              </div>
            ) : (
              <button
                className="min-h-11 font-semibold text-error underline-offset-4 hover:underline"
                onClick={() => setConfirming(true)}
              >
                Batalkan pesanan
              </button>
            )}
          </div>
        )}
      </section>
    </main>
  );
}
