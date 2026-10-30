"use client";
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, EyeOff, Flag, Search } from "lucide-react";
import RoleWorkspace from "./role-workspace";
import Modal from "./modal";
import { api, rupiah, type Listing } from "@/lib/api";

type Report = { description: string; created_at: string };
type AdminListing = Listing & { report_count: number; reports: Report[] };
type PageData = { results: AdminListing[]; count: number };
type Filter = "all" | "reported" | "free" | "soon";
type Sort = "reports" | "deadline" | "newest";

const PAGE_SIZE = 7;

const quickReasons = [
  "Makanan basi / berbau",
  "Foto tidak sesuai",
  "Harga menyesatkan",
  "Bukan makanan",
];

const sorts: { value: Sort; label: string }[] = [
  { value: "reports", label: "Laporan terbanyak" },
  { value: "deadline", label: "Batas ambil terdekat" },
  { value: "newest", label: "Terbaru" },
];

const grid =
  "grid grid-cols-[48px_minmax(0,1.5fr)_minmax(0,1.2fr)_96px_56px_110px_80px_120px] items-center gap-4";

const clock = (value: string) =>
  new Date(value).toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  });

const time = (value: string) => new Date(value).getTime();

const minutesLeft = (end: string, now: number) =>
  Math.floor((time(end) - now) / 60000);

