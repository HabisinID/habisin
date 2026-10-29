"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ShieldAlert, PackageOpen, ArrowRight } from "lucide-react";
import { api, rupiah, type Listing, type ModerationEntry } from "@/lib/api";
import RoleWorkspace from "./role-workspace";
import Modal from "./modal";
import s from "./role-workspace.module.css";

type Mode = "summary" | "listings" | "log";
type Summary = {
  listings_live: number;
  orders_today: number;
  partners_active: number;
  stores_open: number;
  listings_taken_down: number;
  recent_activity: ModerationEntry[];
  complaints_available: boolean;
  complaints_open: number;
  partner_approval_available: boolean;
};
type PageData<T> = {
  results: T[];
  count: number;
  page: number;
  page_size: number;
};
const dateTime = (value: string) =>
  new Date(value).toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  });
export default function AdminWorkspace({ mode = "summary" }: { mode?: Mode }) {
  return (
    <RoleWorkspace
      role="admin"
      title={
        mode === "summary"
          ? "Ringkasan hari ini"
          : mode === "listings"
            ? "Listing"
            : "Log moderasi"
      }
      subtitle={
        mode === "summary"
          ? "Data aplikasi saat ini dan aktivitas moderasi terbaru."
          : mode === "listings"
            ? "Tinjau penawaran dan hentikan listing yang melanggar aturan."
            : "Riwayat penurunan dan pemulihan listing, beserta alasan dan pelaku."
      }
      actions={
        mode === "summary" ? (
          <Link href="/admin/listings">
            Kelola listing <ArrowRight size={14} className="inline" />
          </Link>
        ) : undefined
      }
    >
      {() => <AdminContent mode={mode} />}
    </RoleWorkspace>
  );
}
function LogTable({ entries }: { entries: ModerationEntry[] }) {
  return (
    <div className={s.tableWrap}>
      <table className={s.table}>
        <thead>
          <tr>
            {["Waktu", "Admin", "Target", "Tindakan", "Alasan"].map((label) => (
              <th key={label} scope="col">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.id}>
              <td data-label="Waktu" className={s.mono}>
                {dateTime(entry.created_at)} WIB
              </td>
              <td data-label="Admin">{entry.actor_name}</td>
              <td data-label="Target">
                <strong>{entry.target_name}</strong>
                <p className={s.muted}>{entry.store_name}</p>
              </td>
              <td data-label="Tindakan">
                <span
                  className={`${s.badge} ${entry.action === "take_down" ? s.removed : ""}`}
                >
                  {entry.action === "take_down" ? "Turunkan" : "Pulihkan"}
                </span>
              </td>
              <td
                data-label="Alasan"
                className="max-w-sm whitespace-pre-wrap break-words"
              >
                {entry.reason}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function AdminContent({ mode }: { mode: Mode }) {
  const [summary, setSummary] = useState<Summary | null>(null),
    [items, setItems] = useState<PageData<Listing> | null>(null),
    [logs, setLogs] = useState<PageData<ModerationEntry> | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [query, setQuery] = useState(""),
    [search, setSearch] = useState(""),
    [status, setStatus] = useState("all"),
    [page, setPage] = useState(1),
    [target, setTarget] = useState<Listing | null>(null),
    [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false),
    [actionError, setActionError] = useState("");
  const generation = useRef(0);
  const load = useCallback(
    (signal?: AbortSignal) => {
      const id = ++generation.current;
      const params = new URLSearchParams({
        page: String(page),
        ...(search ? { q: search } : {}),
        ...(status !== "all"
          ? { [mode === "log" ? "action" : "status"]: status }
          : {}),
      });
      const active = () => !signal?.aborted && id === generation.current;
      const request =
        mode === "summary"
          ? api<Summary>("admin/summary", "GET", undefined, signal).then(
              (data) => {
                if (active()) setSummary(data);
              },
            )
          : mode === "listings"
            ? api<PageData<Listing>>(
                `admin/listings?${params}`,
                "GET",
                undefined,
                signal,
              ).then((data) => {
                if (active()) setItems(data);
              })
            : api<PageData<ModerationEntry>>(
                `admin/moderation-logs?${params}`,
                "GET",
                undefined,
                signal,
              ).then((data) => {
                if (active()) setLogs(data);
              });
      return request
        .then(() => {
          if (active()) setError("");
        })
        .catch((e) => {
          if (active()) setError(e.message);
        })
        .finally(() => {
          if (active()) setLoading(false);
        });
    },
    [mode, page, status, search],
  );
  useEffect(() => {
    const c = new AbortController();
    void load(c.signal);
    const focus = () => void load(c.signal);
    window.addEventListener("focus", focus);
    return () => {
      c.abort();
      window.removeEventListener("focus", focus);
    };
  }, [load]);
  async function moderate(e: React.FormEvent) {
    e.preventDefault();
    if (!target || busy || !reason.trim()) return;
    setBusy(true);
    setActionError("");
    try {
      await api<Listing>(`admin/listings/${target.id}/moderate`, "POST", {
        action: target.moderated_at ? "restore" : "take_down",
        reason: reason.trim(),
      });
      setNotice(
        target.moderated_at
          ? "Kunci listing dilepas. Listing tetap nonaktif sampai mitra menayangkan lagi."
          : "Listing diturunkan. Penawaran dihentikan dan mitra tidak dapat mengubahnya.",
      );
      setTarget(null);
      await load();
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const current = mode === "log" ? logs : items;
  return (
    <section
      aria-label={
        mode === "summary"
          ? "Ringkasan admin"
          : mode === "listings"
            ? "Moderasi listing"
            : "Riwayat moderasi"
      }
    >
      {error && (
        <p role="alert" className={s.error}>
          {error} <button onClick={() => void load()}>Coba lagi admin</button>
        </p>
      )}
      {notice && (
        <p role="status" className={s.message}>
          {notice}
        </p>
      )}
      {mode !== "summary" && (
        <div className={s.toolbar}>
          <form
            className={s.row}
            onSubmit={(e) => {
              e.preventDefault();
              setSearch(query.trim());
              setPage(1);
            }}
          >
            <label className="sr-only" htmlFor="admin-search">
              Cari listing atau toko
            </label>
            <input
              id="admin-search"
              className={s.field}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cari listing atau toko"
            />
            <button className={s.secondary}>Cari</button>
          </form>
          <label className={s.label}>
            Filter
            <select
              className={s.field}
              aria-label="Filter moderasi"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
            >
              <option value="all">Semua</option>
              {mode === "listings" ? (
                <>
                  <option value="live">Tayang</option>
                  <option value="removed">Diturunkan</option>
                </>
              ) : (
                <>
                  <option value="take_down">Turunkan</option>
                  <option value="restore">Pulihkan</option>
                </>
              )}
            </select>
          </label>
        </div>
      )}
      {loading && !current && !summary ? (
        <div role="status" aria-label="Memuat data admin">
          {[1, 2, 3].map((i) => (
            <div key={i} className={s.skeleton} />
          ))}
        </div>
      ) : mode === "summary" && summary ? (
        <>
          <div className={s.two}>
            <section className={s.card}>
              <ShieldAlert size={24} className="text-urgency-text" />
              <h2 className={`${s.title} mt-4`}>Laporan komplain</h2>
              <p className={`${s.muted} my-3`}>
                {summary.complaints_open ?? 0} laporan menunggu atau sedang ditinjau.
              </p>
              <Link href="/admin/complaints" className={s.secondary}>
                Tinjau laporan komplain
              </Link>
            </section>
            <section className={s.card}>
              <h2 className={s.title}>Pendaftaran mitra</h2>
              <p className={`${s.muted} my-3`}>
                Peninjauan pendaftaran belum tersedia. Jumlah mitra aktif
                ditampilkan dari akun yang ada.
              </p>
              <Link href="/admin/listings" className={s.secondary}>
                Tinjau listing saat ini
              </Link>
            </section>
          </div>
          <p className="font-mono text-xs text-muted mt-7">DATA APLIKASI</p>
          <div className={s.metrics}>
            {[
              [summary.listings_live, "listing tayang"],
              [summary.orders_today, "pesanan dibuat hari ini"],
              [summary.partners_active, "akun mitra aktif"],
              [summary.stores_open, "toko aktif"],
            ].map(([value, label]) => (
              <div key={label}>
                <strong>{value}</strong>
                <span className={s.muted}>{label}</span>
              </div>
            ))}
          </div>
          <div className={`${s.rowBetween} mb-5`}>
            <h2 className={s.title}>Aktivitas moderasi terbaru</h2>
            <Link className="text-brand font-semibold" href="/admin/log">
              Buka Log moderasi <ArrowRight size={14} className="inline" />
            </Link>
          </div>
          {summary.recent_activity.length ? (
            <LogTable entries={summary.recent_activity} />
          ) : (
            <div className={s.empty}>
              <h3 className={s.title}>Belum ada aktivitas moderasi.</h3>
              <p className={s.muted}>
                Tindakan turunkan/pulihkan listing akan muncul di sini.
              </p>
            </div>
          )}
        </>
      ) : mode === "listings" && items ? (
        <>
          <p className={`${s.muted} mb-4`}>
            {items.count} listing · pesanan lama tetap berlaku saat listing
            diturunkan.
          </p>
          {!items.results.length ? (
            <div className={s.empty}>
              <PackageOpen size={32} />
              <h2 className={s.title}>Belum ada listing pada filter ini.</h2>
            </div>
          ) : (
            <div className={s.tableWrap}>
              <table className={s.table}>
                <thead>
                  <tr>
                    {["Listing / Toko", "Harga / Stok", "Status", "Aksi"].map(
                      (label) => (
                        <th key={label}>{label}</th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {items.results.map((item) => (
                    <tr key={item.id}>
                      <td data-label="Listing">
                        <strong>{item.name}</strong>
                        <p className={s.muted}>{item.store}</p>
                        {item.moderated_at && (
                          <p className="text-error mt-2 whitespace-pre-wrap break-words">
                            {item.moderation_reason}
                          </p>
                        )}
                      </td>
                      <td data-label="Harga / Stok">
                        {rupiah(item.price)} · {item.stock} porsi
                      </td>
                      <td data-label="Status">
                        <span
                          className={`${s.badge} ${item.moderated_at ? s.removed : ""}`}
                        >
                          {item.moderated_at
                            ? "Diturunkan"
                            : item.active
                              ? "Aktif"
                              : "Nonaktif"}
                        </span>
                      </td>
                      <td data-label="Aksi">
                        <button
                          className={item.moderated_at ? s.secondary : s.danger}
                          onClick={() => {
                            setTarget(item);
                            setReason("");
                            setActionError("");
                          }}
                        >
                          {item.moderated_at ? "Pulihkan" : "Turunkan"}{" "}
                          {item.name}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : mode === "log" && logs ? (
        logs.results.length ? (
          <LogTable entries={logs.results} />
        ) : (
          <div className={s.empty}>
            <h2 className={s.title}>Tidak ada log pada filter ini.</h2>
          </div>
        )
      ) : null}
      {current && current.count > current.page_size && (
        <div className={`${s.rowBetween} mt-6`}>
          <button
            className={s.secondary}
            disabled={page === 1 || loading}
            onClick={() => setPage(page - 1)}
          >
            Sebelumnya
          </button>
          <span>
            Halaman {page} dari {Math.ceil(current.count / current.page_size)}
          </span>
          <button
            className={s.secondary}
            disabled={page * current.page_size >= current.count || loading}
            onClick={() => setPage(page + 1)}
          >
            Berikutnya
          </button>
        </div>
      )}
      {target && (
        <Modal
          title={
            target.moderated_at ? "Pulihkan listing?" : "Turunkan listing?"
          }
          onClose={() => {
            if (!busy) setTarget(null);
          }}
        >
          <form className={s.form} onSubmit={moderate}>
            <h3 className={s.title}>
              {target.name} · {target.store}
            </h3>
            <p>
              {target.moderated_at
                ? "Kunci admin dilepas. Listing tetap nonaktif sampai mitra menayangkan lagi."
                : "Listing hilang dari peta/pencarian dan terkunci bagi mitra. Pesanan lama tidak dibatalkan otomatis."}
            </p>
            <label className={s.label}>
              Alasan (wajib)
              <textarea
                autoFocus
                className={s.field}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                required
                maxLength={500}
                rows={4}
              />
            </label>
            {actionError && (
              <p className={s.error} role="alert">
                {actionError}
              </p>
            )}
            <div className={s.actions}>
              <button
                className={s.secondary}
                type="button"
                disabled={busy}
                onClick={() => setTarget(null)}
              >
                Batal
              </button>
              <button
                className={target.moderated_at ? s.primary : s.danger}
                disabled={busy || !reason.trim()}
              >
                {busy
                  ? "Menyimpan…"
                  : target.moderated_at
                    ? "Ya, pulihkan"
                    : "Ya, turunkan"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  );
}
