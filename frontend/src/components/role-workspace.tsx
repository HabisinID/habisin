"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  List,
  ShoppingBag,
  Store,
  UserRound,
  ShieldCheck,
  Menu,
  ClipboardList,
  History,
} from "lucide-react";
import { api, ApiError, type User } from "@/lib/api";
import HabisinLogo from "./habisin-logo";
import SiteHeader from "./site-header";
import LogoutButton from "./logout-button";
import Modal from "./modal";
import { Auth } from "./account";
import s from "./role-workspace.module.css";

export default function RoleWorkspace({
  role = "partner",
  title,
  subtitle,
  children,
  actions,
}: {
  role?: "partner" | "admin";
  title: string;
  subtitle: string;
  actions?: React.ReactNode;
  children: (
    user: User,
    onUser: (value: User | null) => void,
  ) => React.ReactNode;
}) {
  const [user, setUser] = useState<User | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [login, setLogin] = useState(false),
    [menu, setMenu] = useState(false);
  const router = useRouter(),
    path = usePathname();
  useEffect(() => {
    const c = new AbortController();
    api<User>("auth/me", "GET", undefined, c.signal)
      .then((value) => {
        if (!c.signal.aborted) setUser(value);
      })
      .catch((e) => {
        if (!c.signal.aborted && !(e instanceof ApiError && e.status === 403))
          setError(e.message);
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    return () => c.abort();
  }, []);
  useEffect(() => {
    const media = matchMedia("(max-width:1024px)");
    const closeOnDesktop = () => {
      if (!media.matches) setMenu(false);
    };
    media.addEventListener("change", closeOnDesktop);
    return () => media.removeEventListener("change", closeOnDesktop);
  }, []);
  async function logout() {
    try {
      await api("auth/logout", "POST");
      router.replace("/");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const links =
    role === "partner"
      ? [
          { href: "/partner", label: "Dasbor", Icon: LayoutDashboard },
          { href: "/partner/listings", label: "Listing", Icon: List },
          { href: "/partner/orders", label: "Pesanan", Icon: ShoppingBag },
          { href: "/partner/store", label: "Profil toko", Icon: Store },
          { href: "/partner/account", label: "Akun", Icon: UserRound },
        ]
      : [
          { href: "/admin", label: "Ringkasan", Icon: LayoutDashboard },
          { href: "/admin/listings", label: "Listing", Icon: List },
          { href: "/admin/log", label: "Log moderasi", Icon: History },
          { href: "/admin/account", label: "Akun", Icon: UserRound },
        ];
  const navigation = (
    <>
      {links.map(({ href, label, Icon }) => (
        <Link
          href={href}
          key={href}
          aria-current={path === href ? "page" : undefined}
          onClick={() => setMenu(false)}
        >
          <Icon size={18} />
          {label}
        </Link>
      ))}
      {role === "admin" && (
        <>
          <button disabled title="Belum diimplementasikan">
            <ClipboardList size={18} />
            Pendaftaran mitra
          </button>
          <button disabled title="Belum diimplementasikan">
            <ShoppingBag size={18} />
            Laporan komplain
          </button>
        </>
      )}
    </>
  );
  return (
    <div className={s.shell}>
      <aside
        className={s.sidebar}
        aria-label={`Navigasi ${role === "partner" ? "mitra" : "admin"}`}
      >
        <HabisinLogo />
        <button
          className={s.mobileMenu}
          aria-expanded={menu}
          aria-haspopup="dialog"
          onClick={() => setMenu(!menu)}
        >
          <Menu size={20} />
          Menu {role === "partner" ? "mitra" : "admin"}
        </button>
        {role === "partner" && (
          <a
            className={`${s.verify} ${menu ? s.verifyOpen : ""}`}
            href="/api/partner/kasir"
          >
            <ShieldCheck size={18} />
            Verifikasi kode
          </a>
        )}
        <nav
          aria-label={`Navigasi ${role === "partner" ? "mitra" : "admin"}`}
          className={s.nav}
        >
          {navigation}
        </nav>
        {user && (
          <LogoutButton className={s.logout} showLabel onLogout={logout} />
        )}
      </aside>
      <div className={s.main}>
        <SiteHeader
          showLogo={false}
          nav={[]}
          className={s.header}
          actions={actions}
          end={
            user ? (
              <>
                <span
                  className={s.avatar}
                  aria-label={`Akun ${user.name || user.username}`}
                >
                  {(user.name || user.username).slice(0, 2).toUpperCase()}
                </span>
                <LogoutButton className={s.mobileLogout} onLogout={logout} />
              </>
            ) : undefined
          }
        >
          <div className={s.heading}>
            <h1>{title}</h1>
            <p>{subtitle}</p>
          </div>
        </SiteHeader>
        <main className={s.content}>
          {error && (
            <div className={s.error} role="alert">
              {error}{" "}
              <button onClick={() => location.reload()}>Coba lagi</button>
            </div>
          )}
          {loading ? (
            <div role="status" aria-label="Memeriksa akun">
              <div className={s.skeleton} />
              <span className="sr-only">Memeriksa akun…</span>
            </div>
          ) : !user ? (
            <section className={s.empty}>
              <h2 className={s.title}>
                Masuk sebagai {role === "partner" ? "mitra" : "admin"}
              </h2>
              <p className={s.muted}>
                Halaman ini khusus akun {role === "partner" ? "mitra" : "admin"}
                .
              </p>
              <button className={s.primary} onClick={() => setLogin(true)}>
                Masuk
              </button>
              <Link href="/">Kembali ke beranda</Link>
            </section>
          ) : user.role !== role ? (
            <section className={s.empty}>
              <h2 className={s.title}>
                Akses khusus {role === "partner" ? "mitra" : "admin"}
              </h2>
              <Link href="/jelajahi">Jelajahi makanan</Link>
            </section>
          ) : (
            children(user, setUser)
          )}
        </main>
      </div>
      {menu && (
        <Modal
          title={`Menu ${role === "partner" ? "mitra" : "admin"}`}
          drawer
          onClose={() => setMenu(false)}
        >
          <nav
            className={s.drawerNav}
            aria-label={`Menu ${role === "partner" ? "mitra" : "admin"}`}
          >
            {navigation}
          </nav>
          {role === "partner" && (
            <a className={s.verify} href="/api/partner/kasir">
              <ShieldCheck size={18} />
              Verifikasi kode
            </a>
          )}
          {user && (
            <LogoutButton
              className={s.drawerLogout}
              showLabel
              onLogout={logout}
            />
          )}
        </Modal>
      )}
      {login && (
        <Auth
          initial="login"
          initialRole={role === "partner" ? "partner" : "buyer"}
          onClose={() => setLogin(false)}
          onUser={(value) => {
            setUser(value);
            setLogin(false);
          }}
        />
      )}
    </div>
  );
}
