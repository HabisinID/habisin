"use client";
import { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { type Listing } from "@/lib/api";
import { eligible } from "@/lib/discovery";
export default function ListingDeepLink({
  items,
  ready,
  now,
  onSelect,
  onMissing,
}: {
  items: Listing[];
  ready: boolean;
  now: number;
  onSelect: (item: Listing) => void;
  onMissing: (message: string) => void;
}) {
  const params = useSearchParams();
  const raw = params.get("listing");
  const consumed = useRef<string | null>(null);
  useEffect(() => {
    if (raw === null) {
      consumed.current = null;
      return;
    }
    if (!ready || consumed.current === raw) return;
    consumed.current = raw;
    const id = /^\d+$/.test(raw) ? Number(raw) : NaN;
    const item =
      Number.isSafeInteger(id) && id > 0
        ? items.find((row) => row.id === id && eligible(row, now))
        : undefined;
    if (item) onSelect(item);
    else
      onMissing(
        "Makanan pada tautan ini tidak tersedia. Silakan pilih makanan lain di jelajah.",
      );
  }, [raw, ready, items, now, onSelect, onMissing]);
  return null;
}