const leftLabel = (end: string, now: number) => {
  const minutes = Math.max(0, minutesLeft(end, now));
  if (minutes < 60) return `${minutes} mnt lagi`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} j ${m} m lagi` : `${h} j lagi`;
};

export default function AdminListings() {
  return (
    <RoleWorkspace
      role="admin"
      title="Listing publik"
      subtitle="Take-down darurat langsung menyembunyikan listing dari peta dan pencarian."
    >
      {() => <ListingsContent />}
    </RoleWorkspace>
  );
}

function ListingsContent() {
  const [items, setItems] = useState<AdminListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("reports");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [now, setNow] = useState(() => Date.now());
  const [updatedAt, setUpdatedAt] = useState("");
  const [target, setTarget] = useState<AdminListing | null>(null);
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");

  useEffect(() => {
    const c = new AbortController();
    api<PageData>(
      "admin/listings?status=live&page_size=100",
      "GET",
      undefined,
      c.signal,
    )
      .then((data) => {
        if (c.signal.aborted) return;
        setItems(data.results);
        setUpdatedAt(clock(new Date().toISOString()));
      })
      .catch((e) => !c.signal.aborted && setError(e.message))
      .finally(() => !c.signal.aborted && setLoading(false));
    return () => c.abort();
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);

  if (loading) return <p>Memuat…</p>;
  if (error) return <p role="alert">{error}</p>;

  const search = query.trim().toLowerCase();
  const searched = items.filter(
    (l) =>
      !search ||
      l.name.toLowerCase().includes(search) ||
      l.store.toLowerCase().includes(search),
  );
  const matches: Record<Filter, (l: AdminListing) => boolean> = {
    all: () => true,
    reported: (l) => l.report_count > 0,
    free: (l) => l.price === 0,
    soon: (l) => {
      const m = minutesLeft(l.pickup_end, now);
      return m >= 0 && m < 60;
    },
  };
  const sorters: Record<Sort, (a: AdminListing, b: AdminListing) => number> = {
    reports: (a, b) =>
      b.report_count - a.report_count ||
      time(a.pickup_end) - time(b.pickup_end),
    deadline: (a, b) => time(a.pickup_end) - time(b.pickup_end),
    newest: (a, b) => b.id - a.id,
  };
  const filtered = searched.filter(matches[filter]).sort(sorters[sort]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const rows = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
  const tooShort = reason.length > 0 && reason.trim().length < 20;
  const canSubmit =
    reason.trim().length >= 20 &&
    (!target || target.report_count === 0 || confirmed);

  const chips: { value: Filter; label: string }[] = [
    { value: "all", label: "Semua" },
    { value: "reported", label: "Dilaporkan" },
    { value: "free", label: "Gratis" },
    { value: "soon", label: "Batas ambil < 1 jam" },
  ];

  function openTakeDown(listing: AdminListing) {
    setTarget(listing);
    setReason("");
    setConfirmed(false);
    setActionError("");
  }

  async function takeDown() {
    if (!target) return;
    setBusy(true);
    setActionError("");
    try {
      await api<Listing>(`admin/listings/${target.id}/moderate`, "POST", {
        action: "take_down",
        reason: reason.trim(),
      });
      setItems((list) => list.filter((l) => l.id !== target.id));
      setNotice(`${target.name} diturunkan dan dicatat di Log moderasi.`);
      setTarget(null);
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {notice && (
        <p
          role="status"
          className="mb-4 rounded-xl border border-line bg-[var(--color-light)] px-4 py-3 text-sm font-semibold"
        >
          {notice}
        </p>
      )}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <label className="relative block w-full max-w-sm">
          <span className="sr-only">Cari listing atau toko</span>
          <Search
            size={16}
            aria-hidden
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-muted)]"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            placeholder="Cari listing atau toko…"
            className="min-h-10 w-full rounded-xl border border-line bg-transparent pl-9 pr-3 text-sm"
          />
        </label>
        <label className="flex items-center gap-2 text-xs text-[var(--color-muted)]">
          Urut:
          <select
            value={sort}
            onChange={(e) => {
              setSort(e.target.value as Sort);
              setPage(1);
            }}
            className="min-h-10 rounded-xl border border-line bg-transparent px-3 text-sm text-[var(--color-dark)]"
          >
            {sorts.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div
        className="mb-4 flex flex-wrap gap-2"
        role="group"
        aria-label="Filter listing"
      >
        {chips.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            aria-pressed={filter === value}
            onClick={() => {
              setFilter(value);
              setPage(1);
            }}
            className={`min-h-9 rounded-full border px-4 text-sm font-semibold ${
              filter === value
                ? "border-transparent bg-[var(--color-dark)] text-[var(--color-cream)]"
                : "border-line"
            }`}
          >
            {label} {searched.filter(matches[value]).length}
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line py-12 text-center font-semibold">
          Tidak ada listing yang cocok.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <div className="min-w-[900px]">
            <div
              className={`${grid} border-b border-line pb-2 text-xs font-semibold uppercase text-[var(--color-muted)]`}
            >
              <span>Foto</span>
              <span>Listing</span>
              <span>Toko</span>
              <span>Harga</span>
              <span>Stok</span>
              <span>Batas ambil</span>
              <span>Laporan</span>
              <span className="text-right">Aksi</span>
            </div>
            <ul>
              {rows.map((l) => {
                const urgent = minutesLeft(l.pickup_end, now) < 60;
                return (
                  <li
                    key={l.id}
                    className={`${grid} border-b border-line px-1 py-3 ${
                      l.report_count > 0 ? "bg-orange-500/10" : ""
                    }`}
                  >
                    <span
                      aria-hidden
                      className="size-12 rounded-lg bg-[var(--color-light)] bg-cover bg-center"
                      style={{
                        backgroundImage: `url(${JSON.stringify(l.image)})`,
                      }}
                    />
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">
                        {l.name}
                      </span>
                      <span className="block truncate text-xs text-[var(--color-muted)]">
                        {l.category} · tayang {clock(l.pickup_start)}
                      </span>
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm">{l.store}</span>
                      {l.store_summary?.landmark && (
                        <span className="block truncate text-xs text-[var(--color-muted)]">
                          {l.store_summary.landmark}
                        </span>
                      )}
                    </span>
                    <span>
                      <span
                        className={`block font-mono text-sm font-semibold ${
                          l.price === 0 ? "text-green-600" : ""
                        }`}
                      >
                        {rupiah(l.price)}
                      </span>
                      {l.original_price > l.price && (
                        <span className="block font-mono text-xs text-[var(--color-muted)]">
                          {rupiah(l.original_price)}
                        </span>
                      )}
                    </span>
                    <span className="font-mono text-sm">{l.stock}</span>
                    <span>
                      <span className="block font-mono text-sm font-semibold">
                        {clock(l.pickup_end)}
                      </span>
                      <span
                        className={`block text-xs ${
                          urgent
                            ? "font-semibold text-orange-600"
                            : "text-[var(--color-muted)]"
                        }`}
                      >
                        {leftLabel(l.pickup_end, now)}
                      </span>
                    </span>
                    <span>
                      {l.report_count > 0 ? (
                        <span className="inline-flex items-center gap-1 rounded-md bg-orange-500 px-2 py-0.5 text-xs font-bold text-white">
                          <Flag size={12} aria-hidden />
                          {l.report_count}
                        </span>
                      ) : (
                        <span className="font-mono text-sm text-[var(--color-muted)]">
                          0
                        </span>
                      )}
                    </span>
                    <span className="text-right">
                      <button
                        type="button"
                        aria-label={`Take-down ${l.name}`}
                        onClick={() => openTakeDown(l)}
                        className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-red-500 px-3 text-sm font-semibold text-red-500"
                      >
                        <EyeOff size={16} aria-hidden />
                        Take-down
                      </button>
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-[var(--color-muted)]">
        <span>
          Menampilkan {rows.length} dari {filtered.length} listing tayang
          {updatedAt && ` · diperbarui ${updatedAt}`}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Halaman sebelumnya"
            disabled={current === 1}
            onClick={() => setPage(current - 1)}
            className="grid size-9 place-items-center rounded-lg hover:bg-[var(--color-light)] disabled:opacity-40"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="font-mono font-semibold">
            {current} / {pages}
          </span>
          <button
            type="button"
            aria-label="Halaman berikutnya"
            disabled={current === pages}
            onClick={() => setPage(current + 1)}
            className="grid size-9 place-items-center rounded-lg hover:bg-[var(--color-light)] disabled:opacity-40"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {target && (
        <Modal
          title={`Take-down ${target.name}?`}
          onClose={() => !busy && setTarget(null)}
        >
          <p className="mb-4 text-sm text-[var(--color-muted)]">
            Listing langsung hilang dari peta dan pencarian. Pesanan yang sudah
            dibayar tetap berlaku.
          </p>

          <div className="mb-4 rounded-xl bg-orange-500/10 p-3">
            <div className="flex items-center gap-3">
              <span
                aria-hidden
                className="size-14 shrink-0 rounded-lg bg-[var(--color-light)] bg-cover bg-center"
                style={{
                  backgroundImage: `url(${JSON.stringify(target.image)})`,
                }}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">
                  {target.name} · {rupiah(target.price)}
                </p>
                <p className="truncate text-xs text-[var(--color-muted)]">
                  {target.store} · {target.stock} porsi · ambil s.d.{" "}
                  {clock(target.pickup_end)}
                </p>
              </div>
              {target.report_count > 0 && (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-orange-500 px-2.5 py-1 text-xs font-bold text-white">
                  <Flag size={12} aria-hidden />
                  {target.report_count} laporan
                </span>
              )}
            </div>
            {target.reports.map((r) => (
              <p
                key={r.created_at + r.description}
                className="mt-3 line-clamp-3 text-xs italic text-[var(--color-muted)]"
              >
                “{r.description}” — Pembeli, {clock(r.created_at)}
              </p>
            ))}
          </div>

          <p className="mb-2 text-xs font-semibold text-[var(--color-muted)]">
            Alasan cepat (mengisi kolom di bawah)
          </p>
          <div className="mb-4 flex flex-wrap gap-2">
            {quickReasons.map((text) => (
              <button
                key={text}
                type="button"
                onClick={() => setReason(text)}
                className="min-h-9 rounded-full border border-line px-3 text-sm hover:bg-[var(--color-light)]"
              >
                {text}
              </button>
            ))}
          </div>

          <label
            htmlFor="takedown-reason"
            className="mb-1 block text-sm font-semibold"
          >
            Alasan take-down *
          </label>
          <textarea
            id="takedown-reason"
            rows={4}
            maxLength={300}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            aria-invalid={tooShort}
            aria-describedby="takedown-help"
            className={`w-full rounded-lg border bg-transparent p-3 ${
              tooShort ? "border-red-600" : "border-line"
            }`}
          />
          <div
            id="takedown-help"
            className="mt-1 flex justify-between gap-3 text-xs"
          >
            <span
              className={tooShort ? "text-red-600" : "text-[var(--color-muted)]"}
            >
              {tooShort
                ? "Tulis minimal 20 karakter agar alasannya jelas di Log moderasi."
                : "Wajib, minimal 20 karakter. Tercatat di Log moderasi."}
            </span>
            <span className="text-[var(--color-muted)]">
              {reason.length}/300
            </span>
          </div>

          {target.report_count > 0 && (
            <label className="mt-4 flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                className="mt-1 size-4"
              />
              Saya sudah membaca laporan di atas dan yakin listing ini perlu
              diturunkan sekarang.
            </label>
          )}

          {actionError && (
            <p role="alert" className="mt-3 text-sm text-red-600">
              {actionError}
            </p>
          )}

          <div className="mt-5 flex justify-end gap-3">
            <button
              type="button"
              disabled={busy}
              onClick={() => setTarget(null)}
              className="min-h-11 rounded-xl border border-line px-5 font-semibold disabled:opacity-50"
            >
              Batal
            </button>
            <button
              type="button"
              disabled={busy || !canSubmit}
              onClick={takeDown}
              className="min-h-11 rounded-xl bg-red-600 px-5 font-semibold text-white disabled:opacity-50"
            >
              {busy ? "Memproses…" : "Take-down sekarang"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}