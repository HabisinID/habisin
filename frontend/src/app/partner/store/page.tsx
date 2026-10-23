"use client";

import { useEffect, useState } from "react";
import { api, ApiError, type User } from "@/lib/api";
import { Auth } from "@/components/account";
import StoreManager from "@/components/store-manager";
import {
  errorClass,
  primaryButton,
  secondaryButton,
  StoreShell,
} from "@/components/store-ui";

export default function PartnerStorePage() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [auth, setAuth] = useState<"login" | "register" | null>(null);
  useEffect(() => {
    let active = true;
    api<User>("auth/me")
      .then((value) => {
        if (active) setUser(value);
      })
      .catch((e) => {
        if (active && !(e instanceof ApiError && e.status === 403))
          setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  return (
    <StoreShell>
      {loading ? (
        <p role="status">Memeriksa akun…</p>
      ) : error ? (
        <div className="space-y-4">
          <p className={errorClass} role="alert">
            {error}
          </p>
          <button
            className={secondaryButton}
            onClick={() => window.location.reload()}
          >
            Coba lagi
          </button>
        </div>
      ) : user?.role === "partner" ? (
        <StoreManager />
      ) : user ? (
        <div className="space-y-4">
          <h1 className="text-3xl font-bold">Halaman khusus mitra</h1>
          <p className="text-muted">
            Akun {user.role === "admin" ? "admin" : "pembeli"} tidak dapat
            mendaftarkan toko. Masuk dengan akun mitra melalui halaman utama.
          </p>
        </div>
      ) : (
        <section className="mx-auto max-w-xl space-y-5 rounded-2xl border border-line bg-white p-8">
          <p className="text-xs font-bold tracking-widest text-brand">
            BERGABUNG SEBAGAI MITRA
          </p>
          <h1 className="text-3xl font-bold">
            Tempat baru untuk peluang baik.
          </h1>
          <p className="leading-relaxed text-muted">
            Masuk atau buat akun mitra untuk mendaftarkan dan mengelola profil
            toko kamu.
          </p>
          <div className="flex flex-wrap gap-3">
            <button className={primaryButton} onClick={() => setAuth("login")}>
              Masuk sebagai mitra
            </button>
            <button
              className={secondaryButton}
              onClick={() => setAuth("register")}
            >
              Buat akun mitra
            </button>
          </div>
        </section>
      )}
      {auth && (
        <Auth
          initial={auth}
          initialRole="partner"
          onClose={() => setAuth(null)}
          onUser={setUser}
        />
      )}
    </StoreShell>
  );
}
