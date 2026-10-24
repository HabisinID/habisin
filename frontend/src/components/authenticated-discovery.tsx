"use client";
import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { List, Map, LocateFixed } from "lucide-react";
import { listingCategories, type Listing, type User } from "@/lib/api";
import { discover, type MapBounds, type Origin } from "@/lib/discovery";
import { designFont } from "@/lib/design-font";
import FoodPostCard from "./food-post-card";
import MapBoundary from "./map-boundary";
import styles from "./food-discovery.module.css";
const FoodMap = dynamic(() => import("./food-map"), {
  ssr: false,
  loading: () => (
    <p role="status" className={styles.status}>
      Menyiapkan peta di sekitarmu…
    </p>
  ),
});
export default function AuthenticatedDiscovery({
  items,
  now,
  user,
  origin,
  location,
  locating,
  recenterKey,
  online,
  hasServerData,
  loading,
  error,
  saved,
  onSave,
  onSelect,
  onRefresh,
  onLocate,
  onPartner,
  query: headerQuery,
  onQueryChange,
  savedOnly: headerSaved,
  onSavedOnlyChange,
}: {
  items: Listing[];
  now: number;
  user: User;
  origin: Origin;
  location: string;
  locating: boolean;
  recenterKey: number;
  online: boolean;
  hasServerData: boolean;
  loading: boolean;
  error: string;
  saved: number[];
  onSave: (id: number) => void;
  onSelect: (item: Listing) => void;
  onRefresh: () => void;
  onLocate: () => void;
  onOrders: () => void;
  onPartner: () => void;
  query?: string;
  onQueryChange?: (query: string) => void;
  savedOnly?: boolean;
  onSavedOnlyChange?: (value: boolean) => void;
}) {
  const [view, setView] = useState(user.role === "buyer" ? "map" : "list");
  const [mapMounted, setMapMounted] = useState(user.role === "buyer");
  const [localQuery, setLocalQuery] = useState("");
  const [category, setCategory] = useState("Semua");
  const [free, setFree] = useState(false);
  const [near, setNear] = useState(false);
  const [two, setTwo] = useState(false);
  const [localSavedOnly, setLocalSavedOnly] = useState(false);
  const query = headerQuery ?? localQuery;
  const setQuery = onQueryChange ?? setLocalQuery;
  const savedOnly = headerSaved ?? localSavedOnly;
  const setSavedOnly = onSavedOnlyChange ?? setLocalSavedOnly;
  const [focused, setFocused] = useState<{
    listingId: number;
    key: string;
    request: number;
  } | null>(null);

  const [maxPrice, setMaxPrice] = useState(Infinity);
  const [sort, setSort] = useState("pickup");
  const [bounds, setBounds] = useState<MapBounds | null>(null);
  const { visibleListings, storeGroups, unmappableListings } = useMemo(
    () =>
      discover(
        items,
        {
          query,
          category,
          free,
          maxPrice,
          savedOnly,
          saved,
          sort,
          minStock: two ? 2 : 1,
          maxDistance: near ? 1 : undefined,
          bounds,
        },
        origin,
        now,
      ),
    [
      items,
      query,
      category,
      free,
      maxPrice,
      savedOnly,
      saved,
      sort,
      two,
      near,
      bounds,
      origin,
      now,
    ],
  );
  const activeFocus =
    focused && visibleListings.some((item) => item.id === focused.listingId)
      ? focused
      : null;
  function reset() {
    setQuery("");
    setCategory("Semua");
    setFree(false);
    setNear(false);
    setTwo(false);
    setSavedOnly(false);
    setMaxPrice(Infinity);
    setBounds(null);
    setFocused(null);
  }
  const mapView = view === "map";
  const controls = (
    <div className={styles.controls}>
      <div className={styles.toggle} aria-label="Tampilan katalog">
        <button
          aria-pressed={mapView}
          onClick={() => {
            setView("map");
            setMapMounted(true);
          }}
        >
          <Map size={16} />
          Peta
        </button>
        <button aria-pressed={!mapView} onClick={() => setView("list")}>
          <List size={16} />
          Daftar
        </button>
      </div>
      <select
        className={styles.select}
        aria-label="Urutkan makanan"
        value={sort}
        onChange={(e) => setSort(e.target.value)}
      >
        <option value="pickup">Urutkan: Waktu ambil</option>
        <option value="price">Urutkan: Harga termurah</option>
        <option value="near">Urutkan: Terdekat</option>
      </select>
    </div>
  );
  const intro = (
    <>
      <div className={styles.heading}>
        <div>
          <h1>Makanan surplus di sekitar Anda</h1>
          <p className={styles.muted}>
            {visibleListings.length}{" "}
            {online
              ? "listing tersedia"
              : hasServerData
                ? "listing dari katalog terakhir"
                : "contoh listing"}{" "}
            · {location} ·{" "}
            {sort === "pickup"
              ? "waktu ambil tercepat"
              : sort === "price"
                ? "harga termurah"
                : "jarak terdekat"}
          </p>
        </div>
        {controls}
      </div>
      {user.role !== "buyer" && (
        <div className={styles.tools}>
          <input
            type="text"
            className={styles.search}
            aria-label="Cari makanan atau toko"
            placeholder="Cari makanan atau toko"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button className={styles.link} onClick={() => setQuery("")}>
              Hapus pencarian
            </button>
          )}
          <button
            className={styles.link}
            onClick={onLocate}
            disabled={locating}
          >
            <LocateFixed size={16} />
            {locating ? "Mencari lokasi…" : "Gunakan lokasi saya"}
          </button>

          {user.role === "partner" && (
            <button className={styles.link} onClick={onPartner}>
              Kelola listing
            </button>
          )}
        </div>
      )}
      <div className={styles.chips} aria-label="Filter makanan">
        <button
          className={styles.chip}
          aria-pressed={
            category === "Semua" &&
            !free &&
            !near &&
            !two &&
            !savedOnly &&
            !bounds &&
            !query &&
            maxPrice === Infinity
          }
          onClick={reset}
        >
          Semua
        </button>
        <button
          className={styles.chip}
          aria-pressed={free}
          onClick={() => setFree(!free)}
        >
          Gratis
        </button>
        {["Roti & kue", "Makanan berat", "Minuman", "Katering"].map((c) => (
          <button
            key={c}
            className={styles.chip}
            aria-pressed={category === c}
            onClick={() => setCategory(category === c ? "Semua" : c)}
          >
            {c === "Makanan berat" ? "Nasi & lauk" : c}
          </button>
        ))}
        <button
          className={styles.chip}
          aria-pressed={near}
          onClick={() => setNear(!near)}
        >
          ≤ 1 km
        </button>
        <button
          className={styles.chip}
          aria-pressed={two}
          onClick={() => setTwo(!two)}
        >
          Masih ≥ 2 porsi
        </button>
      </div>
      <details className={styles.advanced}>
        <summary>
          Filter lainnya
          {savedOnly ||
          maxPrice !== Infinity ||
          ["Camilan", "Sehat"].includes(category)
            ? " · aktif"
            : ""}
        </summary>
        <div className={styles.tools}>
          {user.role !== "buyer" && (
            <button
              className={styles.chip}
              aria-pressed={savedOnly}
              onClick={() => setSavedOnly(!savedOnly)}
            >
              Favorit
            </button>
          )}
          <label>
            Kategori
            <select
              className={styles.select}
              aria-label="Kategori tambahan"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option>Semua</option>
              {listingCategories.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label>
            Harga maksimal (Rp)
            <input
              className={styles.select}
              type="number"
              min={0}
              step={1000}
              value={Number.isFinite(maxPrice) ? maxPrice : ""}
              placeholder="Tanpa batas"
              onChange={(e) =>
                setMaxPrice(
                  e.target.value === ""
                    ? Infinity
                    : Math.max(0, Number(e.target.value)),
                )
              }
            />
          </label>
          {bounds && (
            <button className={styles.link} onClick={() => setBounds(null)}>
              Hapus batas area
            </button>
          )}
        </div>
      </details>
      {bounds && (
        <button className={styles.link} onClick={() => setBounds(null)}>
          Hapus batas area peta
        </button>
      )}
    </>
  );
  const status = (
    <>
      {loading && (
        <p role="status" className={styles.status}>
          Memuat katalog…
        </p>
      )}
      {error && (
        <div role="alert" className={styles.status}>
          <p>{error}</p>
          <p>
            {online
              ? ""
              : hasServerData
                ? "Katalog terakhir dapat dilihat. Pemesanan menunggu sambungan server."
                : "Pratinjau demo, bukan data toko. Pemesanan menunggu sambungan server."}
          </p>
          <button className={styles.link} onClick={onRefresh}>
            Coba lagi katalog
          </button>
        </div>
      )}
      {!loading && !visibleListings.length && (
        <div className={styles.status} role="status">
          <p>Belum ada makanan yang cocok dengan filter ini.</p>
          <button className={styles.link} onClick={reset}>
            Reset filter
          </button>
        </div>
      )}
      {mapView && unmappableListings.length > 0 && (
        <p className={styles.status}>
          {unmappableListings.length} makanan belum memiliki koordinat valid dan
          tetap tersedia di daftar.
        </p>
      )}
    </>
  );
  return (
    <section
      id="explore"
      aria-label="Jelajahi makanan"
      className={`${styles.root} ${designFont.className}`}
    >
      <div className={mapView ? styles.split : styles.content}>
        <div className={mapView ? styles.sidebar : ""}>
          {intro}
          {status}
          <div className={mapView ? "" : styles.grid}>
            {visibleListings.map((item) => (
              <FoodPostCard
                favoritesView={savedOnly}
                key={item.id}
                item={item}
                now={now}
                origin={origin}
                saved={saved.includes(item.id)}
                onSave={() => onSave(item.id)}
                onSelect={onSelect}
                compact={mapView}
                selected={mapView && activeFocus?.listingId === item.id}
                onFocus={
                  mapView
                    ? (row) => {
                        const group = storeGroups.find((g) =>
                          g.items.some((i) => i.id === row.id),
                        );
                        if (group)
                          setFocused({
                            listingId: row.id,
                            key: group.key,
                            request: Date.now(),
                          });
                        else onSelect(row);
                      }
                    : undefined
                }
              />
            ))}
          </div>
        </div>
        {mapMounted && (
          <div className={styles.mapArea} hidden={!mapView}>
            <MapBoundary onFallback={() => setView("list")}>
              <FoodMap
                groups={storeGroups}
                focus={activeFocus}
                onFocusChange={(key) => {
                  setFocused((old) =>
                    key
                      ? old?.key === key
                        ? old
                        : {
                            key,
                            listingId:
                              storeGroups.find((g) => g.key === key)?.items[0]
                                ?.id ?? 0,
                            request: 0,
                          }
                      : null,
                  );
                }}
                origin={origin}
                recenterKey={recenterKey}
                visible={mapView}
                onSelect={onSelect}
                onFallback={() => setView("list")}
                onReset={reset}
                appearance="discovery"
                now={now}
                onLocate={onLocate}
                locating={locating}
                onSearchArea={(area) => {
                  setBounds(area);
                  onRefresh();
                }}
              />
            </MapBoundary>
          </div>
        )}
      </div>
    </section>
  );
}
