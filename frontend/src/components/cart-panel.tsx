"use client";
import { Trash2 } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import {
  api,
  ApiError,
  rupiah,
  type Listing,
  type Reservation,
} from "@/lib/api";
import { eligible } from "@/lib/discovery";
import { useCart } from "@/lib/cart";
import ListingImage from "./listing-image";
import s from "./workspace.module.css";
export default function CartPanel({
  userId,
  items,
  now,
  loading,
  online,
  onRefresh,
  onPaid,
}: {
  userId: number;
  items: Listing[];
  now: number;
  loading: boolean;
  online: boolean;
  onRefresh: () => void;
  onPaid: (orders: Reservation[]) => void;
}) {
  const cart = useCart(userId);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  type Attempt = {
    key: string;
    items: { listing_id: number; quantity: number; expected_price: number }[];
  };
  const pendingKey = `habisin-checkout:${userId}`;
  const [pending, setPending] = useState<Attempt | null>(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(pendingKey) || "null");
      return raw &&
        typeof raw.key === "string" &&
        Array.isArray(raw.items) &&
        raw.items.length > 0 &&
        raw.items.length <= 20 &&
        raw.items.every(
          (r: Record<string, unknown>) =>
            Number.isInteger(r.listing_id) &&
            Number.isInteger(r.quantity) &&
            Number.isInteger(r.expected_price),
        )
        ? raw
        : null;
    } catch {
      return null;
    }
  });
  const [pendingWarning, setPendingWarning] = useState("");
  const locked = busy || !!pending;
  const inflight = useRef(false);
  const resolved = cart.items.map((row) => ({
    ...row,
    current: items.find((i) => i.id === row.item.id),
  }));
  const groups = useMemo(() => {
    const g = new Map<string, typeof resolved>();
    for (const row of resolved) {
      const current = row.current || row.item;
      const key = current.store_id
        ? `store:${current.store_id}`
        : `legacy:${current.id}`;
      g.set(key, [...(g.get(key) || []), row]);
    }
    return [...g.values()];
  }, [resolved]);
  const chosen = resolved.filter((row) => row.selected);
  const total = chosen.reduce(
    (n, row) => n + (row.current?.price ?? row.item.price) * row.quantity,
    0,
  );
  const invalid = chosen.some(
    (row) =>
      !row.current ||
      !eligible(row.current, now) ||
      row.quantity > row.current.stock,
  );
  function update(
    id: number,
    patch: Partial<{ quantity: number; selected: boolean }>,
  ) {
    cart.update((rows) =>
      rows.map((row) => (row.item.id === id ? { ...row, ...patch } : row)),
    );
    setError("");
  }
  async function pay() {
    if (
      busy ||
      inflight.current ||
      (!pending && (!chosen.length || invalid)) ||
      loading ||
      !online
    )
      return;
    inflight.current = true;
    setBusy(true);
    setError("");
    const attempt = pending || {
      key: crypto.randomUUID(),
      items: chosen.map((row) => ({
        listing_id: row.item.id,
        quantity: row.quantity,
        expected_price: row.current!.price,
      })),
    };
    setPending(attempt);
    try {
      localStorage.setItem(pendingKey, JSON.stringify(attempt));
    } catch {
      setPendingWarning(
        "Status checkout hanya tersimpan sementara. Jika koneksi terputus, coba lagi dari halaman ini sebelum menutupnya.",
      );
    }
    try {
      const result = await api<Reservation[]>("checkout", "POST", attempt);
      const ids = new Set(result.map((r) => r.listing.id));
      cart.update((old) => old.filter((r) => !ids.has(r.item.id)));
      setPending(null);
      try {
        localStorage.removeItem(pendingKey);
      } catch {}
      onRefresh();
      onPaid(result);
    } catch (e) {
      if (e instanceof ApiError && e.status >= 400 && e.status < 500) {
        setPending(null);
        try {
          localStorage.removeItem(pendingKey);
        } catch {}
      }
      setError((e as Error).message);
      onRefresh();
    } finally {
      inflight.current = false;
      setBusy(false);
    }
  }
  return (
    <section className={s.cart} aria-label="Keranjang makanan">
      <h1>Keranjang</h1>
      <p className={s.muted}>
        Pilih makanan yang ingin dibayar. Stok belum dipesan sebelum pembayaran
        simulasi berhasil.
      </p>
      {cart.error && <p role="alert">{cart.error}</p>}
      {pendingWarning && <p role="alert">{pendingWarning}</p>}
      {pending && !busy && (
        <p role="status">
          Status pembayaran terakhir belum dipastikan. Coba lagi untuk mengambil
          hasilnya; pilihan dikunci agar tidak terbayar dua kali.
        </p>
      )}
      {loading && <p role="status">Memuat harga dan stok terbaru…</p>}
      {!online && (
        <p role="alert">
          Katalog belum terhubung. Sambungkan kembali sebelum checkout.
        </p>
      )}
      {!resolved.length ? (
        <div className={s.empty}>
          Keranjang masih kosong. Tambahkan makanan dari halaman detail.
        </div>
      ) : (
        <div className={s.cartColumns}>
          <div>
            {groups.map((rows) => (
              <section
                className={s.shopGroup}
                key={
                  rows[0].current?.store_id ??
                  rows[0].item.store_id ??
                  `legacy-${rows[0].item.id}`
                }
              >
                <label className={s.shopHeading}>
                  <input
                    type="checkbox"
                    aria-label={`Pilih toko ${rows[0].current?.store || rows[0].item.store}`}
                    disabled={locked}
                    checked={rows.every((r) => r.selected)}
                    onChange={(e) =>
                      cart.update((old) =>
                        old.map((r) =>
                          rows.some((g) => g.item.id === r.item.id)
                            ? { ...r, selected: e.target.checked }
                            : r,
                        ),
                      )
                    }
                  />
                  <h2>{rows[0].current?.store || rows[0].item.store}</h2>
                </label>
                {rows.map((row) => (
                  <article key={row.item.id} className={s.cartRow}>
                    <input
                      type="checkbox"
                      aria-label={`Pilih ${row.item.name}`}
                      checked={row.selected}
                      disabled={locked}
                      onChange={(e) =>
                        update(row.item.id, { selected: e.target.checked })
                      }
                    />
                    <div className={s.thumb}>
                      <ListingImage
                        src={row.current?.image || row.item.image}
                        alt={row.item.name}
                      />
                    </div>
                    <div>
                      <h3>{row.item.name}</h3>
                      <strong>
                        {rupiah(row.current?.price ?? row.item.price)}
                      </strong>
                      {(!row.current || !eligible(row.current, now)) && (
                        <p role="status" className={s.error}>
                          Tidak tersedia lagi. Hapus atau tunggu katalog
                          diperbarui.
                        </p>
                      )}
                      {row.current && row.item.price !== row.current.price && (
                        <p className={s.error}>
                          Harga terbaru berbeda dari saat ditambahkan. Periksa
                          sebelum bayar.
                        </p>
                      )}
                      <div className={s.row}>
                        <label>
                          Porsi{" "}
                          <input
                            aria-label={`Porsi ${row.item.name}`}
                            type="number"
                            min={1}
                            max={10}
                            value={row.quantity}
                            disabled={locked}
                            onChange={(e) => {
                              const n = Number(e.target.value);
                              if (Number.isInteger(n) && n >= 1 && n <= 10)
                                update(row.item.id, { quantity: n });
                            }}
                          />
                        </label>
                        <button
                          className={s.removeButton}
                          aria-label={`Hapus ${row.item.name}`}
                          title={`Hapus ${row.item.name} dari keranjang`}
                          disabled={locked}
                          onClick={() =>
                            cart.update((old) =>
                              old.filter((r) => r.item.id !== row.item.id),
                            )
                          }
                        >
                          <Trash2 size={19} aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </section>
            ))}
          </div>
          <aside className={s.summary}>
            <h2>Ringkasan pembayaran</h2>
            <p>{chosen.length} makanan dipilih</p>
            <div className={s.total}>
              <span>Total</span>
              <strong>{rupiah(total)}</strong>
            </div>
            <p className={s.muted}>
              Pembayaran simulasi. Satu tiket per makanan. Maksimal satu tiket
              gratis aktif; kuota gratis tetap berlaku.
            </p>
            {invalid && (
              <p role="alert" className={s.error}>
                Periksa ketersediaan dan porsi makanan terpilih.
              </p>
            )}
            {error && (
              <p role="alert" className={s.error}>
                {error}
              </p>
            )}
            <button
              className={s.secondary}
              onClick={onRefresh}
              disabled={locked}
            >
              Muat ulang harga & stok
            </button>
            <button
              className={s.primary}
              disabled={
                busy ||
                loading ||
                !online ||
                (!pending && (invalid || !chosen.length))
              }
              onClick={() => void pay()}
            >
              {busy
                ? "Memproses pembayaran…"
                : pending
                  ? "Periksa pembayaran terakhir"
                  : "Bayar (simulasi)"}
            </button>
          </aside>
        </div>
      )}
    </section>
  );
}
