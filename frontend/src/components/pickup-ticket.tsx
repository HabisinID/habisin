"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  ArrowLeft,
  ArrowRight,
  Ban,
  Check,
  ExternalLink,
  Lock,
  Timer,
  WifiOff,
  X,
} from "lucide-react";
import { ApiError, rupiah, type Reservation } from "@/lib/api";
import { clock, formatCode, orderApi, timeLeft } from "@/lib/orders";
import CancellationNotice from "./cancellation-notice";
import { OrderSkeleton } from "./order-shell";
import { errorClass } from "./store-ui";
import TicketReview from "./ticket-review";

const URGENT_SPAN = 30 * 60000;
// Picks up the cashier's "Tandai sudah diambil" while the ticket stays open.
const REFRESH_EVERY = 15000;
// The last paid ticket is kept on the device, so it opens without a signal.
const saved = (id: string) => `habisin-ticket-${id}`;

// "Rabu, 30 Okt" for the receipt's pickup day.
const day = (date: string) =>
  new Date(date).toLocaleDateString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "short",
    timeZone: "Asia/Jakarta",
  });

function heading(order: Reservation) {
  const deadline = clock(order.listing.pickup_end);
  if (order.status === "picked_up" && order.picked_up_at)
    return `Diambil pukul ${clock(order.picked_up_at)}`;
  if (order.status === "cancelled") return "Pesanan dibatalkan";
  if (order.status === "expired") return `Batas ambil ${deadline} sudah lewat`;
  return `Ambil sebelum ${deadline}`;
}

type Step = { label: string; at: string | null; tone?: "now" | "urgent" };

// The design's timeline: past steps filled, the pickup itself in yellow, a
// deadline about to pass in orange, steps still ahead hollow.
function Timeline({ steps, now }: { steps: Step[]; now: number }) {
  const sorted = [...steps].sort(
    (a, b) => Date.parse(a.at ?? "9999") - Date.parse(b.at ?? "9999"),
  );
  return (
    <ol
      aria-label="Linimasa pesanan"
      className="mt-6 grid gap-3"
      style={{
        gridTemplateColumns: `repeat(${sorted.length}, minmax(0, 1fr))`,
      }}
    >
      {sorted.map(({ label, at, tone }, index) => {
        const done = at !== null && Date.parse(at) <= now;
        const next = sorted[index + 1];
        const lineDone =
          next?.at != null && Date.parse(next.at) <= now && tone !== "urgent";
        return (
          <li key={label} className="relative min-w-0">
            {next && (
              <span
                aria-hidden="true"
                className={`absolute top-[7px] left-4 h-0.5 w-[calc(100%-4px)] ${lineDone ? "bg-brand" : "bg-line"}`}
              />
            )}
            <span
              aria-hidden="true"
              className={`relative block h-4 w-4 rounded-full border-2 ${
                tone === "now"
                  ? "border-dark bg-yellow"
                  : tone === "urgent"
                    ? "border-urgency bg-urgency"
                    : done
                      ? "border-brand bg-brand"
                      : "border-border bg-surface"
              }`}
            />
            <p
              className={`mt-2 font-mono font-bold ${tone === "urgent" ? "text-urgency-text" : ""}`}
            >
              {at ? clock(at) : "–"}
            </p>
            <p
              className={`text-xs ${tone === "urgent" ? "font-bold text-urgency-text" : tone === "now" ? "font-bold" : "text-muted"}`}
            >
              {label}
            </p>
          </li>
        );
      })}
    </ol>
  );
}

// One receipt line with a dotted leader, as on a printed struk.
function Line({
  label,
  value,
  testId,
}: {
  label: string;
  value: string;
  testId?: string;
}) {
  return (
    <p className="flex items-baseline gap-2 font-mono text-[13px]">
      <span className="shrink-0">{label}</span>
      <span
        aria-hidden="true"
        className="min-w-4 flex-1 border-b-2 border-dotted border-[#14301f]/25"
      />
      <span data-testid={testId} className="shrink-0 font-bold">
        {value}
      </span>
    </p>
  );
}

// The torn paper edge at the top and bottom of the receipt.
const Edge = ({ flip = false }: { flip?: boolean }) => (
  <div
    aria-hidden="true"
    className={`h-2 bg-[radial-gradient(circle_at_6px_0,transparent_5px,#fff_5.5px)] bg-[length:12px_8px] ${flip ? "" : "rotate-180"}`}
  />
);

