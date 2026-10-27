"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, LoaderCircle } from "lucide-react";
import { rupiah, type Reservation } from "@/lib/api";
import { clock, orderApi, statusLabel } from "@/lib/orders";
import { OrderSkeleton } from "./order-shell";
import { errorClass } from "./store-ui";

function Row({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <p
      className={`flex justify-between gap-4 text-sm ${accent ? "font-bold text-inverse-accent" : ""}`}
    >
      <span>{label}</span>
      <span className="font-mono font-bold">{value}</span>
    </p>
  );
}

export default function OrderPayment({ id }: { id: string }) {
  const router = useRouter();
  const [order, setOrder] = useState<Reservation | null>(null);
  const [error, setError] = useState("");
  const [paying, setPaying] = useState(false);
  useEffect(() => {
    let active = true;
    orderApi
      .get(id)
      .then((data) => active && setOrder(data))
      .catch((e) => active && setError(e.message));
    return () => {
      active = false;
    };
  }, [id]);

  async function pay() {
    if (!order) return;
    setPaying(true);
    setError("");
    try {
      await orderApi.pay(order.id);
      router.push("/pesanan");
    } catch (e) {
      setError((e as Error).message);
      setPaying(false);
    }
  }

  if (!order)
    return (
      <main className="mx-auto max-w-[1440px] px-20 py-12 tablet:px-4">
        {error ? (
          <p className={errorClass} role="alert">
            {error}
          </p>
        ) : (
          <OrderSkeleton label="Memuat pembayaran…" />
        )}
      </main>
    );

  const { listing } = order;
  const normal = listing.original_price * order.quantity;
  const saved = normal - order.total;
  const steps = [
    "Tiket berisi kode 5 karakter langsung muncul di Pesanan saya.",
    `Datang ke ${listing.store} antara ${clock(listing.pickup_start)} – ${clock(listing.pickup_end)}.`,
    "Tunjukkan kode di kasir, lalu ambil pesananmu.",
  ];

  return (
    <main className="grid min-h-[calc(100vh-64px)] grid-cols-[1fr_520px] compact:grid-cols-1">
      <section className="px-20 py-12 compact:px-8 tablet:px-4 tablet:py-6">
        <Link
          href={`/pesanan/${order.id}`}
          className="inline-flex items-center gap-2 text-sm font-bold text-brand"
        >
          <ArrowLeft size={18} />
          Kembali ke ringkasan
        </Link>
        <div className="mt-12 flex flex-wrap items-center justify-between gap-4 tablet:mt-6">
          <h1 className="text-5xl font-bold tracking-tight tablet:text-3xl">
            Pembayaran
          </h1>
          <span className="inline-flex items-center gap-2 rounded-full bg-urgency-tint px-4 py-2 text-sm font-semibold text-urgency-text">
            <span className="h-2 w-2 rounded-full bg-urgency" />
            Mode demo · tidak ada uang yang ditarik
          </span>
        </div>
        {order.status === "pending" ? (
          <p className="mt-4 text-lg text-muted">
            {order.quantity} porsi kami tahan buat kamu sampai{" "}
            {clock(order.pay_before)}. Selesaikan sebelum itu, ya.
          </p>
        ) : (
          <p className="mt-4 rounded-field bg-light p-4">
            Pesanan ini berstatus{" "}
            <strong>{statusLabel[order.status].toLowerCase()}</strong>.{" "}
            <Link href="/pesanan" className="font-bold text-brand underline">
              Lihat Pesanan saya
            </Link>
          </p>
        )}

        <article className="mt-8 overflow-hidden rounded-control border border-line bg-surface">
          <div className="flex flex-wrap items-end justify-between gap-6 p-8 tablet:p-5">
            <div>
              <p className="font-mono text-xs tracking-widest text-muted uppercase">
                Yang kamu ambil
              </p>
              <h2 className="mt-2 text-2xl font-bold">{listing.store}</h2>
              <p className="mt-1 text-sm text-muted">{listing.address}</p>
            </div>
            <div className="text-right tablet:text-left">
              <p className="font-mono text-xs tracking-widest text-muted uppercase">
                Ambil hari ini
              </p>
              <p className="mt-2 font-mono text-4xl font-bold tablet:text-3xl">
                {clock(listing.pickup_start)} – {clock(listing.pickup_end)}
              </p>
            </div>
          </div>
          <div className="flex items-center justify-between gap-4 bg-surface-2 px-8 py-5 tablet:px-5">
            <div>
              <p className="font-semibold">{listing.name}</p>
              <p className="font-mono text-xs text-muted">
                {order.quantity} × {rupiah(listing.price)}
                {listing.price > 0 &&
                  ` · dari harga normal ${rupiah(listing.original_price)}`}
              </p>
            </div>
            <p className="font-mono text-lg font-bold">
              {order.quantity} porsi
            </p>
          </div>
        </article>

        <h2 className="mt-10 font-mono text-xs tracking-widest uppercase">
          Setelah ini
        </h2>
        <ol className="mt-3 grid grid-cols-3 gap-6 tablet:grid-cols-1">
          {steps.map((step, index) => (
            <li key={step} className="border-t-2 border-dark pt-4">
              <span className="grid h-8 w-8 place-items-center rounded-field border-2 border-dark bg-yellow font-mono text-sm font-bold text-on-sticker">
                {index + 1}
              </span>
              <p className="mt-3 text-sm">{step}</p>
            </li>
          ))}
        </ol>
      </section>

      <aside className="bg-inverse px-14 py-12 text-on-inverse compact:px-8 tablet:px-4">
        <h2 className="font-mono text-xs tracking-widest uppercase">
          Ringkasan pembayaran
        </h2>
        <div className="mt-6 space-y-4 border-b border-on-inverse/20 pb-6">
          <Row label={listing.name} value={`${order.quantity} porsi`} />
          <Row label="Harga per porsi" value={rupiah(listing.price)} />
          {listing.price > 0 && (
            <>
              <Row label="Harga normal" value={rupiah(normal)} />
              <Row
                label={`Kamu hemat ${Math.round((saved / normal) * 100)}%`}
                value={`-${rupiah(saved)}`}
                accent
              />
            </>
          )}
          <Row label="Biaya layanan" value="Gratis" />
        </div>
        <p className="mt-6 text-sm">Total dibayar</p>
        <p className="mt-1 font-mono text-6xl font-bold tracking-tight">
          {rupiah(order.total)}
        </p>
        {error && (
          <p className={`${errorClass} mt-6`} role="alert">
            {error}
          </p>
        )}
        {order.status === "pending" && (
          <button
            className="mt-8 inline-flex min-h-15 w-full items-center justify-center gap-2 rounded-control bg-yellow text-lg font-bold text-on-sticker disabled:opacity-70"
            disabled={paying}
            onClick={pay}
          >
            {paying && <LoaderCircle size={20} className="animate-spin" />}
            {paying
              ? "Memproses…"
              : error
                ? "Coba lagi"
                : "Simulasikan pembayaran berhasil"}
          </button>
        )}
        <p className="mt-3 text-xs opacity-80">
          Tiket langsung muncul setelah simulasi. Kamu bisa batalkan sampai{" "}
          {clock(order.cancel_until)}.
        </p>
      </aside>
    </main>
  );
}
