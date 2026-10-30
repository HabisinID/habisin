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
  recent_activity: ModerationEntry[];
  complaints_available: boolean;
  complaints_open: number;
  complaints_new: number;
  complaints_reviewed: number;
  complaints_unresolved: number;
  complaint_preview: {
    id: number;
    listing_name: string;
    store_name: string;
    reason_label: string;
    created_at: string;
  }[];
  partner_approval_available: boolean;
  partner_approvals_pending: number;
  partner_approval_preview: {
    id: number;
    name: string;
    store_name: string | null;
    category: string | null;
    neighborhood: string | null;
    requested_at: string;
  }[];
  pickup_portions_today: number;
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
const relativeTime = (value: string) => {
  const hours = Math.max(
    0,
    Math.floor((Date.now() - new Date(value).getTime()) / 3_600_000),
  );
  if (hours < 1) return "<1 jam";
  if (hours < 24) return `${hours} jam`;
  const days = Math.floor(hours / 24);
  return `${days} hari`;
};
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
              <div className="flex items-center gap-3">
                <ShieldAlert size={24} className="text-urgency-text" />
                <div>
                  <h2 className={s.title}>Laporan komplain terbuka</h2>
                  <p className={s.muted}>
                    {summary.complaints_new ?? summary.complaints_open ?? 0} baru · {summary.complaints_reviewed ?? 0} sedang ditinjau
                  </p>
                </div>
                <strong className="ml-auto font-mono text-2xl">
                  {summary.complaints_unresolved ?? summary.complaints_open ?? 0}
                </strong>
              </div>
              {summary.complaint_preview?.length ? (
                <ul className="-mx-6 mt-5 divide-y divide-line border-y border-line">
                  {summary.complaint_preview.slice(0, 3).map((complaint) => (
                    <li key={complaint.id} className="flex items-center gap-4 px-6 py-3">
                      <span className="shrink-0 font-mono text-xs text-muted">
                        LK-{String(complaint.id).padStart(4, "0")}
                      </span>
                      <span className="min-w-0 flex-1">
                        <strong className="block truncate text-sm">{complaint.listing_name}</strong>
                        <span className={s.muted}>
                          {complaint.reason_label} · {complaint.store_name}
                        </span>
                      </span>
                      <time className="shrink-0 font-mono text-xs" dateTime={complaint.created_at}>
                        {dateTime(complaint.created_at)}
                      </time>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className={`${s.muted} mt-5`}>Tidak ada laporan komplain terbuka.</p>
              )}
              <Link href="/admin/complaints" className="mt-4 inline-flex items-center gap-2 font-semibold text-brand hover:underline">
                Buka laporan komplain <ArrowRight size={16} aria-hidden="true" />
              </Link>
            </section>
            <section className={s.card}>
              <div className="flex items-center gap-3">
                <h2 className={s.title}>Pendaftaran mitra menunggu</h2>
                <strong className="ml-auto font-mono text-2xl">
                  {summary.partner_approvals_pending ?? 0}
                </strong>
              </div>
              <p className={`${s.muted} mt-1`}>
                Menunggu persetujuan admin.
              </p>
              {summary.partner_approval_preview?.length ? (
                <ul className="-mx-6 mt-5 divide-y divide-line border-y border-line">
                  {summary.partner_approval_preview.slice(0, 3).map((approval) => (
                    <li key={approval.id} className="flex items-center gap-4 px-6 py-3">
                      <span className="min-w-0 flex-1">
                        <strong className="block truncate text-sm">
                          {approval.store_name || approval.name}
                        </strong>
                        <span className={s.muted}>
                          {approval.store_name
                            ? [approval.category, approval.neighborhood].filter(Boolean).join(" · ") || approval.name
                            : `Pendaftar · ${approval.name}`}
                        </span>
                      </span>
                      <time className="shrink-0 font-mono text-xs" dateTime={approval.requested_at}>
                        {relativeTime(approval.requested_at)}
                      </time>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className={`${s.muted} mt-5`}>Tidak ada pendaftaran mitra yang menunggu.</p>
              )}
              <Link href="/admin/partner-approval" className="mt-4 inline-flex items-center gap-2 font-semibold text-brand hover:underline">
                Buka pendaftaran mitra ({summary.partner_approvals_pending ?? 0}) <ArrowRight size={16} aria-hidden="true" />
              </Link>
            </section>
          </div>
          <p className="font-mono text-xs text-muted mt-7">DATA APLIKASI</p>
          <div className={s.metrics}>
            {[
              [summary.listings_live, "listing tayang"],
              [summary.orders_today, "pesanan hari ini"],
              [summary.partners_active, "mitra aktif"],
              [summary.pickup_portions_today ?? 0, "porsi terselamatkan hari ini"],
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
