"use client";

import dynamic from "next/dynamic";
import StoreCatalog from "./store-catalog";
import StoreReviews from "./store-reviews";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, ApiError, type Store } from "@/lib/api";
import {
  errorClass,
  secondaryButton,
  StoreDetails,
  StoreShell,
} from "./store-ui";

const StoreMap = dynamic(() => import("./store-map"), {
  ssr: false,
  loading: () => (
    <div className="h-72 rounded-xl bg-light" role="status">
      Memuat peta…
    </div>
  ),
});

export default function StoreProfile({ id }: { id: string }) {
  const [store, setStore] = useState<Store | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    let active = true;
    api<Store>(`stores/${encodeURIComponent(id)}`)
      .then((data) => {
        if (active) setStore(data);
      })
      .catch((e) => {
        if (active) {
          if (e instanceof ApiError && e.status === 404) setMissing(true);
          else setError(e.message);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id]);
  return (
    <StoreShell>
      {loading ? (
        <p role="status">Memuat profil toko…</p>
      ) : missing ? (
        <div className="space-y-5">
          <h1 className="text-3xl font-bold">Toko tidak ditemukan.</h1>
          <p className="text-muted">
            Profil ini sudah dihapus atau tautannya tidak tersedia.
          </p>
          <Link href="/" className={secondaryButton}>
            Kembali jelajah
          </Link>
        </div>
      ) : error ? (
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
      ) : (
        store && (
          <article className="mx-auto max-w-3xl space-y-6 rounded-2xl border border-line bg-white p-8 mobile:p-4">
            <p className="text-xs font-bold tracking-widest text-brand">
              KENALAN DENGAN MITRA
            </p>
            <StoreDetails store={store} />
            <StoreCatalog id={id} />
            <StoreReviews storeId={store.id} />
            <StoreMap latitude={store.latitude} longitude={store.longitude} />
            <p className="text-xs text-muted">
              Koordinat toko: {store.latitude.toFixed(6)},{" "}
              {store.longitude.toFixed(6)}
            </p>
            <a
              className={secondaryButton}
              href={`https://www.openstreetmap.org/?mlat=${store.latitude}&mlon=${store.longitude}#map=18/${store.latitude}/${store.longitude}`}
              target="_blank"
              rel="noreferrer"
            >
              Buka lokasi di OpenStreetMap
            </a>
          </article>
        )
      )}
    </StoreShell>
  );
}
