"use client";
import { useEffect, useRef } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight, Timer, Ticket } from "lucide-react";
import { pickup, rupiah, type Listing, type User } from "@/lib/api";
import {
  locationDistance,
  validCoordinates,
  type Origin,
} from "@/lib/discovery";
import { listingTime, preparedLabel } from "@/lib/listing-time";
import { designFont } from "@/lib/design-font";
import { useReservationPolicy } from "@/hooks/use-reservation-policy";
import ListingImage from "./listing-image";
import { PickupProgress, PriceSticker } from "./food-post-card";
import styles from "./food-discovery.module.css";
export default function FoodListingDetail({
  item,
  now,
  user,
  origin,
  available,
  online,
  loading,
  quantity,
  busy,
  error,
  policyRevision,
  onQuantity,
  onBook,
  onClose,
  onOrders,
  note,
  onNote,
}: {
  item: Listing;
  now: number;
  user: User | null;
  origin: Origin;
  available: boolean;
  online: boolean;
  loading: boolean;
  quantity: number;
  busy: boolean;
  error: string;
  policyRevision: number;
  onQuantity: (n: number) => void;
  onBook: () => void;
  onClose: () => void;
  onOrders: () => void;
  note: string;
  onNote: (value: string) => void;
}) {
  const time = listingTime(item, now);
  const free = item.price === 0;
  const policy = useReservationPolicy(
    item.id,
    free && user?.role === "buyer" && online,
    policyRevision,
  );
  const max = Math.max(
    0,
    Math.min(
      item.stock,
      free ? (!user ? 2 : (policy.data?.max_quantity ?? 0)) : 4,
    ),
  );
  const validQuantity =
    Number.isInteger(quantity) && quantity >= 1 && quantity <= max;
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const frame = requestAnimationFrame(() =>
      heading.current?.focus({ preventScroll: true }),
    );
    return () => cancelAnimationFrame(frame);
  }, [item.id]);
  const savings = Math.max(0, item.original_price - item.price);
  return (
    <section
      className={`${styles.root} ${designFont.className}`}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onClose();
        }
      }}
      aria-label="Detail makanan"
    >
      <div className={styles.detail}>
        <nav className={styles.breadcrumb} aria-label="Breadcrumb">
          <button className={styles.back} disabled={busy} onClick={onClose}>
            <ArrowLeft size={16} className="inline" /> Jelajahi
          </button>
          <span>/</span>
          <span>{item.store}</span>
          <span>/</span>
          <span aria-current="page">{item.name}</span>
        </nav>
        <div className={styles.columns}>
          <div className={styles.visual}>
            <div className={`${styles.photo} ${styles.detailPhoto}`}>
              <ListingImage src={item.image} alt={item.name} />
              <PriceSticker item={item} now={now} />
            </div>
            <div className={styles.photoCredit}>Foto dari toko</div>
          </div>
          <aside className={styles.decision} aria-label="Pemesanan makanan">
            <div>
              {item.store_id ? (
                <Link className={styles.link} href={`/stores/${item.store_id}`}>
                  {item.store}
                  <ArrowUpRight size={16} />
                </Link>
              ) : (
                <p className={styles.green}>{item.store}</p>
              )}
              <p className={styles.muted}>
                {locationDistance(item.latitude, item.longitude, origin)} ·{" "}
                {item.address}
              </p>
              <h1 ref={heading} tabIndex={-1}>
                {item.name}
              </h1>
            </div>
            <div>
              <div className={styles.priceRow}>
                <strong
                  className={`${styles.largePrice} ${free ? styles.green : ""}`}
                >
                  {rupiah(item.price)}
                </strong>
                {!free && savings > 0 && (
                  <del>{rupiah(item.original_price)}</del>
                )}
              </div>
              <p className={styles.green}>
                {free
                  ? "Donasi makanan dari toko"
                  : savings > 0
                    ? `Hemat ${Math.round((savings / item.original_price) * 100)}% · ${rupiah(savings)} per porsi`
                    : "Harga per porsi"}
              </p>
            </div>
            <section className={styles.pickup}>
              <h2 className={time.urgent ? styles.urgent : ""}>
                Ambil sebelum {pickup(item.pickup_end)} WIB
              </h2>
              <span className={styles.muted}>
                Waktu ambil {pickup(item.pickup_start)}–
                {pickup(item.pickup_end)} WIB
              </span>
              <span className={styles.countdown} data-urgent={time.urgent}>
                <Timer size={14} />
                {time.label}
              </span>
              <PickupProgress item={item} now={now} />
              <strong className={item.stock < 2 ? styles.urgent : ""}>
                Sisa {item.stock} porsi
              </strong>
            </section>
            <div className={styles.booking}>
              {free && (
                <p className={`${styles.small} ${styles.muted}`}>
                  Maksimal 2 porsi gratis per pembeli per hari WIB untuk seluruh
                  toko.
                </p>
              )}
              {free && user?.role === "buyer" && (
                <>
                  {policy.loading && <p role="status">Memuat kuota gratis…</p>}
                  {policy.error && (
                    <div role="alert" className={styles.error}>
                      <p>{policy.error}</p>
                      <button className={styles.link} onClick={policy.retry}>
                        Coba lagi kuota
                      </button>
                    </div>
                  )}
                  {policy.data && (
                    <>
                      <p>
                        Sisa kuota gratis hari ini:{" "}
                        {policy.data.remaining_free_portions} porsi
                      </p>
                      {policy.data.reason && (
                        <p role="status" className={styles.error}>
                          {policy.data.reason}
                        </p>
                      )}
                      {policy.data.active_free_reservation_id && (
                        <button className={styles.link} onClick={onOrders}>
                          <Ticket size={16} />
                          Lihat tiket gratis aktif
                        </button>
                      )}
                    </>
                  )}
                </>
              )}
              <div className={styles.quantity}>
                <label htmlFor="quantity">Jumlah porsi</label>
                <input
                  className={styles.select}
                  id="quantity"
                  type="number"
                  min={1}
                  max={Math.max(1, max)}
                  value={quantity}
                  disabled={
                    busy || max < 1 || (!!user && user.role !== "buyer")
                  }
                  onChange={(e) => onQuantity(Number(e.target.value))}
                />
              </div>
              {!validQuantity && max > 0 && (
                <p className={styles.error}>
                  Pilih 1–{max} porsi sesuai stok dan kuota.
                </p>
              )}
              <div className={styles.total}>
                <span>Total</span>
                <strong>
                  {rupiah(
                    item.price * (Number.isFinite(quantity) ? quantity : 0),
                  )}
                </strong>
              </div>
              {time.remaining <= 1800000 && (
                <p className={`${styles.small} ${styles.urgent}`}>
                  Pesanan lunas tidak bisa dibatalkan karena waktu ambil tersisa
                  30 menit atau kurang. Pesanan belum dibayar tetap dapat
                  dibatalkan.
                </p>
              )}
              {!available && (
                <p role="alert" className={styles.error}>
                  {online
                    ? "Makanan ini sudah tidak tersedia. Muat ulang katalog atau pilih makanan lain."
                    : "Backend belum terhubung. Sambungkan kembali sebelum memesan."}
                </p>
              )}
              {!!user && user.role !== "buyer" && (
                <p className={styles.error}>
                  Gunakan akun pembeli untuk memesan makanan.
                </p>
              )}
              {error && (
                <p role="alert" className={styles.error}>
                  {error}
                </p>
              )}
              <label className={styles.small}>
                Catatan pengambilan (opsional)
                <textarea
                  className={styles.select}
                  maxLength={140}
                  value={note}
                  onChange={(e) => onNote(e.target.value)}
                  disabled={busy}
                />
              </label>
              <button
                className={styles.primary}
                onClick={onBook}
                disabled={
                  busy ||
                  loading ||
                  !available ||
                  !validQuantity ||
                  (!!user && user.role !== "buyer") ||
                  (free &&
                    user?.role === "buyer" &&
                    (policy.loading ||
                      !!policy.error ||
                      !policy.data ||
                      !!policy.data.reason))
                }
              >
                {busy
                  ? "Memproses…"
                  : !user
                    ? "Masuk untuk memesan"
                    : "Lanjut ke ringkasan"}
              </button>
              {!free && (
                <p className={`${styles.small} ${styles.muted}`}>
                  Simulasi pembayaran demo. Tidak ada uang yang ditagih.
                </p>
              )}
              <button className={styles.link} onClick={onOrders}>
                Pesanan saya
              </button>
            </div>
            <section className={styles.address}>
              <h2>Alamat pengambilan</h2>
              <p className={styles.muted}>{item.address}</p>
              {validCoordinates(item.latitude, item.longitude) && (
                <a
                  className={`${styles.secondary} mt-4 w-full`}
                  href={`https://www.openstreetmap.org/directions?to=${encodeURIComponent(`${item.latitude},${item.longitude}`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Petunjuk arah
                  <ArrowUpRight size={16} />
                </a>
              )}
            </section>
            <section className={styles.address}>
              <h2>Ulasan makanan</h2>
              <p className={styles.muted}>
                Belum ada data ulasan yang tersedia.
              </p>
            </section>
          </aside>
          <div className={styles.information}>
            <section>
              <h2>Tentang makanan ini</h2>
              <p>{item.description}</p>
            </section>
            {item.buyer_notes && (
              <section>
                <h2>Catatan untuk pembeli</h2>
                <p>{item.buyer_notes}</p>
              </section>
            )}
            <section>
              <h2>Kebersihan &amp; penyimpanan</h2>
              <dl className={styles.metadata}>
                {[
                  ["Dibuat", preparedLabel(item.prepared_at)],
                  ["Kemasan", item.packaging],
                  ["Disimpan", item.storage_notes],
                  ["Mengandung", item.allergens],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{value || "Belum dicantumkan"}</dd>
                  </div>
                ))}
              </dl>
              <p className={`${styles.small} ${styles.muted} mt-3`}>
                Informasi dari mitra. Jika memiliki alergi, konfirmasikan
                langsung kepada toko sebelum memesan.
              </p>
            </section>
          </div>
        </div>
      </div>
    </section>
  );
}
