"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, ApiError, type User } from "@/lib/api";
import SiteHeader from "./site-header";
import { errorClass, primaryButton } from "./store-ui";

// Frame shared by the order pages: header with "Pesanan" active, and a
// sign-in prompt for guests. Pages render only once a buyer is known.
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

  return (
    <>
      <SiteHeader
        nav={[
          { label: "Jelajahi", href: "/" },
          { label: "Pesanan", href: "/pesanan", current: true },
        ]}
        end={
          user && (
            <span
              className="grid h-10 w-10 place-items-center rounded-full bg-light text-sm font-bold text-brand"
              title={user.name || user.username}
            >
              {(user.name || user.username)[0].toUpperCase()}
            </span>
          )
        }
      />
      {state === "ready" ? (
        children
      ) : (
        <main
          className={`mx-auto px-8 py-12 tablet:px-4 ${wide ? "max-w-[1440px]" : "max-w-5xl"}`}
        >
          {state === "loading" && <p role="status">Memuat pesanan…</p>}
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
