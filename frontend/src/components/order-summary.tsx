"use client";
import Link from "next/link";
import CancellationNotice from "./cancellation-notice";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, MapPin, Minus, Plus } from "lucide-react";
import { rupiah, type Reservation } from "@/lib/api";
import {
  MAX_QUANTITY,
  NOTE_MAX_LENGTH,
  clock,
  distanceLabel,
  orderApi,
  statusLabel,
  timeLeft,
} from "@/lib/orders";
import { OrderSkeleton } from "./order-shell";
import { errorClass, primaryButton, secondaryButton } from "./store-ui";

// A dotted leader line between label and value, as printed on a struk.
export function Leader({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <p
      className={`flex items-baseline gap-2 font-mono text-sm ${strong ? "font-bold" : ""}`}
    >
      <span className="shrink-0">{label}</span>
      <span
        aria-hidden="true"
        className="min-w-4 flex-1 border-b-2 border-dotted border-border/50"
      />
      <span className="shrink-0">{value}</span>
    </p>
  );
}

export default function OrderSummary({ id }: { id: string }) {
  const router = useRouter();
  const [order, setOrder] = useState<Reservation | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  // Set when another buyer took stock while this page was open.
  const [adjusted, setAdjusted] = useState<{
    chosen: number;
    available: number;
  } | null>(null);
  const [now, setNow] = useState(0);
  useEffect(() => {
    let active = true;
    orderApi
      .get(id)
      .then((data) => {
        if (!active) return;
        setOrder(data);
        setNote(data.note);
        setNow(Date.now());
      })
      .catch((e) => active && setError(e.message));
    return () => {
      active = false;
    };
  }, [id]);

  if (!order)
    return (
      <main className="mx-auto max-w-[1440px] px-16 py-12 tablet:px-4">
        {error ? (
          <p className={errorClass} role="alert">
            {error}
          </p>
        ) : (
          <OrderSkeleton label="Memuat ringkasan…" />
        )}
      </main>
    );

  const { listing } = order;
  // Portions this order already holds can be kept when editing.
  const available = listing.stock + order.quantity;
  const maxQuantity = Math.min(MAX_QUANTITY, available);
  const saved = listing.original_price - listing.price;

  // Optimistic edit: show the new quantity and total at once, then confirm.
  async function changeQuantity(quantity: number) {
    if (!order || saving) return;
    const previous = order;
    setError("");
    setAdjusted(null);
    setSaving(true);
    setOrder({ ...order, quantity, total: quantity * listing.price });
    try {
      setOrder(await orderApi.update(order.id, { quantity }));
    } catch (e) {
      // Stock is re-checked on the server. If it shrank, settle on what is
      // left and say so, instead of a bare error or a silent change.
      const fresh = await orderApi.get(order.id).catch(() => null);
      const left = fresh ? fresh.listing.stock + fresh.quantity : 0;
      if (fresh && quantity > left) {
        const target = Math.min(MAX_QUANTITY, left);
        setOrder(
          target === fresh.quantity
            ? fresh
            : await orderApi
                .update(order.id, { quantity: target })
                .catch(() => fresh),
        );
        setAdjusted({ chosen: quantity, available: left });
      } else {
        setOrder(previous);
        setError((e as Error).message);
      }
    } finally {
      setSaving(false);
    }
  }

  async function saveNote() {
    if (!order || note === order.note) return;
    setError("");
    try {
      setOrder(await orderApi.update(order.id, { note }));
    } catch (e) {
      setNote(order.note);
      setError((e as Error).message);
    }
  }

  async function claimFree() {
    if (!order) return;
    setSaving(true);
    try {
      await orderApi.pay(order.id);
      router.push("/pesanan");
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  }

  const pending = order.status === "pending";
  return (
    <main className="mx-auto max-w-[1440px] px-16 py-10 tablet:px-4 tablet:py-6">
      <CancellationNotice order={order} />
      <Link
        href="/"
        className="inline-flex items-center gap-2 text-sm font-bold text-brand"
      >
        <ArrowLeft size={18} />
        Kembali ke {listing.name}
      </Link>
      <h1 className="mt-8 text-[32px] font-bold tracking-tight tablet:mt-5 tablet:text-2xl">
        Ringkasan pesanan
      </h1>

      <div className="mt-8 grid grid-cols-[minmax(0,760px)_488px] justify-between gap-16 compact:grid-cols-1 compact:gap-8">
        <section className="space-y-8">
          <div className="flex gap-4 border-b border-line pb-6">
            <div
              className="h-22 w-22 shrink-0 rounded-field bg-light bg-cover bg-center"
              style={{ backgroundImage: `url("${listing.image}")` }}
              role="img"
              aria-label={listing.name}
            />
            <div className="min-w-0 space-y-1">
              <h2 className="text-xl font-semibold">{listing.name}</h2>
              <p className="text-sm text-muted">
                {listing.store} ·{" "}
                {distanceLabel(listing.latitude, listing.longitude)}
              </p>
              <p className="flex flex-wrap items-baseline gap-2">
                <span className="font-mono font-bold">
                  {rupiah(listing.price)}
                </span>
                {listing.price > 0 && (
                  <>
                    <span className="font-mono text-xs text-muted line-through">
                      {rupiah(listing.original_price)}
                    </span>
                    <span className="text-xs font-bold">
                      Hemat {Math.round((saved / listing.original_price) * 100)}
                      %
                    </span>
                  </>
                )}
              </p>
            </div>
          </div>

          {adjusted && (
            <div
              role="status"
              className="rounded-field border-l-4 border-urgency bg-urgency-tint p-4 text-sm"
            >
              <p className="font-bold">
                Stok tinggal {adjusted.available} porsi. Jumlah pesanan sudah
                kami sesuaikan.
              </p>
              <p className="mt-1">
                Anda tadi memilih {adjusted.chosen}. Total ikut diperbarui.
              </p>
            </div>
          )}

          {!pending && (
            <p className="rounded-field bg-light p-4 text-sm">
              Pesanan ini berstatus{" "}
              <strong>{statusLabel[order.status].toLowerCase()}</strong> dan
              tidak dapat diubah lagi.{" "}
              <Link href="/pesanan" className="font-bold text-brand underline">
                Lihat Pesanan saya
              </Link>
            </p>
          )}

          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="font-semibold">Jumlah porsi</p>
              <p className="text-xs text-muted">
                {available} porsi tersedia ·{" "}
                {order.quantity >= available
                  ? "batas atas tercapai"
                  : `maks. ${MAX_QUANTITY} per pesanan`}
              </p>
            </div>
            <div className="flex h-12 w-40 items-center justify-between rounded-field border border-border bg-surface">
              <button
                className="grid h-full w-12 place-items-center"
                aria-label="Kurangi porsi"
                disabled={!pending || saving || order.quantity <= 1}
                onClick={() => changeQuantity(order.quantity - 1)}
              >
                <Minus size={18} />
              </button>
              <span
                className="font-mono text-lg font-bold"
                data-testid="quantity"
                aria-live="polite"
              >
                {order.quantity}
              </span>
              <button
                className="grid h-full w-12 place-items-center"
                aria-label="Tambah porsi"
                disabled={!pending || saving || order.quantity >= maxQuantity}
                onClick={() => changeQuantity(order.quantity + 1)}
              >
                <Plus size={18} />
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <label htmlFor="order-note" className="block font-semibold">
              Catatan untuk toko (opsional)
            </label>
            <textarea
              id="order-note"
              className="block min-h-30 w-full resize-y rounded-field border border-border bg-surface p-3.5 text-base"
              maxLength={NOTE_MAX_LENGTH}
              value={note}
              disabled={!pending}
              onChange={(e) => setNote(e.target.value)}
              onBlur={saveNote}
              placeholder="Misalnya: datang sekitar jam 7 malam"
            />
            <p className="flex justify-between text-xs text-muted">
              <span>Dibaca kasir saat Anda datang.</span>
              <span className="font-mono">
                {note.length}/{NOTE_MAX_LENGTH}
              </span>
            </p>
          </div>

          <div className="flex gap-4">
            <MapPin size={20} className="mt-0.5 shrink-0 text-brand" />
            <div className="space-y-1">
              <p className="font-bold">
                Ambil sebelum {clock(listing.pickup_end)}
                {now > 0 && timeLeft(listing.pickup_end, now)
                  ? ` · ${timeLeft(listing.pickup_end, now)}`
                  : ""}
              </p>
              <p className="text-sm text-muted">
                {listing.store}, {listing.address}
                {listing.store_summary?.landmark && (
                  <span className="block text-muted">
                    Patokan: {listing.store_summary.landmark}
                  </span>
                )}
              </p>
              <p className="text-xs text-muted">
                Pembatalan bisa sampai {clock(order.cancel_until)} (30 menit
                sebelum batas ambil). Porsi dikembalikan ke toko.
              </p>
            </div>
          </div>
          {error && (
            <p className={errorClass} role="alert">
              {error}
            </p>
          )}
        </section>

        <aside className="self-start bg-surface-2 p-6 [--perf:radial-gradient(circle_at_6px_0,transparent_5px,var(--color-surface-2)_5.5px)] [mask:var(--perf)_-6px_0/12px_100%_repeat-x]">
          <p className="font-mono text-xs tracking-widest text-muted uppercase">
            Rincian ·{" "}
            {new Date(order.created_at).toLocaleString("id-ID", {
              day: "2-digit",
              month: "short",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
              timeZone: "Asia/Jakarta",
            })}{" "}
            WIB
          </p>
          <div className="mt-5 space-y-3">
            <Leader
              label={`${listing.name} × ${order.quantity}`}
              value={rupiah(order.total)}
            />
            {listing.price > 0 && (
              <>
                <Leader
                  label="Harga normal"
                  value={rupiah(listing.original_price * order.quantity)}
                />
                <Leader
                  label="Hemat"
                  value={`-${rupiah(saved * order.quantity)}`}
                />
              </>
            )}
          </div>
          <div className="mt-5 flex items-baseline justify-between border-t-2 border-dark pt-5">
            <span className="font-semibold">Total</span>
            <strong
              className="font-mono text-[28px] text-brand"
              data-testid="order-total"
            >
              {rupiah(order.total)}
            </strong>
          </div>
          {pending &&
            (listing.price === 0 ? (
              <button
                className={`${primaryButton} mt-6 w-full`}
                disabled={saving}
                onClick={claimFree}
              >
                Klaim gratis
              </button>
            ) : (
              <Link
                href={`/pesanan/${order.id}/bayar`}
                className={`${primaryButton} mt-6 w-full ${saving ? "pointer-events-none opacity-55" : ""}`}
                role="button"
                aria-disabled={saving}
              >
                Bayar {rupiah(order.total)}
              </Link>
            ))}
          {!pending && (
            <Link href="/pesanan" className={`${secondaryButton} mt-6 w-full`}>
              Lihat Pesanan saya
            </Link>
          )}
          <p className="mt-4 text-xs font-semibold text-warning">
            Mode demo · tidak ada uang yang ditarik
          </p>
        </aside>
      </div>
    </main>
  );
}
