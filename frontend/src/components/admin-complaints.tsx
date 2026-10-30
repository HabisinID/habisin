"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Flag, PackageOpen, Search } from "lucide-react";
import { api, rupiah } from "@/lib/api";
import Modal from "./modal";
import RoleWorkspace from "./role-workspace";
import styles from "./admin-complaints.module.css";

type ComplaintStatus = "open" | "reviewed" | "resolved";
type Complaint = {
  id: number;
  status: ComplaintStatus;
  status_label: string;
  reason: string;
  reason_label: string;
  description: string;
  created_at: string;
  buyer_name: string;
  buyer_username: string;
  store_name: string;
  listing_id: number;
  listing_name: string;
  listing_image: string;
  listing_active: boolean;
  listing_moderated_at: string | null;
  listing_moderation_reason: string;
  reservation_id: number;
  reservation_code: string;
  reservation_status: string;
  quantity: number;
  total: number;
  picked_up_at: string | null;
};
type ComplaintPage = {
  results: Complaint[];
  count: number;
  page: number;
  page_size: number;
  counts: Partial<Record<ComplaintStatus, number>>;
};

const filters: { value: ComplaintStatus | "all"; label: string }[] = [
  { value: "open", label: "Terbuka" },
  { value: "reviewed", label: "Sedang ditinjau" },
  { value: "resolved", label: "Selesai" },
  { value: "all", label: "Semua" },
];
const formatDate = (value: string) =>
  new Date(value).toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  });
const statusClass = (status: ComplaintStatus) =>
  status === "resolved"
    ? styles.resolved
    : status === "reviewed"
      ? styles.reviewed
      : styles.open;

export default function AdminComplaints() {
  return (
    <RoleWorkspace
      role="admin"
      title="Laporan komplain"
      subtitle="Tinjau laporan pembeli dan tentukan tindak lanjut untuk listing."
    >
      {() => <AdminComplaintsContent />}
    </RoleWorkspace>
  );
}