// Modul 8: the buyer's pickup ticket. The receipt on the dark panel is what the
// cashier reads (QR or code); the right side is for the buyer.
export default function PickupTicket({ id }: { id: string }) {
  const router = useRouter();
  const [order, setOrder] = useState<Reservation | null>(null);
  const [printed, setPrinted] = useState(0);
  const [now, setNow] = useState(0);
  const [error, setError] = useState("");
  const [offline, setOffline] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  // Only the newest read may update the ticket: refreshes can overlap, and a
  // read started before a cancel must not bring the paid ticket back.
  const latestRead = useRef(0);

  useEffect(() => {
    let active = true;
    const load = () => {
      const read = ++latestRead.current;
      return orderApi
        .get(id)
        .then((data) => {
          if (!active || read !== latestRead.current) return;
          // An unpaid order has no ticket yet: finish paying first.
          if (data.status === "pending")
            return router.replace(`/pesanan/${id}`);
          setOrder(data);
          setError("");
          setOffline(false);
          setNow(Date.now());
          setPrinted((first) => first || Date.now());
          try {
            if (data.status === "paid")
              localStorage.setItem(saved(id), JSON.stringify(data));
            else localStorage.removeItem(saved(id));
          } catch {}
        })
        .catch((e) => {
          if (!active || read !== latestRead.current) return;
          // No connection: show the copy kept on the device, if there is one.
          if (!(e instanceof ApiError)) {
            let copy: Reservation | null = null;
            try {
              copy = JSON.parse(localStorage.getItem(saved(id)) ?? "null");
            } catch {}
            if (copy) {
              setOrder((current) => current ?? copy);
              setOffline(true);
              setNow(Date.now());
              setPrinted((first) => first || Date.parse(copy.paid_at ?? ""));
              return;
            }
          }
          setError(e.message);
        });
    };
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
    latestRead.current++;
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
  const over = order.status === "expired" || order.status === "cancelled";
  const urgent = paid && Date.parse(listing.pickup_end) - now < URGENT_SPAN;
  const canCancel = paid && now < Date.parse(order.cancel_until);
  const savings = (listing.original_price - listing.price) * order.quantity;
  const route = `https://www.google.com/maps/dir/?api=1&destination=${listing.latitude},${listing.longitude}`;
  const portions = `${order.quantity} porsi`;

  const badge = used
    ? "Selesai diambil"
    : order.status === "expired"
      ? "Kedaluwarsa"
      : order.status === "cancelled"
        ? "Dibatalkan"
        : urgent
          ? "Aktif · segera ambil"
          : order.total
            ? "Aktif · sudah dibayar"
            : "Aktif · gratis";
  const steps: Step[] = [
    { label: "Dibayar", at: order.paid_at },
    { label: "Toko mulai melayani", at: listing.pickup_start },
    {
      label: urgent ? "Pembatalan ditutup" : "Batas batal",
      at: order.cancel_until,
    },
    {
      label: urgent
        ? "Batas ambil · segera"
        : order.status === "expired"
          ? "Batas ambil · lewat"
          : "Batas ambil",
      at: listing.pickup_end,
      tone: urgent ? "urgent" : undefined,
    },
  ];
  if (used)
    steps.push({ label: "Diambil", at: order.picked_up_at, tone: "now" });
  const summary = used
    ? `Diserahkan kasir ${listing.store}. Terima kasih sudah menyelamatkan ${portions} dari terbuang.`
    : order.status === "expired"
      ? `Pesanan tidak diambil. ${portions} sudah kembali ke ${listing.store} pukul ${clock(listing.pickup_end)}.`
      : order.status === "cancelled"
        ? `${portions[0].toUpperCase()}${portions.slice(1)} sudah kembali ke ${listing.store}.`
        : urgent
          ? `Kasir menyiapkan pesananmu sampai ${clock(listing.pickup_end)}. Lewat dari itu, porsi kembali ke toko.`
          : `Toko mulai melayani ${clock(listing.pickup_start)}. Pesanan ditahan kasir sampai ${clock(listing.pickup_end)}.`;
  const codeNote = used
    ? `Kode dipakai ${clock(order.picked_up_at!)} dan tidak bisa digunakan lagi.`
    : order.status === "expired"
      ? `Kode kedaluwarsa pukul ${clock(listing.pickup_end)} dan tidak bisa digunakan lagi.`
      : order.status === "cancelled"
        ? "Kode dibatalkan dan tidak bisa digunakan lagi."
        : "Tunjukkan kode atau QR ini ke kasir. Kode hanya bisa dipakai sekali.";

  return (
    <main className="grid min-h-[calc(100vh-65px)] grid-cols-[minmax(0,600px)_minmax(0,1fr)] compact:grid-cols-1">
      {/* The receipt is paper: it stays white on the dark panel in both themes. */}
      <div className="flex justify-center bg-[#14301f] px-12 py-14 compact:px-6 compact:py-8 tablet:px-4">
        <section
          aria-label="Struk ambil"
          className={`w-full max-w-[400px] self-start text-[#14301f] drop-shadow-xl ${over ? "opacity-80" : ""}`}
        >
          <Edge />
          <div className={`px-7 py-6 ${over ? "bg-[#e7ebe6]" : "bg-white"}`}>
            <p className="font-mono text-[11px] tracking-widest text-[#4d6455]">
              HABISIN · STRUK AMBIL
            </p>
            <h2 className="mt-2 text-xl font-bold">{listing.store}</h2>
            <p className="text-sm text-[#4d6455]">{listing.address}</p>

            <p className="mt-5 font-mono text-[11px] tracking-widest text-[#4d6455]">
              KODE AMBIL
            </p>
            <div className="mt-2 flex items-center gap-5 tablet:flex-col tablet:items-start">
              {paid ? (
                <QRCodeSVG
                  value={order.code}
                  size={144}
                  role="img"
                  aria-label={`QR kode ambil ${formatCode(order.code)}`}
                  className="shrink-0"
                />
              ) : (
                <div className="grid h-[144px] w-[144px] shrink-0 place-items-center border border-[#14301f]/20 bg-[#eef3ec] text-center text-xs text-[#4d6455]">
                  <span className="flex flex-col items-center gap-2">
                    {used ? (
                      <Check size={22} aria-hidden="true" />
                    ) : (
                      <Ban size={22} aria-hidden="true" />
                    )}
                    {used ? "Sudah dipakai" : "Tidak berlaku"}
                  </span>
                </div>
              )}
              <div className="min-w-0">
                <p
                  data-testid="ticket-code"
                  className={`font-mono text-4xl font-bold whitespace-nowrap ${paid ? "" : "text-[#4d6455]"}`}
                >
                  {formatCode(order.code)}
                </p>
                <p className="mt-2 text-xs text-[#4d6455]">{codeNote}</p>
              </div>
            </div>

            <hr className="my-5 border-0 border-t-[3px] border-dotted border-[#14301f]" />
            <p className="font-mono text-[11px] tracking-widest text-[#4d6455] uppercase">
              Ambil · {day(listing.pickup_start)}
            </p>
            <p className="font-mono text-3xl font-bold">
              {clock(listing.pickup_start)} – {clock(listing.pickup_end)}
            </p>
            <div className="mt-4 space-y-1.5">
              <Line label={listing.name} value={portions} />
              <Line
                label={order.total ? "Dibayar (simulasi)" : "Harga"}
                value={rupiah(order.total)}
                testId="ticket-price"
              />
              {savings > 0 && order.total > 0 && (
                <Line label="Hemat" value={rupiah(savings)} />
              )}
              <Line label="No. pesanan" value={`HBS-${order.id}`} />
            </div>
            <p className="mt-5 font-mono text-xs text-[#4d6455]">
              Dicetak {clock(new Date(printed).toISOString())} WIB
              {offline && " · Tersimpan di perangkat"}
            </p>
          </div>
          <Edge flip />
        </section>
      </div>

      <section className="min-w-0 px-16 py-12 compact:px-8 tablet:px-4 tablet:py-6">
        <div className="max-w-[720px]">
          <Link
            href="/pesanan"
            className="inline-flex items-center gap-2 text-sm font-bold text-brand"
          >
            <ArrowLeft size={16} /> Pesanan saya
          </Link>

          {offline && (
            <div
              role="status"
              className="mt-6 flex gap-3 rounded-control bg-surface-2 p-4 text-sm"
            >
              <WifiOff
                size={18}
                className="mt-0.5 shrink-0"
                aria-hidden="true"
              />
              <div>
                <p className="font-bold">Tersimpan di perangkat</p>
                <p className="text-muted">
                  Kamu sedang offline. Kode dan QR tetap bisa ditunjukkan ke
                  kasir; status diperbarui saat tersambung lagi.
                </p>
              </div>
            </div>
          )}

          <div
            data-testid="ticket-status"
            data-urgent={urgent}
            className="mt-6"
          >
            <span
              className={`inline-block rounded-field px-3 py-1 text-xs font-bold ${
                urgent
                  ? "bg-urgency-tint text-urgency-text"
                  : over
                    ? "bg-surface-2 text-muted"
                    : "bg-light text-brand"
              }`}
            >
              {badge}
            </span>
            <h1
              className={`mt-3 text-5xl font-bold tracking-tight tablet:text-3xl ${urgent ? "text-urgency-text" : over ? "text-muted" : ""}`}
            >
              {heading(order)}
            </h1>
            {paid && timeLeft(listing.pickup_end, now) && (
              <p
                className={`mt-3 inline-flex items-center gap-1.5 rounded-field px-2.5 py-1 text-xs font-bold ${urgent ? "bg-urgency text-on-sticker" : "bg-light text-brand"}`}
              >
                <Timer size={14} aria-hidden="true" />
                {timeLeft(listing.pickup_end, now)}
              </p>
            )}
          </div>

          <Timeline steps={steps} now={now} />
          <p className="mt-4 text-sm text-muted">{summary}</p>
          {order.status === "cancelled" && (
            <div className="mt-4">
              <CancellationNotice order={order} />
            </div>
          )}

          <div className="mt-6 rounded-control border border-line bg-surface p-5">
            <p className="font-mono text-[11px] tracking-widest text-muted">
              LOKASI AMBIL
            </p>
            <p className="mt-1 font-bold">{listing.store}</p>
            <p className="text-sm text-muted">{listing.address}</p>
            {listing.store_summary?.landmark && (
              <p className="text-sm text-muted">
                Patokan: {listing.store_summary.landmark}
              </p>
            )}
            {paid && (
              <p className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                <a
                  href={route}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-11 items-center gap-1.5 font-bold text-brand underline-offset-4 hover:underline"
                >
                  Buka rute
                  <ExternalLink size={14} aria-hidden="true" />
                  <span className="sr-only"> (tab baru)</span>
                </a>
                <span className="text-xs text-muted">
                  Terbuka di Google Maps, tab baru
                </span>
              </p>
            )}
          </div>

          {error && (
            <p className={`${errorClass} mt-6`} role="alert">
              {error}
            </p>
          )}

          {paid && (
            <div className="mt-6 text-sm">
              {!canCancel ? (
                <>
                  <p className="flex items-center gap-2 font-semibold">
                    <Lock size={16} aria-hidden="true" />
                    <span>Pembatalan ditutup {clock(order.cancel_until)}</span>
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    Pembatalan ditutup 30 menit sebelum batas ambil. Pesananmu
                    tetap berlaku sampai {clock(listing.pickup_end)}.
                  </p>
                </>
              ) : confirming ? (
                <div className="rounded-control border-2 border-error/50 bg-surface p-5">
                  <p className="font-bold">
                    Batalkan pesanan? {portions} akan dikembalikan ke toko.
                  </p>
                  <p className="mt-1 text-muted">
                    Bisa dibatalkan sampai {clock(order.cancel_until)} · 30
                    menit sebelum batas ambil. Pembayaran simulasi ikut
                    dibatalkan.
                  </p>
                  <div className="mt-4 flex flex-wrap gap-3">
                    <button
                      className="min-h-11 rounded-field bg-error px-4 font-bold text-on-error"
                      disabled={busy}
                      onClick={cancel}
                    >
                      Ya, batalkan pesanan
                    </button>
                    <button
                      className="min-h-11 rounded-field border border-border px-4 font-semibold"
                      onClick={() => setConfirming(false)}
                    >
                      Tidak, simpan tiket
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <button
                    className="inline-flex min-h-11 items-center gap-2 font-semibold text-error underline-offset-4 hover:underline"
                    onClick={() => setConfirming(true)}
                  >
                    <X size={16} aria-hidden="true" />
                    Batalkan pesanan
                  </button>
                  <p className="text-xs text-muted">
                    Bisa dibatalkan sampai {clock(order.cancel_until)} · 30
                    menit sebelum batas ambil.
                  </p>
                </>
              )}
            </div>
          )}

          {used && <TicketReview order={order} />}

          {over && (
            <div className="mt-6 text-sm">
              <p className="text-muted">
                Masih ada makanan yang bisa diselamatkan di sekitarmu.
              </p>
              <Link
                href="/jelajahi"
                className="mt-2 inline-flex min-h-11 items-center gap-1.5 font-bold text-brand"
              >
                Lihat di peta
                <ArrowRight size={16} aria-hidden="true" />
              </Link>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
