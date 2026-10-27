"use client";
import { MapPin, LogOut, Search } from "lucide-react";
import type { User } from "@/lib/api";
import { designFont } from "@/lib/design-font";
import { useBrowserLocation } from "@/hooks/use-browser-location";
import SiteHeader from "./site-header";
import s from "./workspace.module.css";

// Initials of the first two words, as on the design's avatar ("Rani Ayu" → RA).
export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
}

// TopNav/Pembeli from design.pen, shared by every buyer page: search, location
// chip, Beranda (guests only) · Jelajahi · Pesanan, then the avatar.
// A page that filters as you type passes `query`/`onQuery`; otherwise searching
// opens Jelajahi. A page that tracks location passes `location`/`onLocate`.
export default function BuyerHeader({
  user,
  active,
  query,
  onQuery,
  location,
  locating,
  onLocate,
  onNotice = () => {},
  onAccount,
  onLogout,
  onLogin,
  onRegister,
}: {
  user: User | null;
  active: "explore" | "orders";
  query?: string;
  onQuery?: (value: string) => void;
  location?: string;
  locating?: boolean;
  onLocate?: () => void;
  // Where location failures are reported when the header tracks location itself.
  onNotice?: (message: string) => void;
  onAccount?: () => void;
  onLogout: () => void;
  onLogin?: () => void;
  onRegister?: () => void;
}) {
  const own = useBrowserLocation(onNotice);
  const place = location ?? own.location;
  const finding = locating ?? own.locating;
  const name = user ? user.name || user.username : "";
  return (
    <SiteHeader
      className={designFont.className}
      navLabel="Navigasi pembeli"
      nav={[
        // Signed in, "/" is the catalog (same as Jelajahi); the landing is for guests.
        ...(user ? [] : [{ label: "Beranda", href: "/" }]),
        { label: "Jelajahi", href: "/jelajahi", current: active === "explore" },
        // Guests get the sign-in gate first.
        user
          ? { label: "Pesanan", href: "/pesanan", current: active === "orders" }
          : { label: "Pesanan", onClick: onLogin },
      ]}
      actions={
        user ? (
          <>
            {onAccount ? (
              <button
                className={s.avatar}
                aria-label={`Akun ${name}`}
                onClick={onAccount}
              >
                {initials(name)}
              </button>
            ) : (
              <span className={s.avatar} title={name}>
                {initials(name)}
              </span>
            )}
            <button aria-label="Keluar" onClick={onLogout}>
              <LogOut size={18} />
            </button>
          </>
        ) : (
          <>
            <button onClick={onLogin}>Masuk</button>
            {/* Mobile shows "Daftar" so the top bar fits on one row. */}
            <button
              className={s.primary}
              aria-label="Daftar gratis"
              onClick={onRegister}
            >
              Daftar<span className="mobile:hidden"> gratis</span>
            </button>
          </>
        )
      }
    >
      {onQuery ? (
        <label className={s.headerSearch}>
          <Search size={18} />
          <input
            aria-label="Cari makanan atau toko"
            placeholder="Cari roti, nasi, atau nama toko"
            value={query ?? ""}
            onChange={(e) => onQuery(e.target.value)}
          />
          {query && (
            <button
              aria-label="Hapus pencarian"
              onClick={() => onQuery("")}
              type="button"
            >
              ×
            </button>
          )}
        </label>
      ) : (
        <form action="/jelajahi" role="search" className={s.headerSearch}>
          <Search size={18} aria-hidden="true" />
          <input
            name="q"
            aria-label="Cari makanan atau toko"
            placeholder="Cari roti, nasi, atau nama toko"
          />
        </form>
      )}
      <button
        className={s.location}
        onClick={onLocate ?? own.locate}
        disabled={finding}
      >
        <MapPin size={16} />
        {finding ? "Mencari lokasi…" : `${place} · Pakai lokasiku`}
      </button>
    </SiteHeader>
  );
}
