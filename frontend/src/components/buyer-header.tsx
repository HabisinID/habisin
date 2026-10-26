"use client";
import { MapPin, LogOut, Search } from "lucide-react";
import type { User } from "@/lib/api";
import { designFont } from "@/lib/design-font";
import SiteHeader from "./site-header";
import s from "./workspace.module.css";
export default function BuyerHeader({
  user,
  query,
  onQuery,
  location,
  locating,
  onLocate,
  active,
  onNavigate,
  onAccount,
  onLogout,
  onLogin,
  onRegister,
}: {
  user: User | null;
  query: string;
  onQuery: (v: string) => void;
  location: string;
  locating: boolean;
  onLocate: () => void;
  active: string;
  onNavigate: (v: string) => void;
  cartCount?: number;
  onAccount: () => void;
  onLogout: () => void;
  onLogin?: () => void;
  onRegister?: () => void;
}) {
  return (
    <SiteHeader
      className={designFont.className}
      navLabel="Navigasi pembeli"
      nav={[
        {
          label: "Jelajahi",
          current: active === "explore",
          onClick: () => onNavigate("explore"),
        },
        {
          label: "Favorit",
          current: active === "favorites",
          onClick: () => onNavigate("favorites"),
        },
        // Modul 7: orders live on their own page; guests get the sign-in gate first.
        {
          label: "Pesanan saya",
          current: active === "orders",
          ...(user
            ? { href: "/pesanan" }
            : { onClick: () => onNavigate("orders") }),
        },
      ]}
      actions={
        user ? (
          <>
            <button
              className={s.avatar}
              aria-label={`Akun ${user.name || user.username}`}
              onClick={onAccount}
            >
              {(user.name || user.username).slice(0, 2).toUpperCase()}
            </button>
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
      <label className={s.headerSearch}>
        <Search size={18} />
        <input
          aria-label="Cari makanan atau toko"
          placeholder="Cari roti, nasi, atau nama toko"
          value={query}
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
      <button className={s.location} onClick={onLocate} disabled={locating}>
        <MapPin size={16} />
        {locating ? "Mencari lokasi…" : `${location} · Ubah`}
      </button>
    </SiteHeader>
  );
}
