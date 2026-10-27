"use client";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { rupiah, type Listing } from "@/lib/api";
import {
  locationDistance,
  type Origin,
  type StoreGroup,
} from "@/lib/discovery";
export default function StoreMapPopup({
  group,
  neighbors,
  origin,
  onSelect,
  onStore,
  onClose,
}: {
  group: StoreGroup;
  neighbors: StoreGroup[];
  origin: Origin;
  onSelect: (item: Listing) => void;
  onStore: (key: string) => void;
  onClose: () => void;
}) {
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    title.current?.focus({ preventScroll: true });
  }, [group.key]);
  return (
    <section
      className="store-popup relative w-[240px] max-w-full space-y-2 text-[var(--color-dark)]"
      aria-label={`Pilihan makanan ${group.name}`}
    >
      <button
        type="button"
        className="absolute -right-2 -top-2 grid h-8 w-8 place-items-center rounded-md text-xl text-[var(--color-muted)] hover:bg-[var(--color-light)]"
        onClick={onClose}
        aria-label="Tutup popup toko"
      >
        ×
      </button>
      <h3
        ref={title}
        tabIndex={-1}
        className="pr-6 text-base font-bold leading-snug break-words outline-none"
      >
        {group.name}
      </h3>
      <p className="text-xs text-[var(--color-muted)]">
        {locationDistance(group.latitude, group.longitude, origin)} · perkiraan
        garis lurus
      </p>
      <p className="text-xs break-words text-[var(--color-muted)]">{group.address}</p>
      <p className="text-xs">
        {group.items.length} makanan cocok · Mulai {rupiah(group.minPrice)}
      </p>
      <ul className="max-h-28 space-y-1 overflow-y-auto overscroll-contain border-y border-[var(--color-line)] py-2">
        {group.items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              className="flex min-h-11 w-full items-center justify-between gap-2 rounded-md px-1 text-left text-xs hover:bg-[var(--color-light)]"
              onClick={() => onSelect(item)}
            >
              <span className="min-w-0 break-words">{item.name}</span>
              <span className="shrink-0 font-semibold text-[var(--color-brand)]">
                {rupiah(item.price)}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {group.storeId !== null ? (
        <Link
          href={`/stores/${group.storeId}`}
          className="inline-flex min-h-11 items-center text-sm font-bold text-[var(--color-brand)]"
        >
          Lihat toko
        </Link>
      ) : (
        <p className="text-xs text-[var(--color-muted)]">Profil toko belum terhubung.</p>
      )}
      {neighbors.length > 1 && (
        <label className="block text-xs font-semibold">
          Toko lain di lokasi ini
          <select
            className="mt-2 min-h-11 w-full rounded-md border border-[var(--color-border)] bg-surface p-2 text-xs"
            value={group.key}
            onChange={(event) => onStore(event.target.value)}
          >
            {neighbors.map((neighbor) => (
              <option key={neighbor.key} value={neighbor.key}>
                {neighbor.name} ·{" "}
                {neighbor.storeId === null
                  ? `listing ${neighbor.items[0].id}`
                  : `toko #${neighbor.storeId}`}
              </option>
            ))}
          </select>
        </label>
      )}
    </section>
  );
}
