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
    api<{ store: Store | null }>("partner/store")
      .then((data) => {
        if (active) setStore(data.store);
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
      const updated = await api<Store>("partner/store", "PATCH", {
        is_open: !store.is_open,
      });
      setStore(updated);
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
    setBusy(true);
    setDeleteError("");
    try {
      await api("partner/store", "DELETE", { confirmation_name: confirmation });
      setDeleting(false);
      setStore(null);
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
      ) : (
        <section className="rounded-2xl border border-line bg-white px-7 py-12 text-center">
          <StoreIcon size={48} className="mx-auto mb-5 text-brand" />
          <h2 className="text-2xl font-bold">
            Kesempatan baik dimulai dari tokomu.
          </h2>
          <p className="mx-auto my-4 max-w-md leading-relaxed text-muted">
            Daftarkan profil dan lokasi toko agar mudah ditemukan. Satu akun
            mitra dapat mengelola satu toko.
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
