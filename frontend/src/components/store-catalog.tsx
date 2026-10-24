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
      className={`${designFont.className} space-y-4 border-t border-[#e6e4d6] pt-6`}
    >
      <h2 className="text-xl font-bold text-[#1c2616]">Makanan tersedia</h2>
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
              className="store-food-card block min-w-0 overflow-hidden rounded-xl border border-[#e6e4d6] bg-[#fbf7ec] focus-visible:outline-2 focus-visible:outline-[#3e6b26]"
              aria-label={`Lihat ${item.name}`}
            >
              <ListingImage src={item.image} alt={item.name} />
              <div className="space-y-2 p-4">
                <h3 className="font-bold text-[#1c2616]">{item.name}</h3>
                <p className="font-semibold text-[#3e6b26]">
                  {rupiah(item.price)}
                </p>
                <p className="text-xs text-[#5a6653]">
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
