"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { MapPin, Search } from "lucide-react";
import { api, ApiError, type User } from "@/lib/api";
import { designFont } from "@/lib/design-font";
import { useBrowserLocation } from "@/hooks/use-browser-location";
import SiteHeader from "./site-header";
import { errorClass, primaryButton } from "./store-ui";
import s from "./workspace.module.css";

// Placeholder blocks shown while an order page loads (design: "memuat (skeleton)").
// The label stays available to screen readers.
export function OrderSkeleton({
  label,
  rows = false,
}: {
  label: string;
  // Only the list rows, for a page whose heading is already shown.
  rows?: boolean;
}) {
  const block = "animate-pulse rounded-xl bg-surface-2";
  if (rows)
    return (
      <div role="status" aria-busy="true" className="space-y-4">
        <span className="sr-only">{label}</span>
        {[0, 1, 2].map((row) => (
          <div key={row} className={`h-28 ${block}`} />
        ))}
      </div>
    );
  return (
    <div role="status" aria-busy="true" className="space-y-8">
      <span className="sr-only">{label}</span>
      <div className={`h-10 w-72 max-w-full ${block}`} />
      <div className="grid grid-cols-[minmax(0,1fr)_420px] gap-16 compact:grid-cols-1 compact:gap-6">
        <div className="space-y-4">
          {[0, 1, 2].map((row) => (
            <div key={row} className={`h-24 ${block}`} />
          ))}
        </div>
        <div className={`h-72 ${block}`} />
      </div>
    </div>
  );
}

// Frame shared by the order pages: TopNav/Pembeli from the design with
// "Pesanan" active, and a sign-in prompt for guests. Pages render only once a
// buyer is known.
export default function OrderShell({
  children,
  wide = false,
}: {
  children: React.ReactNode;
  wide?: boolean;
}) {
  const [user, setUser] = useState<User | null>(null);
  const [state, setState] = useState<"loading" | "guest" | "ready" | "error">(
    "loading",
  );
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const { location, locating, locate } = useBrowserLocation(setNotice);
  useEffect(() => {
    let active = true;
    api<User>("auth/me")
      .then((value) => {
        if (!active) return;
        setUser(value);
        setState("ready");
      })
      .catch((e) => {
        if (!active) return;
        if (e instanceof ApiError && e.status === 403) setState("guest");
        else {
          setError(e.message);
          setState("error");
        }
      });
    return () => {
      active = false;
    };
  }, []);

  const name = user ? user.name || user.username : "";
  // Initials of the first two words, as on the design's avatar ("Rani Ayu" → RA).
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
  return (
    <>
      <SiteHeader
        className={designFont.className}
        navLabel="Navigasi pembeli"
        nav={[
          { label: "Beranda", href: "/" },
          { label: "Jelajahi", href: "/jelajahi" },
          { label: "Pesanan", href: "/pesanan", current: true },
        ]}
        actions={
          user && (
            <span className={s.avatar} title={name}>
              {initials}
            </span>
          )
        }
      >
        {/* Searching leaves the order pages for Jelajahi, like the landing page. */}
        <form action="/jelajahi" role="search" className={s.headerSearch}>
          <Search size={18} aria-hidden="true" />
          <input
            type="search"
            name="q"
            aria-label="Cari makanan atau toko"
            placeholder="Cari roti, nasi, atau nama toko"
          />
        </form>
        <button className={s.location} onClick={locate} disabled={locating}>
          <MapPin size={16} />
          {locating ? "Mencari lokasi…" : `${location} · Pakai lokasiku`}
        </button>
      </SiteHeader>
      {notice && (
        <p
          className="mx-auto max-w-[1440px] px-16 pt-3 text-sm text-muted tablet:px-4"
          role="status"
        >
          {notice}
        </p>
      )}
      {state === "ready" ? (
        children
      ) : (
        <main
          className={`mx-auto px-8 py-12 tablet:px-4 ${wide ? "max-w-[1440px]" : "max-w-5xl"}`}
        >
          {state === "loading" && <OrderSkeleton label="Memuat pesanan…" />}
          {state === "error" && (
            <p className={errorClass} role="alert">
              {error}
            </p>
          )}
          {state === "guest" && (
            <section className="max-w-lg space-y-4">
              <h1 className="text-3xl font-bold">
                Masuk untuk melihat pesananmu
              </h1>
              <p className="text-muted">
                Pesanan dan tiket pengambilan tersimpan di akun pembeli.
              </p>
              <Link href="/" className={primaryButton}>
                Masuk di beranda
              </Link>
            </section>
          )}
        </main>
      )}
    </>
  );
}
