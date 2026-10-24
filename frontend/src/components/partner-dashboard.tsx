"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  LayoutDashboard,
  List,
  ShoppingBag,
  Store,
  UserRound,
  ShieldCheck,
  Plus,
  LogOut,
  Copy,
} from "lucide-react";
import {
  api,
  pickup,
  rupiah,
  type Listing,
  type Reservation,
  type User,
} from "@/lib/api";
import { isActiveReservation } from "@/lib/reservation";
import { eligible } from "@/lib/discovery";
import { designFont } from "@/lib/design-font";
import { PickupProgress } from "./food-post-card";
import HabisinLogo from "./habisin-logo";
import ListingImage from "./listing-image";
import s from "./workspace.module.css";
type PartnerOrder = Reservation & { buyer_name: string };
type Data = {
  booked_portions: number;
  simulated_total: number;
  series: { day: string; portions: number }[];
  pickups: PartnerOrder[];
  orders: PartnerOrder[];
  listings: Listing[];
  stores: { id: number; name: string; address: string; closing_time: string }[];
};
export default function PartnerDashboard({
  user,
  now,
  revision,
  onListings,
  onAdd,
  onCopy,
  onAccount,
  onLogout,
  onChanged,
}: {
  user: User;
  now: number;
  revision: number;
  onListings: () => void;
  onAdd: () => void;
  onCopy: () => void;
  onAccount: () => void;
  onLogout: () => void;
  onChanged: (item: Listing | null, id: number) => void;
}) {
  const [section, setSection] = useState("dashboard"),
    [period, setPeriod] = useState("week"),
    [data, setData] = useState<Data | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [undo, setUndo] = useState<{
      id: number;
      token: string;
      expires: string;
    } | null>(null),
    [message, setMessage] = useState("");
  const [history, setHistory] = useState(false);
  const [cancelling, setCancelling] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const generation = useRef(0);
  const load = useCallback(
    (signal?: AbortSignal) => {
      const request = ++generation.current;
      return api<Data>(
        `partner/dashboard?period=${period}`,
        "GET",
        undefined,
        signal,
      )
        .then((result) => {
          if (!signal?.aborted && request === generation.current) {
            setData(result);
            setError("");
          }
        })
        .catch((e: Error) => {
          if (!signal?.aborted && request === generation.current)
            setError(e.message);
        })
        .finally(() => {
          if (!signal?.aborted && request === generation.current)
            setLoading(false);
        });
    },
    [period],
  );
  useEffect(() => {
    const c = new AbortController();
    void load(c.signal);
    const refresh = () => void load(c.signal);
    window.addEventListener("focus", refresh);
    const timer = setInterval(refresh, 30000);
    return () => {
      c.abort();
      window.removeEventListener("focus", refresh);
      clearInterval(timer);
    };
  }, [load, revision]);
  async function cancelOrder(order: PartnerOrder) {
    if (busy || !reason.trim()) return;
    setBusy(true);
    setError("");
    try {
      const result = await api<Reservation>(
        `partner/reservations/${order.id}/cancel`,
        "POST",
        { reason: reason.trim() },
      );
      setCancelling(null);
      setReason("");
      setMessage(
        `Pesanan ${order.listing.name} dibatalkan. Stok dikembalikan.`,
      );
      onChanged(result.listing, result.listing.id);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function sold(item: Listing) {
    setBusy(true);
    setError("");
    try {
      const result = await api<{
        listing: Listing;
        undo_token: string;
        expires_at: string;
      }>(`partner/listings/${item.id}/sold-out`, "POST", {});
      setUndo({
        id: item.id,
        token: result.undo_token,
        expires: result.expires_at,
      });
      onChanged(result.listing, item.id);
      setMessage(`${item.name} ditandai habis.`);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function restore() {
    if (!undo) return;
    setBusy(true);
    try {
      const result = await api<Listing>(
        `partner/listings/${undo.id}/undo-sold-out`,
        "POST",
        { token: undo.token },
      );
      onChanged(result, result.id);
      setUndo(null);
      setMessage("Stok listing dipulihkan.");
      await load();
    } catch (e) {
      setError((e as Error).message);
      setUndo(null);
    } finally {
      setBusy(false);
    }
  }
  const current = data?.listings.filter((i) => eligible(i, now)) || [];
  const activeOrders =
    data?.orders.filter((r) => isActiveReservation(r, now)) || [];
  const orders = (section === "orders" ? data?.orders : data?.pickups)?.filter(
    (r) =>
      section === "orders" && history
        ? !isActiveReservation(r, now)
        : isActiveReservation(r, now),
  );
  const max = Math.max(1, ...(data?.series.map((r) => r.portions) || []));
  return (
    <section
      className={`${s.partnerShell} ${designFont.className}`}
      aria-label="Dasbor operasional mitra"
    >
      <aside className={s.partnerSidebar}>
        <HabisinLogo />
        <small>Mitra</small>
        <button className={s.verify} disabled>
          <ShieldCheck size={18} />
          Verifikasi kode <small>Segera hadir</small>
        </button>
        <nav aria-label="Navigasi mitra">
          <button
            aria-current={section === "dashboard" ? "page" : undefined}
            onClick={() => setSection("dashboard")}
          >
            <LayoutDashboard size={18} />
            Dasbor
          </button>
          <button aria-label="Listing" onClick={onListings}>
            <List size={18} />
            Listing <b>{data?.listings.length ?? 0}</b>
          </button>
          <button
            aria-current={section === "orders" ? "page" : undefined}
            onClick={() => setSection("orders")}
          >
            <ShoppingBag size={18} />
            Pesanan <b>{activeOrders.length}</b>
          </button>
          <Link href="/partner/store">
            <Store size={18} />
            Profil toko
          </Link>
          <button onClick={onAccount}>
            <UserRound size={18} />
            Akun
          </button>
        </nav>
        <button className={s.textButton} onClick={onLogout}>
          <LogOut size={18} />
          Keluar
        </button>
      </aside>
      <div className={s.partnerMain}>
        <header className={s.partnerHeader}>
          <div>
            <p className={s.eyebrow}>
              {new Date(now).toLocaleString("id-ID", {
                timeZone: "Asia/Jakarta",
                weekday: "long",
                day: "numeric",
                month: "long",
                hour: "2-digit",
                minute: "2-digit",
              })}{" "}
              WIB
            </p>
            <h1>
              {section === "orders"
                ? "Pesanan toko Anda"
                : `Selamat datang, ${data?.stores[0]?.name || user.name || user.username}`}
            </h1>
            <p className={s.muted}>
              {data?.stores.length === 1
                ? `${data.stores[0].address} · tutup ${data.stores[0].closing_time.slice(0, 5)} WIB`
                : data?.stores.length
                  ? `${data.stores.length} toko milik Anda`
                  : "Lengkapi profil toko untuk mulai menjual."}
            </p>
          </div>
          <div className={s.row}>
            <button className={s.secondary} onClick={onCopy}>
              <Copy size={17} />
              Salin dari listing kemarin
            </button>
            <button className={s.primary} onClick={onAdd}>
              <Plus size={18} />
              Tambah listing
            </button>
          </div>
        </header>
        {section === "dashboard" && (
          <section className={s.performance} aria-label="Performa penjualan">
            <div className={s.row}>
              <h2>Performa penjualan</h2>
              <div className={s.periods}>
                {[
                  { key: "today", label: "Hari ini" },
                  { key: "week", label: "Minggu" },
                  { key: "month", label: "Bulan" },
                  { key: "year", label: "Tahun" },
                ].map((p) => (
                  <button
                    aria-pressed={period === p.key}
                    key={p.key}
                    onClick={() => {
                      setLoading(true);
                      setPeriod(p.key);
                    }}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
            <div className={s.metrics}>
              <div>
                <strong>{data?.booked_portions ?? "—"}</strong>
                <span>porsi terpesan</span>
              </div>
              <div>
                <strong>{data ? rupiah(data.simulated_total) : "—"}</strong>
                <span>nominal pembayaran simulasi</span>
              </div>
            </div>
            <div
              className={s.chart}
              role="img"
              aria-label={`Grafik porsi terpesan per hari, periode ${period}`}
            >
              {data?.series.map((row) => (
                <div key={row.day} title={`${row.day}: ${row.portions} porsi`}>
                  <i
                    style={{
                      height: `${Math.max(2, Math.round((row.portions / max) * 100))}%`,
                    }}
                  />
                </div>
              ))}
            </div>
            <p className={s.muted}>
              Data pesanan akun ini · belum menunjukkan makanan selesai diambil.
              Verifikasi kode menyusul.
            </p>
          </section>
        )}
        {error && (
          <div role="alert" className={s.status}>
            <p>{error}</p>
            <button className={s.textButton} onClick={() => void load()}>
              Coba lagi dashboard
            </button>
          </div>
        )}
        {message && (
          <div className={s.status} role="status">
            {message}{" "}
            {undo && Date.parse(undo.expires) > now && (
              <button
                className={s.textButton}
                disabled={busy}
                onClick={() => void restore()}
              >
                Urungkan · {Math.ceil((Date.parse(undo.expires) - now) / 1000)}{" "}
                dtk
              </button>
            )}
          </div>
        )}
        {loading && !data ? (
          <div
            className={s.skeleton}
            role="status"
            aria-label="Memuat dashboard"
          >
            Memuat dashboard…
            <div />
            <div />
            <div />
          </div>
        ) : (
          data && (
            <div className={s.dashboardColumns}>
              <section className={s.pickups}>
                <div className={s.row}>
                  <h2>
                    {section === "orders"
                      ? history
                        ? "Riwayat pesanan"
                        : "Pesanan aktif"
                      : "Pengambilan hari ini"}
                  </h2>
                  <button
                    className={s.textButton}
                    disabled={loading}
                    onClick={() => void load()}
                  >
                    Muat ulang
                  </button>
                </div>
                {section === "orders" && (
                  <div className={s.periods} aria-label="Filter pesanan mitra">
                    <button
                      aria-pressed={!history}
                      onClick={() => setHistory(false)}
                    >
                      Aktif
                    </button>
                    <button
                      aria-pressed={history}
                      onClick={() => setHistory(true)}
                    >
                      Riwayat
                    </button>
                  </div>
                )}
                {!orders?.length ? (
                  <p className={s.empty}>
                    {section === "orders"
                      ? history
                        ? "Belum ada riwayat pesanan."
                        : "Belum ada pesanan aktif."
                      : "Belum ada pengambilan hari ini."}
                  </p>
                ) : (
                  orders.map((order) => (
                    <article className={s.pickupRow} key={order.id}>
                      <strong
                        className={
                          Date.parse(order.listing.pickup_end) < now
                            ? s.error
                            : s.mono
                        }
                      >
                        {pickup(order.listing.pickup_end)}
                      </strong>
                      <span className={s.avatar}>
                        {order.buyer_name.slice(0, 2).toUpperCase()}
                      </span>
                      <div>
                        <h3>{order.buyer_name}</h3>
                        <p>
                          {order.quantity}× {order.listing.name}
                        </p>
                        <small>
                          Kode {order.code} ·{" "}
                          {order.status === "cancelled"
                            ? "Dibatalkan"
                            : Date.parse(order.listing.pickup_end) < now
                              ? "Batas ambil lewat"
                              : "Menunggu pengambilan"}
                        </small>
                      </div>
                      {order.cancellation_note && (
                        <p className={s.orderCancel}>
                          Dibatalkan oleh mitra: {order.cancellation_note}
                        </p>
                      )}
                      {isActiveReservation(order, now) && (
                        <>
                          <button
                            className={s.danger}
                            disabled={busy}
                            aria-label={`Batalkan pesanan ${order.code}`}
                            onClick={() => {
                              setCancelling(order.id);
                              setReason("");
                            }}
                          >
                            Batalkan
                          </button>
                          {cancelling === order.id && (
                            <form
                              className={s.orderCancel}
                              aria-label={`Pembatalan ${order.code}`}
                              onSubmit={(e) => {
                                e.preventDefault();
                                void cancelOrder(order);
                              }}
                            >
                              <label htmlFor={`cancel-reason-${order.id}`}>
                                Alasan pembatalan (wajib)
                              </label>
                              <textarea
                                id={`cancel-reason-${order.id}`}
                                required
                                maxLength={500}
                                value={reason}
                                onChange={(e) => setReason(e.target.value)}
                                disabled={busy}
                              />
                              <small>
                                Pembeli akan melihat alasan ini. Stok
                                dikembalikan setelah pembatalan berhasil.
                              </small>
                              <div className={s.row}>
                                <button
                                  type="button"
                                  className={s.secondary}
                                  disabled={busy}
                                  onClick={() => setCancelling(null)}
                                >
                                  Kembali
                                </button>
                                <button
                                  type="submit"
                                  className={s.danger}
                                  disabled={busy || !reason.trim()}
                                >
                                  {busy
                                    ? "Membatalkan…"
                                    : "Konfirmasi pembatalan"}
                                </button>
                              </div>
                            </form>
                          )}
                        </>
                      )}
                    </article>
                  ))
                )}
              </section>
              {section === "dashboard" && (
                <section className={s.liveListings}>
                  <div className={s.row}>
                    <h2>Listing tayang</h2>
                    <button className={s.textButton} onClick={onListings}>
                      Kelola listing
                    </button>
                  </div>
                  {!current.length ? (
                    <div className={s.empty}>
                      <p>Belum ada listing tayang.</p>
                      <button className={s.primary} onClick={onAdd}>
                        Tambah listing pertama
                      </button>
                    </div>
                  ) : (
                    current.map((item) => (
                      <article className={s.liveRow} key={item.id}>
                        <div className={s.thumb}>
                          <ListingImage src={item.image} alt={item.name} />
                        </div>
                        <div>
                          <h3>{item.name}</h3>
                          <p>
                            {rupiah(item.price)} · {item.stock} porsi
                          </p>
                          <small>Ambil sebelum {pickup(item.pickup_end)}</small>
                        </div>
                        <button
                          className={s.secondary}
                          disabled={busy}
                          onClick={() => void sold(item)}
                        >
                          Tandai habis {item.name}
                        </button>
                        <PickupProgress item={item} now={now} />
                      </article>
                    ))
                  )}
                </section>
              )}
            </div>
          )
        )}
      </div>
    </section>
  );
}
