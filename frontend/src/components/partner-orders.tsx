"use client";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  CalendarDays,
  PackageOpen,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react";
import { api, rupiah, type PartnerOrder, type Store } from "@/lib/api";
import { clock, statusLabel } from "@/lib/orders";
import Modal from "./modal";
import RoleWorkspace from "./role-workspace";
import s from "./role-workspace.module.css";

type PageData = {
  results: PartnerOrder[];
  count: number;
  page: number;
  page_size: number;
  counts: Record<string, number>;
};
export default function PartnerOrders({
  dashboard = false,
}: {
  dashboard?: boolean;
}) {
  return (
    <RoleWorkspace
      title={dashboard ? "Dasbor" : "Pesanan"}
      subtitle="Kelola pesanan masuk dan riwayat pengambilan seluruh cabang."
    >
      {() => <OrdersContent />}
    </RoleWorkspace>
  );
}
function OrdersContent() {
  const [tab, setTab] = useState("active"),
    [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [storeId, setStoreId] = useState(""),
    [stores, setStores] = useState<Store[]>([]),
    [data, setData] = useState<PageData | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [page, setPage] = useState(1),
    [filtersOpen, setFiltersOpen] = useState(false),
    [target, setTarget] = useState<PartnerOrder | null>(null),
    [reason, setReason] = useState(""),
    [cancelError, setCancelError] = useState(""),
    [busy, setBusy] = useState(false),
    [now, setNow] = useState(() => Date.now());
  const generation = useRef(0);
  const filterId = useId();
  const load = useCallback(
    (signal?: AbortSignal) => {
      const id = ++generation.current;
      const query = new URLSearchParams({
        status: tab,
        page: String(page),
        ...(from ? { from } : {}),
        ...(to ? { to } : {}),
        ...(storeId ? { store_id: storeId } : {}),
      });
      return api<PageData>(`partner/orders?${query}`, "GET", undefined, signal)
        .then((result) => {
          if (!signal?.aborted && id === generation.current) {
            setData(result);
            setError("");
          }
        })
        .catch((e) => {
          if (!signal?.aborted && id === generation.current)
            setError(e.message);
        })
        .finally(() => {
          if (!signal?.aborted && id === generation.current) setLoading(false);
        });
    },
    [tab, page, from, to, storeId],
  );
  useEffect(() => {
    const c = new AbortController();
    void load(c.signal);
    const refresh = () => void load(c.signal);
    window.addEventListener("focus", refresh);
    const timer = setInterval(refresh, 10000);
    return () => {
      c.abort();
      window.removeEventListener("focus", refresh);
      clearInterval(timer);
    };
  }, [load]);
  useEffect(() => {
    const c = new AbortController();
    api<{ stores: Store[] }>("partner/stores", "GET", undefined, c.signal)
      .then((d) => {
        if (!c.signal.aborted) setStores(d.stores);
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message);
      });
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      c.abort();
      clearInterval(timer);
    };
  }, []);
  useEffect(() => {
    const deadlines = (data?.results || [])
      .filter((order) => ["pending", "paid"].includes(order.status))
      .flatMap((order) => [
        Date.parse(order.listing.pickup_end),
        ...(order.status === "pending" ? [Date.parse(order.pay_before)] : []),
      ])
      .filter((time) => time > Date.now());
    if (!deadlines.length) return;
    const timer = setTimeout(
      () => void load(),
      Math.min(
        2147483647,
        Math.max(1, Math.min(...deadlines) - Date.now() + 100),
      ),
    );
    return () => clearTimeout(timer);
  }, [data, load]);
  async function cancel(e: React.FormEvent) {
    e.preventDefault();
    if (!target || busy || !reason.trim()) return;
    setBusy(true);
    setCancelError("");
    try {
      await api<PartnerOrder>(
        `partner/reservations/${target.id}/cancel`,
        "POST",
        { reason: reason.trim() },
      );
      setNotice(
        "Pesanan dibatalkan. Alasan sudah tersedia bagi pembeli dan stok dikembalikan.",
      );
      setTarget(null);
      await load();
    } catch (e) {
      setCancelError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function filter(value: string) {
    setTab(value);
    setPage(1);
  }
  const counts = data?.counts || {};
  const remaining = (minutes: number) =>
    minutes >= 60
      ? `${Math.floor(minutes / 60)} jam${minutes % 60 ? ` ${minutes % 60} mnt` : ""}`
      : `${minutes} mnt`;
  return (
    <section aria-label="Pesanan toko">
      <div className={`${s.toolbar} ${s.ordersToolbar}`}>
        <div className={s.filters} aria-label="Filter status pesanan">
          {[
            ["active", "Pesanan masuk"],
            ["paid", "Perlu diambil"],
            ["pending", "Menunggu bayar"],
            ["all", "Semua"],
            ["history", "Riwayat"],
            ["cancelled", "Dibatalkan"],
            ["picked_up", "Selesai"],
          ].map(([value, label]) => (
            <button
              key={value}
              className={s.pill}
              aria-pressed={tab === value}
              onClick={() => filter(value)}
            >
              {label}
              {value === "active" && (counts.pending || counts.paid)
                ? ` ${(counts.pending || 0) + (counts.paid || 0)}`
                : value === "paid" && counts.paid
                  ? ` ${counts.paid}`
                  : ""}
            </button>
          ))}
        </div>
        <button
          type="button"
          className={`${s.secondary} ${s.filterToggle}`}
          aria-expanded={filtersOpen}
          aria-controls={filterId}
          onClick={() => setFiltersOpen(!filtersOpen)}
        >
          <SlidersHorizontal size={16} />
          Filter
          {from || to || storeId
            ? ` (${[from, to, storeId].filter(Boolean).length})`
            : ""}
        </button>
        <div id={filterId} className={s.filterFields} data-open={filtersOpen}>
          <label className={s.label}>
            Cabang
            <select
              className={s.field}
              aria-label="Cabang pesanan"
              value={storeId}
              onChange={(e) => {
                setStoreId(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Semua toko</option>
              {stores.map((store) => (
                <option key={store.id} value={store.id}>
                  {store.name}
                </option>
              ))}
            </select>
          </label>
          <label className={s.label}>
            <span>
              <CalendarDays size={14} className="inline" /> Dari
            </span>
            <input
              className={s.field}
              type="date"
              aria-label="Tanggal mulai pesanan"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                setPage(1);
              }}
            />
          </label>
          <label className={s.label}>
            Sampai
            <input
              className={s.field}
              type="date"
              aria-label="Tanggal akhir pesanan"
              value={to}
              onChange={(e) => {
                setTo(e.target.value);
                setPage(1);
              }}
            />
          </label>
          {(from || to || storeId) && (
            <button
              className={s.secondary}
              onClick={() => {
                setFrom("");
                setTo("");
                setStoreId("");
                setPage(1);
              }}
            >
              Reset filter
            </button>
          )}
        </div>
      </div>
      {notice && (
        <p className={s.message} role="status">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className={s.error}>
          {error} <button onClick={() => void load()}>Coba lagi pesanan</button>
        </p>
      )}
      <div className={s.rowBetween}>
        <h2 className={s.title}>
          {tab === "active"
            ? "Pesanan masuk"
            : tab === "paid"
              ? "Perlu diambil"
              : tab === "history"
                ? "Riwayat pesanan"
                : "Pesanan toko"}
        </h2>
        <p className={s.muted}>
          {data?.count ?? 0} pesanan ·{" "}
          {from || to ? "tanggal ambil WIB" : "semua tanggal ambil WIB"}
        </p>
      </div>
      {loading && !data ? (
        <div className="mt-6" role="status" aria-label="Memuat pesanan">
          {[1, 2, 3, 4].map((i) => (
            <div className={s.skeleton} key={i} />
          ))}
          <span className="sr-only">Memuat pesanan…</span>
        </div>
      ) : !data?.results.length && !error ? (
        <div className={`${s.empty} mt-6`}>
          <PackageOpen size={32} />
          <h3 className={s.title}>Belum ada pesanan pada filter ini.</h3>
          <p className={s.muted}>
            Ubah rentang tanggal atau cabang untuk melihat pesanan lain.
          </p>
        </div>
      ) : (
        <div aria-busy={loading}>
          {data?.results.map((order) => {
            const active =
              ["pending", "paid"].includes(order.status) &&
              Date.parse(order.listing.pickup_end) > now;
            const minutes = Math.max(
              0,
              Math.ceil((Date.parse(order.listing.pickup_end) - now) / 60000),
            );
            return (
              <article
                className={s.order}
                key={order.id}
                aria-label={`Pesanan ${order.id} ${order.buyer_name}`}
              >
                <div className={s.mono}>
                  <strong
                    className={
                      active && minutes < 30 ? "text-urgency-text" : ""
                    }
                  >
                    {clock(order.listing.pickup_end)}
                  </strong>
                  <p className={s.muted}>
                    {active
                      ? `${remaining(minutes)} lagi`
                      : statusLabel[order.status]}
                  </p>
                  <small>
                    {new Date(order.listing.pickup_end).toLocaleDateString(
                      "id-ID",
                      {
                        day: "numeric",
                        month: "short",
                        timeZone: "Asia/Jakarta",
                      },
                    )}
                  </small>
                </div>
                <span className={s.avatar}>
                  {order.buyer_name
                    .split(/\s+/)
                    .slice(0, 2)
                    .map((n) => n[0])
                    .join("")
                    .toUpperCase()}
                </span>
                <div className="min-w-0">
                  <h3>{order.buyer_name}</h3>
                  <p>
                    {order.quantity}× {order.listing.name} ·{" "}
                    {rupiah(order.total)}
                  </p>
                  <p className={s.muted}>
                    {order.listing.store} · Pesanan #{order.id}
                  </p>
                  {order.status === "pending" && (
                    <p className={s.badge}>Menunggu pembayaran</p>
                  )}
                  {order.note && (
                    <p className={s.note}>
                      <strong>Catatan pembeli:</strong> {order.note}
                    </p>
                  )}
                  {order.cancellation_note && (
                    <p className="text-error mt-2">
                      <strong>
                        Dibatalkan{" "}
                        {order.cancelled_by === "partner" ? "mitra" : "pembeli"}
                        :
                      </strong>{" "}
                      {order.cancellation_note}
                    </p>
                  )}
                </div>
                <div className={s.actions}>
                  {order.status === "paid" && active && (
                    <button
                      className={s.secondary}
                      disabled
                      title="Verifikasi kode belum tersedia"
                    >
                      <ShieldCheck size={14} />
                      Verifikasi
                    </button>
                  )}
                  {active ? (
                    <button
                      className={s.danger}
                      onClick={() => {
                        setTarget(order);
                        setReason("");
                        setCancelError("");
                      }}
                    >
                      Batalkan Pesanan
                    </button>
                  ) : (
                    <span
                      className={`${s.badge} ${order.status === "cancelled" ? s.removed : ""}`}
                    >
                      {statusLabel[order.status]}
                    </span>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
      {data && data.count > data.page_size && (
        <div className={`${s.rowBetween} mt-6`}>
          <button
            className={s.secondary}
            disabled={page === 1 || loading}
            onClick={() => setPage(page - 1)}
          >
            Sebelumnya
          </button>
          <span>
            Halaman {page} dari {Math.ceil(data.count / data.page_size)}
          </span>
          <button
            className={s.secondary}
            disabled={page * data.page_size >= data.count || loading}
            onClick={() => setPage(page + 1)}
          >
            Berikutnya
          </button>
        </div>
      )}
      {target && (
        <Modal
          title="Batalkan pesanan?"
          onClose={() => {
            if (!busy) setTarget(null);
          }}
        >
          <form onSubmit={cancel} className={s.form}>
            <p>
              {target.quantity}× {target.listing.name} untuk {target.buyer_name}
              .
            </p>
            <p className={s.muted}>
              Alasan dikirim ke halaman pesanan pembeli. Porsi akan dikembalikan
              satu kali.
            </p>
            <label className={s.label}>
              Alasan pembatalan (wajib)
              <textarea
                autoFocus
                className={s.field}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                required
                maxLength={500}
                rows={4}
                disabled={busy}
              />
            </label>
            {cancelError && (
              <p className={s.error} role="alert">
                {cancelError}
              </p>
            )}
            <div className={s.actions}>
              <button
                type="button"
                className={s.secondary}
                disabled={busy}
                onClick={() => setTarget(null)}
              >
                Kembali
              </button>
              <button className={s.danger} disabled={busy || !reason.trim()}>
                {busy ? "Membatalkan…" : "Kirim pembatalan"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  );
}
