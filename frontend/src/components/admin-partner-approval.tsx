"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { History, Inbox } from "lucide-react";
import RoleWorkspace from "./role-workspace";
import Modal from "./modal";
import { api } from "@/lib/api";

type PartnerStore = {
  name: string;
  category: string;
  neighborhood: string;
  address: string;
  opening_time: string;
  closing_time: string;
  latitude: number;
  longitude: number;
};

type PartnerApproval = {
  id: number;
  user: number;
  username: string;
  name: string;
  email: string;
  store: PartnerStore | null;
  status: "pending" | "approved" | "rejected";
  requested_at: string;
  reviewed_at: string | null;
};

type Filter = PartnerApproval["status"];

const filters: { value: Filter; label: string }[] = [
  { value: "pending", label: "Menunggu" },
  { value: "approved", label: "Disetujui" },
  { value: "rejected", label: "Ditolak" },
];

const quickReasons = [
  "Foto etalase buram",
  "Alamat tidak cocok dengan pin",
  "Dokumen NIB tidak terbaca",
  "Bukan usaha makanan",
];

const columns = "grid grid-cols-[minmax(0,1fr)_110px_90px] items-center gap-3";

const shopName = (p: PartnerApproval) => p.store?.name || p.name || p.username;

const shopMeta = (p: PartnerApproval) =>
  p.store
    ? [p.store.category, p.store.neighborhood].filter(Boolean).join(" · ")
    : `@${p.username} · profil toko belum dibuat`;

const when = (value: string) =>
  new Date(value).toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  });

