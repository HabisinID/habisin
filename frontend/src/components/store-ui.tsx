import { Clock3, MapPin } from "lucide-react";
import SiteHeader from "./site-header";
import type { Store, User } from "@/lib/api";

// Base components from design.pen: Btn/Primary, Btn/Secondary,
// Btn/Destructive and Input.
const buttonBase =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-control px-5 py-3 text-base transition-colors disabled:opacity-55";
export const primaryButton = `${buttonBase} bg-brand font-bold text-white hover:bg-brand-hover active:bg-brand-pressed`;
export const secondaryButton = `${buttonBase} border border-border bg-surface font-semibold text-dark hover:bg-surface-2`;
export const destructiveButton = `${buttonBase} bg-error font-bold text-white hover:opacity-90`;
export const fieldClass =
  "w-full rounded-field border border-border bg-surface px-3.5 py-3 text-base text-dark";
export const errorClass =
  "rounded-field bg-error-tint p-3 text-sm leading-relaxed text-error";

export function StoreShell({
  children,
  user,
}: {
  children: React.ReactNode;
  user?: User | null;
}) {
  return (
    <>
      <SiteHeader
        nav={[
          { label: "Jelajahi", href: "/jelajahi" },
          ...(user?.role === "partner"
            ? [{ label: "Toko saya", href: "/partner/store" }]
            : []),
        ]}
      />
      <main className="mx-auto max-w-5xl px-6 py-10 mobile:px-4 mobile:py-6">
        {children}
      </main>
    </>
  );
}

export function StoreDetails({ store }: { store: Store }) {
  const overnight = store.closing_time < store.opening_time;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-bold tracking-tight mobile:text-2xl">
          {store.name}
        </h1>
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold ${store.is_open ? "bg-light text-brand" : "bg-[var(--color-error-tint)] text-[var(--color-error)]"}`}
        >
          {store.is_open ? "Toko aktif" : "Toko ditutup sementara"}
        </span>
      </div>
      <p className="whitespace-pre-wrap break-words leading-relaxed text-muted">
        {store.description}
      </p>
      <p className="flex items-start gap-2 break-words text-sm">
        <MapPin size={18} className="text-brand" />
        {store.address}
      </p>
      <p className="flex items-start gap-2 text-sm">
        <Clock3 size={18} className="text-brand" />
        Setiap hari, {store.opening_time.slice(0, 5)}–
        {store.closing_time.slice(0, 5)} WIB
        {overnight ? " (hari berikutnya)" : ""}
      </p>
      <p className="text-xs text-muted">
        Status aktif menunjukkan toko menerima kunjungan sesuai jam operasional
        di atas.
      </p>
    </div>
  );
}
