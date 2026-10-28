"use client";

import dynamic from "next/dynamic";
import { ArrowLeft, ArrowUpRight, MapPin } from "lucide-react";
import StoreCatalog from "./store-catalog";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, ApiError, type Store, type User } from "@/lib/api";
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
  const [user, setUser] = useState<User | null>(null);
  useEffect(() => {
    const c = new AbortController();
    api<User>("auth/me", "GET", undefined, c.signal)
      .then((value) => {
        if (!c.signal.aborted) setUser(value);
      })
      .catch(() => {});
    return () => c.abort();
  }, []);
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
    <StoreShell user={user}>
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
          <article className="mx-auto max-w-5xl">
            <Link
              href="/jelajahi"
              className="mb-7 inline-flex min-h-11 items-center gap-2 text-xs font-semibold text-muted hover:text-brand"
            >
              <ArrowLeft size={15} />
              Kembali jelajah
            </Link>
            <div className="mb-8 border-b border-line pb-8">
              <p className="mb-5 font-mono text-[10px] font-semibold tracking-[0.16em] text-muted">
                DARI DAPUR TETANGGA, UNTUK KAMU
              </p>
              <StoreDetails store={store} />
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)_300px] items-start gap-10 tablet:grid-cols-1">
              <div className="min-w-0">
                <StoreCatalog id={id} />
              </div>
              <aside className="sticky top-6 min-w-0 overflow-hidden rounded-xl border border-line bg-surface tablet:static">
                <div className="flex items-center gap-2 border-b border-line px-5 py-4">
                  <MapPin size={16} className="text-brand" />
                  <h2 className="text-sm font-bold">
                    Mampir & ambil pesananmu
                  </h2>
                </div>
                <StoreMap
                  latitude={store.latitude}
                  longitude={store.longitude}
                />
                <div className="space-y-4 p-5">
                  <p className="text-sm leading-relaxed">{store.address}</p>
                  {store.landmark && (
                    <p className="text-xs text-muted">
                      Patokan: {store.landmark}
                    </p>
                  )}
                  <p className="font-mono text-[10px] text-muted">
                    {store.latitude.toFixed(6)}, {store.longitude.toFixed(6)}
                  </p>
                  <a
                    className={`${secondaryButton} w-full text-xs`}
                    href={`https://www.openstreetmap.org/?mlat=${store.latitude}&mlon=${store.longitude}#map=18/${store.latitude}/${store.longitude}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Buka lokasi di OpenStreetMap
                    <ArrowUpRight size={15} />
                  </a>
                </div>
              </aside>
            </div>
          </article>
        )
      )}
    </StoreShell>
  );
}
