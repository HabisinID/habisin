import Link from "next/link";
import { ArrowLeft, Clock3, MapPin } from "lucide-react";
import type { Store } from "@/lib/api";
import HabisinLogo from "./habisin-logo";

export const primaryButton =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-brand px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#174c36] disabled:opacity-55";
export const secondaryButton =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-line bg-white px-5 py-3 text-sm font-semibold text-brand hover:bg-light";
export const fieldClass =
  "w-full rounded-lg border border-[#dfe5d7] bg-white px-3 py-3 text-sm text-dark";
export const errorClass =
  "rounded-lg bg-[#fbeae4] p-3 text-sm leading-relaxed text-[#a34337]";

export function StoreShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="border-b border-line bg-cream">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-6">
          <HabisinLogo className="brand flex items-center text-2xl font-extrabold tracking-tight" />
          <Link href="/" className="flex items-center gap-2 text-xs text-brand">
            <ArrowLeft size={16} />
            Kembali jelajah
          </Link>
        </div>
      </header>
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
          className={`rounded-full px-3 py-1 text-xs font-semibold ${store.is_open ? "bg-light text-brand" : "bg-[#f1e8e4] text-[#865b4c]"}`}
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
