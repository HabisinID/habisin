"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Store as StoreIcon } from "lucide-react";
import { api, type Store } from "@/lib/api";
import RoleWorkspace from "./role-workspace";
import StoreForm from "./store-form";
import { StoreDetails } from "./store-ui";
import Modal from "./modal";
import s from "./role-workspace.module.css";

export default function PartnerStoreProfile() {
  return (
    <RoleWorkspace
      title="Profil toko"
      subtitle="Ubah identitas, alamat dan jam buka yang dilihat pembeli."
    >
      {() => <StoreProfileContent />}
    </RoleWorkspace>
  );
}
function StoreProfileContent() {
  const router = useRouter();
  const [stores, setStores] = useState<Store[]>([]),
    [selected, setSelected] = useState(""),
    [creating, setCreating] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [dirty, setDirty] = useState(false),
    [revision, setRevision] = useState(0),
    [pending, setPending] = useState<{
      kind: "store" | "new" | "nav";
      value: string;
    } | null>(null),
    [close, setClose] = useState(false),
    [confirmation, setConfirmation] = useState(""),
    [busy, setBusy] = useState(false),
    [closeError, setCloseError] = useState("");
  const store = stores.find((row) => String(row.id) === selected) || null;
  const load = useCallback(
    () =>
      api<{ stores: Store[] }>("partner/stores")
        .then((result) => {
          setStores(result.stores);
          setSelected(
            result.stores.length === 1 ? String(result.stores[0].id) : "",
          );
          setError("");
        })
        .catch((e) => setError(e.message))
        .finally(() => setLoading(false)),
    [],
  );
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (!dirty) return;
    const navigate = (e: MouseEvent) => {
      const link =
        e.target instanceof Element ? e.target.closest("a[href]") : null;
      if (
        !(link instanceof HTMLAnchorElement) ||
        link.target === "_blank" ||
        link.origin !== location.origin ||
        link.pathname === location.pathname
      )
        return;
      e.preventDefault();
      e.stopPropagation();
      setPending({
        kind: "nav",
        value: link.pathname + link.search + link.hash,
      });
    };
    document.addEventListener("click", navigate, true);
    return () => document.removeEventListener("click", navigate, true);
  }, [dirty]);
  function choose(kind: "store" | "new", value = "") {
    if (dirty) {
      setPending({ kind, value });
      return;
    }
    setCreating(kind === "new");
    setSelected(value);
    setRevision((n) => n + 1);
    setNotice("");
    setError("");
  }
  function discard() {
    if (!pending) return;
    setDirty(false);
    if (pending.kind === "nav") router.push(pending.value);
    else {
      setCreating(pending.kind === "new");
      setSelected(pending.value);
      setRevision((n) => n + 1);
    }
    setPending(null);
  }
  function saved(value: Store) {
    setStores((current) => [
      ...current.filter((row) => row.id !== value.id),
      value,
    ]);
    setSelected(String(value.id));
    setCreating(false);
    setDirty(false);
    setRevision((n) => n + 1);
    setNotice("Data toko berhasil diperbarui. Perubahan tampil ke pembeli.");
  }
  async function temporary() {
    if (!store || busy) return;
    setBusy(true);
    setError("");
    try {
      const updated = await api<Store>(`partner/stores/${store.id}`, "PATCH", {
        is_open: !store.is_open,
      });
      saved(updated);
      setNotice(
        updated.is_open
          ? "Toko kembali aktif."
          : "Toko ditutup sementara; pesanan yang sudah dibayar tetap berlaku.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function permanently(e: React.FormEvent) {
    e.preventDefault();
    if (!store || busy) return;
    setBusy(true);
    setCloseError("");
    try {
      const updated = await api<Store>(
        `partner/stores/${store.id}/close`,
        "POST",
        { confirmation_name: confirmation },
      );
      saved(updated);
      setClose(false);
      setNotice(
        "Toko ditutup permanen. Penawaran dihentikan; riwayat tetap tersimpan.",
      );
    } catch (e) {
      setCloseError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section aria-label="Profil toko mitra" className="mx-auto max-w-6xl">
      <div className={`${s.toolbar} ${s.storeToolbar}`}>
        <label className={s.label}>
          Toko yang dikelola
          <select
            className={s.field}
            aria-label="Pilih cabang toko"
            value={selected}
            disabled={loading || busy}
            onChange={(e) => choose("store", e.target.value)}
          >
            <option value="">Pilih toko</option>
            {stores.map((row) => (
              <option value={row.id} key={row.id}>
                {row.name}
                {row.closed_at ? " · Tutup permanen" : ""}
              </option>
            ))}
          </select>
        </label>
        <button
          className={s.primary}
          disabled={loading || busy}
          onClick={() => choose("new")}
        >
          <Plus size={18} />
          Tambah toko
        </button>
      </div>
      {notice && (
        <p role="status" className={s.message}>
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className={s.error}>
          {error} <button onClick={() => void load()}>Coba lagi toko</button>
        </p>
      )}
      {loading ? (
        <div role="status" aria-label="Memuat profil toko">
          <div className={s.skeleton} />
          <div className={s.skeleton} />
        </div>
      ) : store?.closed_at ? (
        <div className={s.card}>
          <StoreDetails store={store} />
          <p className={`${s.error} mt-6`}>
            Toko ditutup permanen dan tidak dapat dibuka kembali.
          </p>
        </div>
      ) : store || creating ? (
        <>
          {store && (
            <div className="mb-7 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-line bg-surface p-4">
              <span className={s.badge}>
                {store.is_open ? "Toko aktif" : "Tutup sementara"} · lokasi
                dikonfirmasi mitra
              </span>
              <div className={s.actions}>
                <Link className={s.secondary} href={`/stores/${store.id}`}>
                  Lihat profil publik
                </Link>
                <button
                  className={s.secondary}
                  onClick={temporary}
                  disabled={busy || dirty}
                >
                  {store.is_open ? "Tutup sementara" : "Buka kembali"}
                </button>
              </div>
            </div>
          )}
          <StoreForm
            key={`${store?.id || "new"}-${revision}`}
            store={creating ? null : store}
            onSaved={saved}
            onDirtyChange={setDirty}
            onCancel={() => {
              setDirty(false);
              setRevision((n) => n + 1);
              if (creating) setCreating(false);
            }}
          />
          {store && !creating && (
            <section
              className="mt-10 border-t border-line pt-6"
              aria-label="Tutup toko"
            >
              <h2 className={s.title}>Tutup toko</h2>
              <p className={`${s.muted} my-3`}>
                Semua penawaran cabang ini berhenti tampil. Akun dan cabang lain
                tetap tersedia. Tangani pesanan aktif terlebih dahulu.
              </p>
              <button
                className={s.danger}
                disabled={busy || dirty}
                onClick={() => {
                  setClose(true);
                  setConfirmation("");
                  setCloseError("");
                }}
              >
                Tutup toko permanen
              </button>
            </section>
          )}
        </>
      ) : (
        <div className={s.empty}>
          <StoreIcon size={32} />
          <h2 className={s.title}>
            {stores.length
              ? "Pilih cabang yang ingin dikelola."
              : "Belum ada toko terdaftar."}
          </h2>
          <p className={s.muted}>
            {stores.length
              ? "Setiap cabang memiliki alamat, pin dan jadwal sendiri."
              : "Daftarkan toko untuk mulai membuat listing."}
          </p>
          {!stores.length && (
            <button className={s.primary} onClick={() => choose("new")}>
              Daftarkan toko pertama
            </button>
          )}
        </div>
      )}
      {pending && (
        <Modal
          title="Perubahan belum disimpan"
          onClose={() => setPending(null)}
        >
          <p className={s.muted}>
            Perubahan pada toko ini akan dibuang jika melanjutkan. Simpan dahulu
            untuk mempertahankannya.
          </p>
          <div className={`${s.actions} mt-6`}>
            <button className={s.secondary} onClick={() => setPending(null)}>
              Tetap di sini
            </button>
            <button className={s.danger} onClick={discard}>
              Buang perubahan dan lanjut
            </button>
          </div>
        </Modal>
      )}
      {close && store && (
        <Modal
          title={`Tutup ${store.name} permanen?`}
          onClose={() => {
            if (!busy) setClose(false);
          }}
        >
          <form className={s.form} onSubmit={permanently}>
            <p>
              Listing cabang ini berhenti ditawarkan. Penutupan ditolak selama
              ada pesanan aktif. Riwayat tetap tersedia.
            </p>
            <label className={s.label}>
              Ketik nama toko untuk konfirmasi
              <input
                autoFocus
                className={s.field}
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
                required
              />
            </label>
            {closeError && (
              <p role="alert" className={s.error}>
                {closeError}
              </p>
            )}
            <div className={s.actions}>
              <button
                type="button"
                className={s.secondary}
                onClick={() => setClose(false)}
                disabled={busy}
              >
                Batal
              </button>
              <button
                className={s.danger}
                disabled={busy || confirmation !== store.name}
              >
                Tutup permanen
              </button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  );
}
