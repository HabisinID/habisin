"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, ApiError, type User } from "@/lib/api";
import BuyerHeader from "./buyer-header";
import { Profile } from "./account";
import { errorClass, primaryButton } from "./store-ui";

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
  const [profileOpen, setProfileOpen] = useState(false);
  const router = useRouter();
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

  async function signOut() {
    await api("auth/logout", "POST");
    router.replace("/");
    router.refresh();
  }
  return (
    <>
      {/* The buyer TopNav shared with Jelajahi; searching opens Jelajahi. */}
      <BuyerHeader
        user={user}
        active="orders"
        loading={state === "loading"}
        onNotice={setNotice}
        onAccount={() => setProfileOpen(true)}
        onLogout={signOut}
        onLogin={() => router.push("/")}
      />
      {profileOpen && user && (
        <Profile
          user={user}
          onClose={() => setProfileOpen(false)}
          onUser={(value) => {
            setUser(value);
            if (!value) {
              setProfileOpen(false);
              setState("guest");
              router.replace("/");
              router.refresh();
            }
          }}
        />
      )}
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
