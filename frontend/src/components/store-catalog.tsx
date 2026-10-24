"use client";
import Link from "next/link";
import { pickup, rupiah } from "@/lib/api";
import { eligible } from "@/lib/discovery";
import { useCatalog } from "@/hooks/use-catalog";
import ListingImage from "./listing-image";
import { designFont } from "@/lib/design-font";
import { secondaryButton, errorClass } from "./store-ui";
export default function StoreCatalog({ id }: { id: string }) {
  const { items, loading, error, now, refresh } = useCatalog(
    `stores/${encodeURIComponent(id)}/listings`,
  );
  const visible = items.filter(
    (item) => item.store_id === Number(id) && eligible(item, now),
  );
  return (
    <section
      aria-label="Makanan tersedia di toko"
      className={`${designFont.className} space-y-4 border-t border-[var(--color-line)] pt-6`}
    >
      <h2 className="text-xl font-bold text-[var(--color-dark)]">Makanan tersedia</h2>
      {loading && <p role="status">Memuat makanan toko…</p>}
      {error ? (
        <div className="space-y-3">
          <p role="alert" className={errorClass}>
            {error}
          </p>
          <button className={secondaryButton} onClick={refresh}>
            Coba lagi katalog
          </button>
        </div>
      ) : !loading && visible.length === 0 ? (
        <p>Belum ada makanan tersedia di toko ini.</p>
      ) : null}
      {!error && (
        <div className="grid grid-cols-2 gap-4 mobile:grid-cols-1">
          {visible.map((item) => (
            <Link
              key={item.id}
              href={`/?listing=${item.id}`}
              className="store-food-card block min-w-0 overflow-hidden rounded-xl border border-[var(--color-line)] bg-[var(--color-cream)] focus-visible:outline-2 focus-visible:outline-[var(--color-brand)]"
              aria-label={`Lihat ${item.name}`}
            >
              <ListingImage src={item.image} alt={item.name} />
              <div className="space-y-2 p-4">
                <h3 className="font-bold text-[var(--color-dark)]">{item.name}</h3>
                <p className="font-semibold text-[var(--color-brand)]">
                  {rupiah(item.price)}
                </p>
                <p className="text-xs text-[var(--color-muted)]">
                  {item.stock} porsi · Ambil {pickup(item.pickup_start)}–
                  {pickup(item.pickup_end)} WIB
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
