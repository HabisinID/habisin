"use client";
import { MapPin, Search } from "lucide-react";
import { Avatar } from "./profile-picture";
import type { User } from "@/lib/api";
import { designFont } from "@/lib/design-font";
import { useBrowserLocation } from "@/hooks/use-browser-location";
import SiteHeader from "./site-header";
import LogoutButton from "./logout-button";
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
// chip, Beranda · Jelajahi · Pesanan, then the avatar. Guests get the landing
// page menu instead.
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
  onLogout: () => void | Promise<void>;
  onLogin?: () => void;
  onRegister?: () => void;
}) {
  const own = useBrowserLocation(onNotice);
  const place = location ?? own.location;
  const finding = locating ?? own.locating;
  const name = user ? user.name || user.username : "";
  return (
    <SiteHeader
      className={`${designFont.className} compact-header`}
      navLabel="Navigasi pembeli"
      nav={
        user
          ? [
              { label: "Beranda", href: "/" },
              {
                label: "Jelajahi",
                href: "/jelajahi",
                current: active === "explore",
              },
              {
                label: "Pesanan",
                href: "/pesanan",
                current: active === "orders",
              },
            ]
          : // Guests have no orders yet: the same menu as the landing page.
            [
              {
                label: "Jelajahi",
                href: "/jelajahi",
                current: active === "explore",
              },
              { label: "Dampak", href: "/#dampak" },
              { label: "Untuk Mitra", href: "/#mitra" },
            ]
      }
      actions={
        // Desktop: Masuk, then the theme switcher; mobile moves Masuk after it (see `end`).
        !user && (
          <button className="header-login-desktop" onClick={onLogin}>
            Masuk
          </button>
        )
      }
      end={
        user ? (
          <>
            {onAccount ? (
              <button
                className={s.avatar}
                aria-label={`Akun ${name}`}
                onClick={onAccount}
              >
                <Avatar
                  src={user.profile_picture}
                  name={name}
                  fallback={initials(name)}
                />
              </button>
            ) : (
              <span className={s.avatar} title={name}>
                <Avatar
                  src={user.profile_picture}
                  name={name}
                  fallback={initials(name)}
                />
              </span>
            )}
            <LogoutButton onLogout={onLogout} />
          </>
        ) : (
          <>
            <button className="header-login-mobile" onClick={onLogin}>
              Masuk
            </button>
            <button
              className={s.primary}
              aria-label="Daftar gratis"
              onClick={onRegister}
            >
              Daftar<span className="header-signup-long"> gratis</span>
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
        className={`${s.location} header-location`}
        aria-label={finding ? "Mencari lokasi…" : `${place} · Pakai lokasiku`}
        title={place}
        onClick={onLocate ?? own.locate}
        disabled={finding}
      >
        <MapPin size={16} />
        <span className="header-location-text">
          {finding ? "Mencari lokasi…" : place}
        </span>
      </button>
    </SiteHeader>
  );
}
