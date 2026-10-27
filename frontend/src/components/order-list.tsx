"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ShoppingBag, Ticket } from "lucide-react";
import { rupiah, type Reservation } from "@/lib/api";
import {
  clock,
  formatCode,
  isActive,
  orderApi,
  statusLabel,
  timeLeft,
} from "@/lib/orders";
import { OrderSkeleton } from "./order-shell";
import { OrderFeedbackActions } from "./buyer-feedback";
import { errorClass, primaryButton } from "./store-ui";

const statusBadge: Record<Reservation["status"], string> = {
  pending: "bg-urgency-tint text-urgency-text",
  paid: "bg-yellow text-on-sticker",
  picked_up: "bg-light text-success",
  cancelled: "bg-error-tint text-error",
  expired: "bg-surface-2 text-muted",
};

const legend: [Reservation["status"], string][] = [
  [
    "paid",
    "Sudah dibayar. Tunjukkan kode ke kasir sebelum batas ambil. Bisa dibatalkan sampai 30 menit sebelum batas.",
  ],
  [
    "picked_up",
    "Kasir sudah memverifikasi kodemu. Ulasan bisa dikirim setelahnya.",
  ],
  ["cancelled", "Kamu membatalkan pesanan. Porsi dikembalikan ke toko."],
  ["expired", "Tidak diambil sampai batas ambil. Porsi kembali ke toko."],
];

// Remaining share of the pickup window, drawn as the 3px "sumbu" bar.
function fuse(order: Reservation, now: number) {
  const start = Date.parse(order.listing.pickup_start);
  const end = Date.parse(order.listing.pickup_end);
  return Math.max(0, Math.min(1, (end - now) / Math.max(end - start, 1)));
}

