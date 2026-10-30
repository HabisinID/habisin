"use client";
import { useEffect, useState } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  EyeOff,
  RotateCcw,
  X,
} from "lucide-react";
import RoleWorkspace from "./role-workspace";
import { api } from "@/lib/api";

type LogEntry = {
  id: number;
  admin_user: number | null;
  admin_username?: string | null;
  action_type: string;
  target_name: string;
  reason: string;
  created_at: string;
};

type Group = "approve" | "reject" | "takedown" | "restore" | "other";
type Filter = "all" | "approve" | "reject" | "takedown";

const PAGE_SIZE = 7;

const filters: { value: Filter; label: string }[] = [
  { value: "all", label: "Semua" },
  { value: "approve", label: "Approve" },
  { value: "reject", label: "Reject" },
  { value: "takedown", label: "Take-down" },
];

const ranges = [
  { value: "7", label: "7 hari terakhir" },
  { value: "30", label: "30 hari terakhir" },
  { value: "all", label: "Semua waktu" },
];

const kinds: Record<string, { group: Group; label: string; target: string }> =
  {
    APPROVE_PARTNER: { group: "approve", label: "Approve", target: "Mitra" },
    REJECT_PARTNER: { group: "reject", label: "Reject", target: "Mitra" },
    TAKEDOWN_LISTING: {
      group: "takedown",
      label: "Take-down",
      target: "Listing",
    },
    RESTORE_LISTING: { group: "restore", label: "Pulihkan", target: "Listing" },
  };

const kind = (type: string) =>
  kinds[type] ?? { group: "other" as Group, label: type, target: "Lainnya" };

const icons = {
  approve: Check,
  reject: X,
  takedown: EyeOff,
  restore: RotateCcw,
};

const badgeStyle: Record<Group, string> = {
  approve: "bg-green-500/15 text-green-600",
  reject: "border border-red-500 text-red-500",
  takedown: "bg-orange-500/15 text-orange-500",
  restore: "bg-sky-500/15 text-sky-500",
  other: "border border-line",
};

const grid =
  "grid grid-cols-[84px_150px_minmax(0,1.2fr)_120px_minmax(0,2fr)] items-center gap-4";

const day = (value: string) =>
  new Date(value).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    timeZone: "Asia/Jakarta",
  });

const clock = (value: string) =>
  new Date(value).toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  });

const csvCell = (value: string) => {
  const safe = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
};

function exportCsv(rows: LogEntry[]) {
  const header = ["Waktu", "Admin", "Target", "Tindakan", "Alasan"];
  const lines = rows.map((l) => [
    `${day(l.created_at)} ${clock(l.created_at)}`,
    l.admin_username || "Admin dihapus",
    l.target_name,
    kind(l.action_type).label,
    l.reason,
  ]);
  const text = [header, ...lines]
    .map((row) => row.map(csvCell).join(","))
    .join("\r\n");
  const url = URL.createObjectURL(
    new Blob(["\ufeff" + text], { type: "text/csv;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = "log-moderasi.csv";
  link.click();
  URL.revokeObjectURL(url);
}

export default function AdminModerationLog() {
  return (
    <RoleWorkspace
      role="admin"
      title="Log moderasi"
      subtitle="Semua Approve, Reject, dan Take-down tercatat otomatis."
    >
      {() => <ModerationLogContent />}
    </RoleWorkspace>
  );
}

function ModerationLogContent() {
  const [items, setItems] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [range, setRange] = useState("7");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const c = new AbortController();
    api<LogEntry[]>("admin/activity-logs", "GET", undefined, c.signal)
      .then((v) => !c.signal.aborted && setItems(v))
      .catch((e) => !c.signal.aborted && setError(e.message))
      .finally(() => !c.signal.aborted && setLoading(false));
    return () => c.abort();
  }, []);

  if (loading) return <p>Memuat…</p>;
  if (error) return <p role="alert">{error}</p>;

  const cutoff = range === "all" ? 0 : Date.now() - Number(range) * 86400000;
  const inRange = items.filter(
    (l) => new Date(l.created_at).getTime() >= cutoff,
  );
  const matches = (value: Filter) =>
    value === "all"
      ? inRange
      : inRange.filter((l) => kind(l.action_type).group === value);
  const filtered = matches(filter);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const rows = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
  const rangeLabel = ranges.find((r) => r.value === range)?.label;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div
          className="flex flex-wrap gap-2"
          role="group"
          aria-label="Filter tindakan"
        >
          {filters.map(({ value, label }) => (
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
              {label} {matches(value).length}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Rentang waktu"
            value={range}
            onChange={(e) => {
              setRange(e.target.value);
              setPage(1);
            }}
            className="min-h-10 rounded-xl border border-line bg-transparent px-3 text-sm"
          >
            {ranges.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={!filtered.length}
            onClick={() => exportCsv(filtered)}
            className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-line px-4 text-sm font-semibold disabled:opacity-50"
          >
            <Download size={16} aria-hidden />
            Ekspor CSV
          </button>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line py-12 text-center font-semibold">
          Belum ada catatan moderasi pada filter ini.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <div className="min-w-[760px]">
            <div
              className={`${grid} border-b border-line pb-2 text-xs font-semibold uppercase text-[var(--color-muted)]`}
            >
              <span>Waktu</span>
              <span>Admin</span>
              <span>Target</span>
              <span>Tindakan</span>
              <span>Alasan</span>
            </div>
            <ul>
              {rows.map((l) => {
                const k = kind(l.action_type);
                const Icon = icons[k.group as keyof typeof icons];
                const admin = l.admin_username || "Admin dihapus";
                return (
                  <li key={l.id} className={`${grid} border-b border-line py-3`}>
                    <span>
                      <span className="block text-sm font-semibold">
                        {day(l.created_at)}
                      </span>
                      <span className="block font-mono text-xs text-[var(--color-muted)]">
                        {clock(l.created_at)}
                      </span>
                    </span>
                    <span className="flex items-center gap-2 text-sm">
                      <span
                        aria-hidden
                        className="grid size-7 shrink-0 place-items-center rounded-full bg-[var(--color-light)] text-xs font-bold"
                      >
                        {admin.slice(0, 2).toUpperCase()}
                      </span>
                      <span className="truncate">{admin}</span>
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">
                        {l.target_name}
                      </span>
                      <span className="block text-xs text-[var(--color-muted)]">
                        {k.target}
                      </span>
                    </span>
                    <span>
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${badgeStyle[k.group]}`}
                      >
                        {Icon && <Icon size={14} aria-hidden />}
                        {k.label}
                      </span>
                    </span>
                    <span className="text-sm">{l.reason}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-[var(--color-muted)]">
        <span>
          Menampilkan {rows.length} dari {filtered.length} catatan · {rangeLabel}
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
    </div>
  );
}