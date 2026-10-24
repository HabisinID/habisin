"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ExternalLink,
  Pencil,
  Plus,
  Store as StoreIcon,
  Trash2,
} from "lucide-react";
import { api, type Store } from "@/lib/api";
import Modal from "./modal";
import StoreForm from "./store-form";
import {
  errorClass,
  primaryButton,
  secondaryButton,
  fieldClass,
  StoreDetails,
} from "./store-ui";

const StoreMap = dynamic(() => import("./store-map"), {
  ssr: false,
  loading: () => (
    <div className="h-72 rounded-xl bg-light" role="status">
      Memuat peta…
    </div>
  ),
});

export default function StoreManager() {
  const [stores, setStores] = useState<Store[]>([]);
  const [store, setStore] = useState<Store | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [deleteError, setDeleteError] = useState("");
  useEffect(() => {
    let active = true;
    api<{ stores: Store[] }>("partner/stores")
      .then((data) => {
        if (active) {
          setStores(data.stores);
          setStore(data.stores.length === 1 ? data.stores[0] : null);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function toggleStatus() {
    if (!store) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const updated = await api<Store>(`partner/stores/${store.id}`, "PATCH", {
        is_open: !store.is_open,
      });
      setStore(updated);
      setStores((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      setNotice(
        updated.is_open
          ? "Toko kembali aktif."
          : "Toko ditutup sementara. Profil tetap dapat dilihat.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function deleteStore(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!store) return;
    setBusy(true);
    setDeleteError("");
    try {
      await api(`partner/stores/${store.id}`, "DELETE", {
        confirmation_name: confirmation,
      });
      setDeleting(false);
      const remaining = stores.filter((item) => item.id !== store.id);
      setStores(remaining);
      setStore(remaining.length === 1 ? remaining[0] : null);
      setNotice("Toko berhasil dihapus. Akun mitra kamu tetap tersedia.");
    } catch (e) {
      setDeleteError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p role="status">Memuat toko kamu…</p>;
  if (error && !store)
    return (
      <div className="space-y-4">
        <p role="alert" className={errorClass}>
          {error}
        </p>
        <button
          className={secondaryButton}
          onClick={() => window.location.reload()}
        >
          Coba lagi
        </button>
      </div>
    );
  if (editing)
    return (
      <div className="mx-auto max-w-2xl rounded-2xl border border-line bg-white p-7 mobile:p-4">
        <StoreForm
          store={store}
          onCancel={() => setEditing(false)}
          onSaved={(saved) => {
            setStore(saved);
            setStores((current) => [
              ...current.filter((item) => item.id !== saved.id),
              saved,
            ]);
            setEditing(false);
            setError("");
            setNotice(
              store
                ? "Data toko berhasil diperbarui."
                : "Selamat! Toko kamu sudah terdaftar.",
            );
          }}
        />
      </div>
    );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="mb-2 text-xs font-bold tracking-widest text-brand">
            RUANG MITRA
          </p>
          <h1 className="text-3xl font-bold">Toko saya</h1>
        </div>
        {store && (
          <Link href={`/stores/${store.id}`} className={secondaryButton}>
            Lihat profil publik
            <ExternalLink size={16} />
          </Link>
        )}
      </div>
      {stores.length > 0 && (
        <section className="space-y-4" aria-label="Daftar toko saya">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted">
              {stores.length} toko · Pilih cabang yang ingin dikelola.
            </p>
            <button
              className={primaryButton}
              disabled={busy}
              onClick={() => {
                setStore(null);
                setEditing(true);
                setError("");
                setNotice("");
              }}
            >
              <Plus size={18} /> Tambah toko
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3 mobile:grid-cols-1">
            {stores.map((item) => (
              <button
                key={item.id}
                aria-label={`Kelola toko ${item.name}`}
                aria-pressed={store?.id === item.id}
                disabled={busy}
                className={`min-w-0 rounded-xl border p-4 text-left ${store?.id === item.id ? "border-brand bg-light" : "border-line bg-white"}`}
                onClick={() => {
                  setStore(item);
                  setError("");
                  setNotice("");
                }}
              >
                <strong className="block break-words">{item.name}</strong>
                <span className="mt-1 block break-words text-xs text-muted">
                  {item.address}
                </span>
                <span className="mt-2 block text-xs text-brand">
                  #{item.id} · {item.is_open ? "Aktif" : "Ditutup sementara"}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}
      {notice && (
        <p role="status" className="rounded-lg bg-light p-4 text-brand">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className={errorClass}>
          {error}
        </p>
      )}
      {store ? (
        <>
          <section
            className="space-y-6 rounded-2xl border border-line bg-white p-7 mobile:p-4"
            aria-label="Profil toko saya"
          >
            <StoreDetails store={store} />
            <StoreMap latitude={store.latitude} longitude={store.longitude} />
            <p className="text-xs text-muted">
              Koordinat pin: {store.latitude.toFixed(6)},{" "}
              {store.longitude.toFixed(6)}
            </p>
            <div className="flex flex-wrap gap-3 border-t border-line pt-5">
              <button
                className={primaryButton}
                onClick={() => {
                  setEditing(true);
                  setError("");
                  setNotice("");
                }}
                disabled={busy}
              >
                <Pencil size={16} />
                Edit toko
              </button>
              <button
                className={secondaryButton}
                onClick={toggleStatus}
                disabled={busy}
              >
                {busy
                  ? "Memproses…"
                  : store.is_open
                    ? "Tutup toko sementara"
                    : "Aktifkan kembali toko"}
              </button>
            </div>
          </section>
          <section className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[#ead9d1] p-5">
            <div>
              <h2 className="font-bold">Hapus toko</h2>
              <p className="mt-1 text-sm text-muted">
                Hapus profil dan lokasi toko secara permanen.
              </p>
            </div>
            <button
              className="flex min-h-11 items-center gap-2 rounded-lg px-4 text-sm font-semibold text-[#a34337] hover:bg-[#fbeae4]"
              onClick={() => {
                setDeleting(true);
                setConfirmation("");
                setDeleteError("");
              }}
              disabled={busy}
            >
              <Trash2 size={16} />
              Hapus toko
            </button>
          </section>
        </>
      ) : stores.length === 0 ? (
        <section className="rounded-2xl border border-line bg-white px-7 py-12 text-center">
          <StoreIcon size={48} className="mx-auto mb-5 text-brand" />
          <h2 className="text-2xl font-bold">
            Kesempatan baik dimulai dari tokomu.
          </h2>
          <p className="mx-auto my-4 max-w-md leading-relaxed text-muted">
            Daftarkan profil dan lokasi toko agar mudah ditemukan. Kamu dapat
            mengelola beberapa cabang dalam satu akun mitra.
          </p>
          <button
            className={primaryButton}
            onClick={() => {
              setEditing(true);
              setNotice("");
            }}
          >
            <Plus size={18} />
            Daftarkan toko
          </button>
        </section>
      ) : (
        <p className="rounded-xl border border-line bg-white p-6 text-muted">
          Pilih toko di atas untuk melihat profil dan mengelolanya.
        </p>
      )}
      {deleting && store && (
        <Modal
          title="Hapus toko secara permanen?"
          onClose={() => {
            if (!busy) setDeleting(false);
          }}
        >
          <form className="space-y-5" onSubmit={deleteStore}>
            <p className="text-sm leading-relaxed text-muted">
              Profil dan lokasi{" "}
              <strong className="text-dark">{store.name}</strong> akan dihapus.
              Untuk berhenti sementara, gunakan tombol tutup toko.
            </p>
            <label className="block space-y-2 font-semibold">
              Ketik nama toko untuk konfirmasi
              <input
                className={fieldClass}
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
                required
                autoComplete="off"
                disabled={busy}
              />
            </label>
            {deleteError && (
              <p role="alert" className={errorClass}>
                {deleteError}
              </p>
            )}
            <div className="flex flex-wrap gap-3">
              <button
                className="min-h-11 rounded-lg bg-[#a34337] px-4 py-3 font-semibold text-white"
                disabled={busy || confirmation !== store.name}
              >
                {busy ? "Menghapus…" : "Hapus toko permanen"}
              </button>
              <button
                type="button"
                className={secondaryButton}
                onClick={() => setDeleting(false)}
                disabled={busy}
              >
                Batal
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
