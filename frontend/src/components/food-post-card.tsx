"use client";
import { ArrowUpRight, Heart, Trash2 } from "lucide-react";
import { pickup, rupiah, type Listing } from "@/lib/api";
import { locationDistance, type Origin } from "@/lib/discovery";
import { listingTime } from "@/lib/listing-time";
import ListingImage from "./listing-image";
import styles from "./food-discovery.module.css";
export function PriceSticker({ item, now }: { item: Listing; now: number }) {
  return (
    <span
      className={styles.sticker}
      data-free={item.price === 0}
      data-urgent={listingTime(item, now).urgent}
    >
      {rupiah(item.price)}
    </span>
  );
}
export function PickupProgress({ item, now }: { item: Listing; now: number }) {
  const time = listingTime(item, now);
  return (
    <progress
      className={styles.progress}
      data-urgent={time.urgent}
      max={1}
      value={time.progress}
      aria-label={`Sisa waktu pengambilan: ${time.label}`}
    />
  );
}
export default function FoodPostCard({
  item,
  now,
  origin,
  saved,
  onSave,
  onSelect,
  compact = false,
  selected = false,
  favoritesView = false,
  onFocus,
}: {
  item: Listing;
  now: number;
  origin: Origin;
  saved: boolean;
  onSave: () => void;
  onSelect: (item: Listing) => void;
  compact?: boolean;
  selected?: boolean;
  favoritesView?: boolean;
  onFocus?: (item: Listing) => void;
}) {
  const time = listingTime(item, now);
  const savings =
    item.original_price > item.price
      ? Math.round((1 - item.price / item.original_price) * 100)
      : 0;
  return (
    <article
      className={`food-card ${styles.card} ${compact ? styles.compact : ""}`}
      onClick={(event) => {
        if (onFocus && !(event.target as Element).closest("button,a,input"))
          onFocus(item);
      }}
      data-listing-id={item.id}
      data-selected={selected}
      aria-label={selected ? `${item.name}, dipilih pada peta` : undefined}
    >
      <div className="relative">
        <button
          className={styles.imageButton}
          onClick={() => (onFocus || onSelect)(item)}
          aria-label={`Pesan ${item.name}`}
        >
          <div className={styles.photo}>
            <ListingImage src={item.image} alt={item.name} />
            <PriceSticker item={item} now={now} />
          </div>
        </button>
        <button
          className={`${styles.favorite} ${favoritesView ? styles.removeFavorite : ""}`}
          aria-label={
            saved
              ? `Hapus ${item.name} dari favorit`
              : `Simpan ${item.name} ke favorit`
          }
          aria-pressed={saved}
          onClick={onSave}
        >
          {favoritesView ? (
            <Trash2 size={18} aria-hidden="true" />
          ) : (
            <Heart
              size={compact ? 14 : 18}
              fill={saved ? "currentColor" : "none"}
            />
          )}
        </button>
      </div>
      <div className={styles.cardBody}>
        <h2>
          <button
            className={`card-title ${styles.cardTitle}`}
            onClick={() => (onFocus || onSelect)(item)}
            aria-label={`Lihat ${item.name}`}
          >
            {item.name}
          </button>
        </h2>
        <p className={styles.muted}>
          {item.store} ·{" "}
          {locationDistance(item.latitude, item.longitude, origin)}
        </p>
        <div className={styles.priceRow}>
          <strong className={item.price === 0 ? styles.green : ""}>
            {rupiah(item.price)}
          </strong>
          {item.price > 0 && savings > 0 && (
            <del>{rupiah(item.original_price)}</del>
          )}
          <span className={`${styles.small} ${styles.green}`}>
            {item.price === 0 ? "Donasi" : savings ? `Hemat ${savings}%` : ""}
          </span>
        </div>
        <p className={`${styles.deadline} ${time.urgent ? styles.urgent : ""}`}>
          {time.urgent
            ? `${time.label} · ambil sebelum ${pickup(item.pickup_end)}`
            : `Ambil sebelum ${pickup(item.pickup_end)} · ${time.label}`}
        </p>
        <p
          className={`${styles.small} ${item.stock < 2 ? styles.urgent : styles.muted}`}
        >
          Sisa {item.stock} porsi
        </p>
      </div>
      {onFocus && (
        <button
          className={styles.detailAction}
          onClick={() => onSelect(item)}
          aria-label={`Lihat detail ${item.name}`}
          title={`Lihat detail ${item.name}`}
        >
          <ArrowUpRight size={21} aria-hidden="true" />
        </button>
      )}
      <PickupProgress item={item} now={now} />
    </article>
  );
}
