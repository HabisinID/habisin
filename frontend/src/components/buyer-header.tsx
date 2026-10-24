"use client";
import {
  Heart,
  ShoppingCart,
  Ticket,
  MapPin,
  LogOut,
  Search,
} from "lucide-react";
import type { User } from "@/lib/api";
import { designFont } from "@/lib/design-font";
import HabisinLogo from "./habisin-logo";
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
  cartCount,
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
  cartCount: number;
  onAccount: () => void;
  onLogout: () => void;
  onLogin?: () => void;
  onRegister?: () => void;
}) {
  return (
    <header className={`${s.buyerHeader} ${designFont.className}`}>
      <HabisinLogo />
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
      <nav aria-label="Navigasi pembeli">
        {[
          { key: "explore", label: "Jelajahi" },
          { key: "favorites", label: "Favorit", Icon: Heart },
          { key: "cart", label: "Keranjang", Icon: ShoppingCart },
          { key: "orders", label: "Pesanan saya", Icon: Ticket },
        ].map(({ key, label, Icon }) => (
          <button
            key={key}
            aria-current={active === key ? "page" : undefined}
            onClick={() => onNavigate(key)}
          >
            {Icon && <Icon size={17} />}
            <span>{label}</span>
            {key === "cart" && cartCount > 0 && <b>{cartCount}</b>}
          </button>
        ))}
      </nav>
      {user ? (
        <>
          <button
            className={s.avatar}
            aria-label={`Akun ${user.name || user.username}`}
            onClick={onAccount}
          >
            {(user.name || user.username)
              .split(" ")
              .map((v) => v[0])
              .slice(0, 2)
              .join("")
              .toUpperCase()}
          </button>
          <button aria-label="Keluar" className={s.icon} onClick={onLogout}>
            <LogOut size={18} />
          </button>
        </>
      ) : (
        <div className={s.guestActions}>
          <button className={s.textButton} onClick={onLogin}>
            Masuk
          </button>
          <button className={s.primary} onClick={onRegister}>
            Daftar gratis
          </button>
        </div>
      )}
    </header>
  );
}