const waiting = (value: string) => {
  const minutes = Math.max(
    0,
    Math.floor((Date.now() - new Date(value).getTime()) / 60000),
  );
  if (minutes < 60) return `${minutes} mnt`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours} jam` : `${Math.floor(hours / 24)} hari`;
};

const hours = (store: PartnerStore) =>
  `${store.opening_time.replace(":", ".")}–${store.closing_time.replace(":", ".")}`;

export default function AdminPartnerApproval() {
  return (
    <RoleWorkspace
      role="admin"
      title="Pendaftaran mitra"
      subtitle="Tinjau dan setujui mitra baru."
    >
      {() => <PartnerApprovalContent />}
    </RoleWorkspace>
  );
}

function PartnerApprovalContent() {
  const [items, setItems] = useState<PartnerApproval[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<Filter>("pending");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");

  useEffect(() => {
    const c = new AbortController();
    api<PartnerApproval[]>(
      "admin/partner-approvals",
      "GET",
      undefined,
      c.signal,
    )
      .then((v) => !c.signal.aborted && setItems(v))
      .catch((e) => !c.signal.aborted && setError(e.message))
      .finally(() => !c.signal.aborted && setLoading(false));
    return () => c.abort();
  }, []);

  const visible = items.filter((p) => p.status === filter);
  const selected =
    visible.find((p) => p.id === selectedId) ?? visible[0] ?? null;
  const lastReviewed = items
    .filter((p) => p.reviewed_at)
    .sort(
      (a, b) =>
        new Date(b.reviewed_at as string).getTime() -
        new Date(a.reviewed_at as string).getTime(),
    )[0];
  const tooShort = reason.length > 0 && reason.trim().length < 20;

  async function review(action: "approve" | "reject", body: object) {
    if (!selected) return;
    setBusy(true);
    setActionError("");
    try {
      const updated = await api<PartnerApproval>(
        `admin/partner-approvals/${selected.id}/${action}`,
        "POST",
        body,
      );
      setItems((current) =>
        current.map((p) => (p.id === updated.id ? updated : p)),
      );
      setRejecting(false);
      setReason("");
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function openReject() {
    setReason("");
    setActionError("");
    setRejecting(true);
  }

  if (loading) return <p>Memuat…</p>;
  if (error) return <p role="alert">{error}</p>;

  return (
    <div className="grid gap-6 min-[1100px]:grid-cols-[minmax(0,1fr)_380px]">
      <section aria-label="Daftar pendaftaran">
        <div
          className="mb-4 flex flex-wrap gap-2"
          role="group"
          aria-label="Filter status"
        >
          {filters.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
              className={`min-h-9 rounded-full border px-4 text-sm font-semibold ${
                filter === value
                  ? "border-transparent bg-[var(--color-dark)] text-[var(--color-cream)]"
                  : "border-line"
              }`}
            >
              {label}
              {value === "pending" &&
                ` ${items.filter((p) => p.status === "pending").length}`}
            </button>
          ))}
        </div>

        {visible.length === 0 ? (
          filter === "pending" ? (
            <div className="py-10">
              <Inbox size={24} aria-hidden />
              <h2 className="mt-3 text-xl font-bold">Antrean kosong</h2>
              <p className="mt-1 max-w-sm text-sm text-[var(--color-muted)]">
                Semua pendaftaran sudah ditinjau.
                {lastReviewed &&
                  ` Terakhir: ${shopName(lastReviewed)} ${
                    lastReviewed.status === "approved"
                      ? "disetujui"
                      : "ditolak"
                  } ${when(lastReviewed.reviewed_at as string)} WIB.`}
              </p>
              <Link
                href="/admin/log"
                className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl border border-line px-4 font-semibold"
              >
                <History size={18} aria-hidden />
                Lihat log moderasi
              </Link>
            </div>
          ) : (
            <p className="py-10 text-sm text-[var(--color-muted)]">
              Belum ada pendaftaran di status ini.
            </p>
          )
        ) : (
          <div>
            <div
              className={`${columns} border-b border-line px-3 pb-2 text-xs font-semibold text-[var(--color-muted)]`}
            >
              <span>Toko</span>
              <span>Didaftarkan</span>
              <span>{filter === "pending" ? "Menunggu" : "Ditinjau"}</span>
            </div>
            <ul>
              {visible.map((p) => {
                const active = selected?.id === p.id;
                return (
                  <li key={p.id} className="border-b border-line">
                    <button
                      type="button"
                      aria-current={active ? "true" : undefined}
                      onClick={() => setSelectedId(p.id)}
                      className={`${columns} w-full px-3 py-3 text-left ${
                        active ? "bg-[var(--color-light)]" : ""
                      }`}
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-semibold">
                          {shopName(p)}
                        </span>
                        <span className="block truncate text-xs text-[var(--color-muted)]">
                          {shopMeta(p)}
                        </span>
                      </span>
                      <span className="text-sm">{when(p.requested_at)}</span>
                      <span className="text-sm">
                        {filter === "pending"
                          ? waiting(p.requested_at)
                          : p.reviewed_at
                            ? when(p.reviewed_at)
                            : "-"}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </section>

      {selected && (
        <aside
          aria-label="Detail pendaftaran"
          className="flex flex-col gap-5 self-start rounded-xl border border-line p-5"
        >
          <div className="flex items-center gap-3">
            <span
              aria-hidden
              className="grid size-12 shrink-0 place-items-center rounded-full bg-[var(--color-light)] font-bold"
            >
              {shopName(selected).slice(0, 2).toUpperCase()}
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-lg font-bold">
                {shopName(selected)}
              </h2>
              <p className="text-xs text-[var(--color-muted)]">
                {shopMeta(selected)} · didaftarkan {when(selected.requested_at)}{" "}
                WIB
              </p>
            </div>
          </div>

          <dl className="grid grid-cols-[100px_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm">
            <dt className="text-[var(--color-muted)]">Pemilik</dt>
            <dd className="font-medium">{selected.name || selected.username}</dd>
            <dt className="text-[var(--color-muted)]">Email</dt>
            <dd className="break-words font-medium">{selected.email || "-"}</dd>
            {selected.store && (
              <>
                <dt className="text-[var(--color-muted)]">Alamat</dt>
                <dd className="font-medium">{selected.store.address}</dd>
                <dt className="text-[var(--color-muted)]">Jam buka</dt>
                <dd className="font-medium">{hours(selected.store)}</dd>
              </>
            )}
          </dl>

          {!selected.store && (
            <p className="text-sm text-[var(--color-muted)]">
              Mitra ini belum membuat profil toko.
            </p>
          )}

          {actionError && !rejecting && (
            <p role="alert" className="text-sm text-red-600">
              {actionError}
            </p>
          )}

          {selected.status === "pending" ? (
            <div className="grid grid-cols-[1fr_2fr] gap-3">
              <button
                type="button"
                disabled={busy}
                onClick={openReject}
                className="min-h-12 rounded-xl border border-line font-semibold disabled:opacity-50"
              >
                Tolak
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => review("approve", {})}
                className="min-h-12 rounded-xl bg-[var(--color-primary,#2f6b2f)] font-semibold text-white disabled:opacity-50"
              >
                {busy ? "Memproses…" : "Setujui"}
              </button>
            </div>
          ) : (
            <p className="text-sm font-semibold">
              {selected.status === "approved" ? "Disetujui" : "Ditolak"}
              {selected.reviewed_at && ` pada ${when(selected.reviewed_at)} WIB`}
            </p>
          )}
        </aside>
      )}

      {rejecting && selected && (
        <Modal
          title={`Tolak pendaftaran ${shopName(selected)}?`}
          onClose={() => !busy && setRejecting(false)}
        >
          <p className="mb-4 text-sm text-[var(--color-muted)]">
            Alasan dicatat di log moderasi. Tulis yang jelas dan bisa langsung
            diperbaiki.
          </p>
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
            htmlFor="reject-reason"
            className="mb-1 block text-sm font-semibold"
          >
            Alasan penolakan *
          </label>
          <textarea
            id="reject-reason"
            rows={4}
            maxLength={300}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            aria-invalid={tooShort}
            aria-describedby="reject-help"
            placeholder="Contoh: Foto etalase terlalu gelap, mohon unggah ulang di siang hari."
            className={`w-full rounded-lg border bg-transparent p-3 ${
              tooShort ? "border-red-600" : "border-line"
            }`}
          />
          <div
            id="reject-help"
            className="mt-1 flex justify-between gap-3 text-xs"
          >
            <span
              className={tooShort ? "text-red-600" : "text-[var(--color-muted)]"}
            >
              {tooShort
                ? "Tulis minimal 20 karakter agar mitra tahu apa yang harus diperbaiki."
                : "Wajib, minimal 20 karakter."}
            </span>
            <span className="text-[var(--color-muted)]">
              {reason.length}/300
            </span>
          </div>
          {actionError && (
            <p role="alert" className="mt-3 text-sm text-red-600">
              {actionError}
            </p>
          )}
          <div className="mt-5 flex justify-end gap-3">
            <button
              type="button"
              disabled={busy}
              onClick={() => setRejecting(false)}
              className="min-h-11 rounded-xl border border-line px-5 font-semibold disabled:opacity-50"
            >
              Batal
            </button>
            <button
              type="button"
              disabled={busy || reason.trim().length < 20}
              onClick={() => review("reject", { reason: reason.trim() })}
              className="min-h-11 rounded-xl bg-[var(--color-primary,#2f6b2f)] px-5 font-semibold text-white disabled:opacity-50"
            >
              {busy ? "Memproses…" : "Tolak pendaftaran"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}