function AdminComplaintsContent() {
  const [status, setStatus] = useState<ComplaintStatus | "all">("open");
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ComplaintPage | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [takeDownReason, setTakeDownReason] = useState("");
  const [takeDownOpen, setTakeDownOpen] = useState(false);
  const generation = useRef(0);

  const load = useCallback(
    (signal?: AbortSignal) => {
      const request = ++generation.current;
      const params = new URLSearchParams({
        status,
        page: String(page),
        ...(search ? { q: search } : {}),
      });
      const active = () => !signal?.aborted && request === generation.current;
      return api<ComplaintPage>(
        `admin/complaints?${params}`,
        "GET",
        undefined,
        signal,
      )
        .then((result) => {
          if (!active()) return;
          setData(result);
          setSelectedId((current) =>
            result.results.some((item) => item.id === current)
              ? current
              : result.results[0]?.id ?? null,
          );
          setError("");
        })
        .catch((reason: Error) => {
          if (active()) setError(reason.message);
        })
        .finally(() => {
          if (active()) setLoading(false);
        });
    },
    [page, search, status],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    const refresh = () => void load(controller.signal);
    window.addEventListener("focus", refresh);
    return () => {
      controller.abort();
      window.removeEventListener("focus", refresh);
    };
  }, [load]);

  const selected = data?.results.find((item) => item.id === selectedId) ?? null;
  const updateStatus = async (nextStatus: "reviewed" | "resolved") => {
    if (!selected || busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api<Complaint>(`admin/complaints/${selected.id}`, "PATCH", {
        status: nextStatus,
      });
      setNotice(
        nextStatus === "resolved"
          ? "Laporan ditandai selesai."
          : "Laporan ditandai sedang ditinjau.",
      );
      await load();
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const takeDown = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selected || busy || !takeDownReason.trim()) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api(`admin/listings/${selected.listing_id}/moderate`, "POST", {
        action: "take_down",
        reason: takeDownReason.trim(),
      });
      await api<Complaint>(`admin/complaints/${selected.id}`, "PATCH", {
        status: "resolved",
      });
      setTakeDownOpen(false);
      setTakeDownReason("");
      setNotice("Listing diturunkan dan laporan ditandai selesai.");
      await load();
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const counts = data?.counts ?? {};
  return (
    <section className={styles.page} aria-label="Antrean laporan komplain">
      {error && (
        <p className={styles.error} role="alert">
          {error} <button onClick={() => void load()}>Coba lagi</button>
        </p>
      )}
      {notice && (
        <p className={styles.notice} role="status">
          {notice}
        </p>
      )}
      <div className={styles.layout}>
        <section className={styles.queue} aria-label="Daftar laporan komplain">
          <div className={styles.queueHeader}>
            <div>
              <p className={styles.eyebrow}>Pusat penanganan</p>
              <h2>Laporan pembeli</h2>
            </div>
            <span className={styles.total}>{data?.count ?? "—"} laporan</span>
          </div>
          <form
            className={styles.search}
            onSubmit={(event) => {
              event.preventDefault();
              setPage(1);
              setSearch(query.trim());
            }}
          >
            <label className="sr-only" htmlFor="complaint-search">
              Cari laporan
            </label>
            <input
              id="complaint-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Cari laporan, makanan, toko, atau pembeli"
            />
            <button aria-label="Cari laporan">
              <Search size={17} />
            </button>
          </form>
          <div className={styles.filters} aria-label="Filter status laporan">
            {filters.map((filter) => (
              <button
                key={filter.value}
                type="button"
                aria-pressed={status === filter.value}
                onClick={() => {
                  setStatus(filter.value);
                  setPage(1);
                }}
              >
                {filter.label}
                {filter.value === "all"
                  ? ` ${Object.values(counts).reduce((sum, count) => sum + (count ?? 0), 0)}`
                  : ` ${counts[filter.value] ?? 0}`}
              </button>
            ))}
          </div>
          {loading && !data ? (
            <div className={styles.empty} role="status">
              Memuat laporan…
            </div>
          ) : data?.results.length ? (
            <div className={styles.tableWrap}>
              <table>
                <thead>
                  <tr>
                    <th scope="col">Nomor</th>
                    <th scope="col">Kategori</th>
                    <th scope="col">Listing · toko</th>
                    <th scope="col">Waktu</th>
                    <th scope="col">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.results.map((item) => (
                    <tr
                      key={item.id}
                      className={item.id === selectedId ? styles.selectedRow : ""}
                      aria-selected={item.id === selectedId}
                      tabIndex={0}
                      onClick={() => setSelectedId(item.id)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setSelectedId(item.id);
                        }
                      }}
                    >
                      <td>
                        <button
                          type="button"
                          className={styles.rowSelect}
                          aria-current={item.id === selectedId ? "true" : undefined}
                        >
                          LK-{String(item.id).padStart(4, "0")}
                        </button>
                      </td>
                      <td>{item.reason_label}</td>
                      <td>
                        <strong>{item.listing_name}</strong>
                        <small>{item.store_name}</small>
                      </td>
                      <td className={styles.time}>{formatDate(item.created_at)}</td>
                      <td>
                        <span className={`${styles.badge} ${statusClass(item.status)}`}>
                          {item.status_label}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className={styles.empty}>
              <PackageOpen size={30} aria-hidden="true" />
              <h3>
                {status === "open"
                  ? "Tidak ada laporan terbuka."
                  : "Tidak ada laporan pada filter ini."}
              </h3>
              <p>Laporan baru dari pembeli akan muncul di sini.</p>
            </div>
          )}
          {data && data.count > data.page_size && (
            <div className={styles.pagination}>
              <button
                disabled={page <= 1 || loading}
                onClick={() => setPage((current) => current - 1)}
              >
                Sebelumnya
              </button>
              <span>
                Halaman {page} dari {Math.ceil(data.count / data.page_size)}
              </span>
              <button
                disabled={page * data.page_size >= data.count || loading}
                onClick={() => setPage((current) => current + 1)}
              >
                Berikutnya
              </button>
            </div>
          )}
        </section>

        <aside className={styles.detail} aria-label="Detail laporan terpilih">
          {selected ? (
            <>
              <div className={styles.detailHeader}>
                <span className={`${styles.badge} ${statusClass(selected.status)}`}>
                  {selected.status_label}
                </span>
                <span className={styles.time}>LK-{String(selected.id).padStart(4, "0")}</span>
              </div>
              <h2>{selected.reason_label}</h2>
              <p className={styles.detailListing}>
                {selected.listing_name} · {selected.store_name}
              </p>
              <p className={styles.meta}>
                Dari {selected.buyer_name} (@{selected.buyer_username}) ·{" "}
                {formatDate(selected.created_at)} WIB
              </p>
              <div className={styles.complaintText}>
                <h3>Keluhan pembeli</h3>
                <p>{selected.description}</p>
              </div>
              {selected.listing_image && (
                <img
                  className={styles.image}
                  src={selected.listing_image}
                  alt={`Foto ${selected.listing_name}`}
                />
              )}
              <dl className={styles.orderDetails}>
                <div>
                  <dt>Pesanan</dt>
                  <dd>#{selected.reservation_id} · {selected.quantity} porsi</dd>
                </div>
                <div>
                  <dt>Tiket klaim</dt>
                  <dd>{selected.reservation_code}</dd>
                </div>
                <div>
                  <dt>Nilai pesanan</dt>
                  <dd>{selected.total === 0 ? "Gratis" : rupiah(selected.total)}</dd>
                </div>
                <div>
                  <dt>Pengambilan</dt>
                  <dd>
                    {selected.picked_up_at
                      ? `${formatDate(selected.picked_up_at)} WIB`
                      : selected.reservation_status}
                  </dd>
                </div>
              </dl>
              {selected.listing_moderated_at && (
                <p className={styles.takedownInfo}>
                  Listing sudah diturunkan oleh admin.
                  {selected.listing_moderation_reason &&
                    ` Alasan: ${selected.listing_moderation_reason}`}
                </p>
              )}
              {selected.status !== "resolved" && (
                <div className={styles.actions}>
                  {selected.status === "open" && (
                    <button
                      className={styles.secondary}
                      disabled={busy}
                      onClick={() => void updateStatus("reviewed")}
                    >
                      Tandai sedang ditinjau
                    </button>
                  )}
                  <button
                    className={styles.primary}
                    disabled={busy}
                    onClick={() => void updateStatus("resolved")}
                  >
                    <Check size={16} /> Tandai selesai
                  </button>
                  {!selected.listing_moderated_at && (
                    <button
                      className={styles.danger}
                      disabled={busy}
                      onClick={() => {
                        setTakeDownReason("");
                        setTakeDownOpen(true);
                      }}
                    >
                      <Flag size={16} /> Turunkan listing
                    </button>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className={styles.emptyDetail}>
              <Flag size={30} aria-hidden="true" />
              <p>Pilih laporan untuk melihat detail dan tindak lanjut.</p>
            </div>
          )}
        </aside>
      </div>
      {takeDownOpen && selected && (
        <Modal
          title="Turunkan listing?"
          onClose={() => {
            if (!busy) setTakeDownOpen(false);
          }}
        >
          <form className={styles.modalForm} onSubmit={takeDown}>
            <p>
              <strong>{selected.listing_name}</strong> · {selected.store_name}
            </p>
            <p>
              Listing akan disembunyikan dan dikunci. Alasan ini dicatat di log
              moderasi. Laporan akan ditandai selesai setelah listing berhasil
              diturunkan.
            </p>
            <label>
              Alasan penurunan (wajib)
              <textarea
                autoFocus
                value={takeDownReason}
                onChange={(event) => setTakeDownReason(event.target.value)}
                maxLength={500}
                required
                rows={4}
              />
            </label>
            <div className={styles.actions}>
              <button
                type="button"
                className={styles.secondary}
                disabled={busy}
                onClick={() => setTakeDownOpen(false)}
              >
                Batal
              </button>
              <button className={styles.danger} disabled={busy || !takeDownReason.trim()}>
                {busy ? "Memproses…" : "Turunkan listing"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  );
}