function ActiveCard({
  order,
  now,
  busy,
  onCancel,
}: {
  order: Reservation;
  now: number;
  busy: boolean;
  onCancel: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const { listing } = order;
  const paid = order.status === "paid";
  const cancelClosed = paid && now >= Date.parse(order.cancel_until);
  const urgent = Date.parse(listing.pickup_end) - now < 30 * 60000;
  return (
    <li className="order-card overflow-hidden rounded-2xl bg-inverse text-on-inverse">
      <div className="grid grid-cols-[auto_1fr_auto] items-center gap-8 px-8 py-7 tablet:grid-cols-1 tablet:gap-4 tablet:px-5">
        <div>
          <p className="font-mono text-xs tracking-widest uppercase opacity-80">
            Ambil hari ini
          </p>
          <p className="mt-2 font-mono text-4xl font-bold tablet:text-3xl">
            {clock(listing.pickup_start)} – {clock(listing.pickup_end)}
          </p>
        </div>
        <div className="min-w-0">
          <span
            className={`inline-block rounded-field px-2 py-1 text-xs font-bold ${statusBadge[order.status]}`}
          >
            {statusLabel[order.status]}
          </span>
          <h3 className="mt-2 text-2xl font-bold">{listing.store}</h3>
          <p className="mt-1 text-sm opacity-80">
            {listing.name} · {order.quantity} porsi · {rupiah(order.total)}
          </p>
        </div>
        <div className="border-l border-on-inverse/20 pl-8 text-right tablet:border-l-0 tablet:pl-0 tablet:text-left">
          {paid ? (
            <>
              <p className="font-mono text-xs tracking-widest uppercase opacity-80">
                Kode
              </p>
              <p
                className="mt-1 font-mono text-4xl font-bold text-inverse-accent"
                data-testid="ticket-code"
              >
                {formatCode(order.code)}
              </p>
            </>
          ) : (
            <>
              <p className="text-sm opacity-80">
                Bayar sebelum {clock(order.pay_before)}
              </p>
              <Link
                href={`/pesanan/${order.id}`}
                className="mt-2 inline-flex min-h-11 items-center rounded-control bg-yellow px-4 font-bold text-on-sticker"
              >
                Lanjutkan pembayaran
              </Link>
            </>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-on-inverse/15 px-8 py-3 text-sm tablet:px-5">
        <span className="opacity-80">
          Ambil sebelum {clock(listing.pickup_end)}
          {timeLeft(listing.pickup_end, now) &&
            ` · ${timeLeft(listing.pickup_end, now)}`}
        </span>
        {cancelClosed ? (
          <span className="opacity-80">
            Pembatalan ditutup {clock(order.cancel_until)}
          </span>
        ) : confirming ? (
          <span className="flex flex-wrap items-center gap-3">
            <span>Batalkan pesanan ini? Porsi dikembalikan ke toko.</span>
            <button
              className="rounded-field bg-error px-3 py-1.5 font-bold text-on-error"
              disabled={busy}
              onClick={onCancel}
            >
              Ya, batalkan
            </button>
            <button
              className="px-2 py-1.5 font-semibold"
              onClick={() => setConfirming(false)}
            >
              Tidak
            </button>
          </span>
        ) : (
          <button
            className="font-semibold underline-offset-4 hover:underline"
            disabled={busy}
            onClick={() => setConfirming(true)}
          >
            Batalkan pesanan
          </button>
        )}
      </div>
      <div className="h-[3px] bg-on-inverse/15">
        <div
          className={`h-full ${urgent ? "bg-urgency" : "bg-inverse-accent"}`}
          style={{ width: `${fuse(order, now) * 100}%` }}
        />
      </div>
    </li>
  );
}

function HistoryCard({
  order,
  busy,
  onRemove,
}: {
  order: Reservation;
  busy: boolean;
  onRemove: () => void;
}) {
  return (
    <li className="order-card flex flex-wrap items-center justify-between gap-4 rounded-control border border-line bg-surface px-6 py-5">
      <div className="min-w-0">
        <span
          className={`inline-block rounded-field px-2 py-1 text-xs font-bold ${statusBadge[order.status]}`}
        >
          {statusLabel[order.status]}
        </span>
        <h3 className="mt-2 font-bold">{order.listing.store}</h3>
        <p className="text-sm text-muted">
          {order.listing.name} · {order.quantity} porsi · {rupiah(order.total)}{" "}
          ·{" "}
          {new Date(order.created_at).toLocaleDateString("id-ID", {
            day: "numeric",
            month: "short",
            timeZone: "Asia/Jakarta",
          })}
        </p>
      </div>
      <button
        className="text-sm font-semibold text-muted hover:text-dark"
        disabled={busy}
        onClick={onRemove}
      >
        Hapus dari riwayat
      </button>
      {order.status === "picked_up" && (
        <div className="basis-full border-t border-line pt-4">
          <OrderFeedbackActions order={order} />
        </div>
      )}
    </li>
  );
}

export default function OrderList() {
  const [orders, setOrders] = useState<Reservation[] | null>(null);
  const [tab, setTab] = useState<"active" | "history">("active");
  const [error, setError] = useState("");
  const [inFlight, setInFlight] = useState<number[]>([]);
  const [now, setNow] = useState(0);
  useEffect(() => {
    let active = true;
    orderApi
      .list()
      .then((data) => {
        if (!active) return;
        setOrders(data);
        setNow(Date.now());
      })
      .catch((e) => active && setError(e.message));
    // Pickup countdowns and the sumbu bar re-render once a minute.
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

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
    setOrders((current) => current && preview(current));
    try {
      await request();
    } catch (e) {
      setOrders((current) => current && rollback(current));
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
        setOrders((current) => current && replace(updated)(current));
      },
      replace(order),
    );
  }

  function remove(order: Reservation) {
    const index = orders?.findIndex((item) => item.id === order.id) ?? 0;
    optimistic(
      order,
      (current) => current.filter((item) => item.id !== order.id),
      () => orderApi.remove(order.id),
      (current) => [...current.slice(0, index), order, ...current.slice(index)],
    );
  }

  const active = (orders ?? []).filter(isActive);
  const history = (orders ?? []).filter((order) => !isActive(order));
  const banner = active.find((order) => order.status === "paid");
  const shown = tab === "active" ? active : history;

  return (
    <>
      {banner && (
        <div className="bg-inverse text-on-inverse">
          <div className="mx-auto flex max-w-[1440px] items-center gap-4 px-20 py-3 text-sm compact:px-8 tablet:px-4">
            <Ticket size={20} className="shrink-0 text-inverse-accent" />
            <span className="shrink-0 font-mono font-bold whitespace-nowrap">
              {formatCode(banner.code)}
            </span>
            <span className="truncate opacity-90">
              Ambil sebelum {clock(banner.listing.pickup_end)} ·{" "}
              {banner.listing.store}
              {timeLeft(banner.listing.pickup_end, now) &&
                ` · ${timeLeft(banner.listing.pickup_end, now)}`}
            </span>
          </div>
        </div>
      )}
      <main className="mx-auto grid max-w-[1440px] grid-cols-[minmax(0,1fr)_340px] gap-16 px-20 py-10 compact:grid-cols-1 compact:px-8 tablet:px-4 tablet:py-6">
        <section>
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <h1 className="text-5xl font-bold tracking-tight tablet:text-3xl">
                Pesanan saya
              </h1>
              <p className="mt-2 text-lg text-muted tablet:text-base">
                Pesanan aktif dan riwayat pesananmu.
              </p>
            </div>
            <div
              role="tablist"
              aria-label="Status pesanan"
              className="flex rounded-full bg-surface p-1"
            >
              {(
                [
                  ["active", `Aktif · ${active.length}`],
                  ["history", `Riwayat · ${history.length}`],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  role="tab"
                  aria-selected={tab === key}
                  aria-controls="order-panel"
                  className="min-h-11 rounded-full px-5 font-semibold aria-selected:bg-inverse aria-selected:text-on-inverse"
                  onClick={() => {
                    setTab(key);
                    setError("");
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <p className={`${errorClass} mt-6`} role="alert">
              {error}
            </p>
          )}
          <div id="order-panel" role="tabpanel" className="mt-6">
            {orders === null ? (
              !error && <OrderSkeleton label="Memuat pesanan…" rows />
            ) : shown.length === 0 ? (
              <div className="flex flex-col items-start gap-4 rounded-2xl border border-dashed border-border/60 px-8 py-12">
                <ShoppingBag size={32} className="text-brand" />
                <p className="text-lg font-bold">
                  {tab === "active"
                    ? "Belum ada pesanan aktif."
                    : "Riwayat masih kosong."}
                </p>
                <Link href="/" className={primaryButton}>
                  Cari makanan di dekatmu
                </Link>
              </div>
            ) : (
              <ul className="flex flex-col gap-4">
                {shown.map((order) =>
                  tab === "active" ? (
                    <ActiveCard
                      key={order.id}
                      order={order}
                      now={now}
                      busy={inFlight.includes(order.id)}
                      onCancel={() => cancel(order)}
                    />
                  ) : (
                    <HistoryCard
                      key={order.id}
                      order={order}
                      busy={inFlight.includes(order.id)}
                      onRemove={() => remove(order)}
                    />
                  ),
                )}
              </ul>
            )}
          </div>
          {tab === "active" && (
            <p className="mt-4 text-sm text-muted">
              Pesanan yang selesai diambil, dibatalkan, atau kedaluwarsa pindah
              ke Riwayat.
            </p>
          )}
        </section>

        <aside className="self-start rounded-2xl bg-surface-2 p-6 compact:hidden">
          <h2 className="font-mono text-xs tracking-widest uppercase">
            Arti status
          </h2>
          <dl className="mt-4 space-y-4">
            {legend.map(([status, text]) => (
              <div key={status}>
                <dt>
                  <span
                    className={`inline-block rounded-field px-2 py-1 text-xs font-bold ${statusBadge[status]}`}
                  >
                    {statusLabel[status]}
                  </span>
                </dt>
                <dd className="mt-2 text-sm text-muted">{text}</dd>
              </div>
            ))}
          </dl>
        </aside>
      </main>
    </>
  );
}
