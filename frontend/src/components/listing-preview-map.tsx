"use client";
import { useEffect, useRef, useState } from "react";
import type * as Leaflet from "leaflet";
import { rupiah, type Store } from "@/lib/api";
import { validCoordinates } from "@/lib/discovery";
import styles from "./listing-composer.module.css";
import "leaflet/dist/leaflet.css";
export default function ListingPreviewMap({
  store,
  price,
}: {
  store: Store;
  price: number | null;
}) {
  const container = useRef<HTMLDivElement>(null);
  const latest = useRef({ store, price });
  const [engine, setEngine] = useState<{
    L: typeof Leaflet;
    map: Leaflet.Map;
    marker: Leaflet.Marker;
  } | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    latest.current = { store, price };
  }, [store, price]);
  useEffect(() => {
    let disposed = false;
    let map: Leaflet.Map | undefined;
    let observer: ResizeObserver | undefined;
    import("leaflet")
      .then((L) => {
        if (disposed || !container.current) return;
        const { store, price } = latest.current;
        if (!validCoordinates(store.latitude, store.longitude)) return;
        map = L.map(container.current, {
          zoomControl: false,
          scrollWheelZoom: false,
        }).setView([store.latitude, store.longitude], 15);
        L.control.zoom({ position: "topright" }).addTo(map);
        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
          maxZoom: 19,
        })
          .on("tileerror", () => {
            if (!disposed) setFailed(true);
          })
          .addTo(map);
        const span = document.createElement("span");
        span.textContent = price === null ? "Isi harga" : rupiah(price);
        const marker = L.marker([store.latitude, store.longitude], {
          icon: L.divIcon({
            className: "composer-map-pin",
            html: span,
            iconSize: [100, 36],
            iconAnchor: [50, 36],
          }),
          keyboard: false,
        }).addTo(map);
        observer = new ResizeObserver(() =>
          map?.invalidateSize({ pan: false }),
        );
        observer.observe(container.current);
        setEngine({ L, map, marker });
      })
      .catch(() => {
        if (!disposed) setFailed(true);
      });
    return () => {
      disposed = true;
      observer?.disconnect();
      map?.remove();
    };
  }, []);
  useEffect(() => {
    if (!engine) return;
    engine.map.setView([store.latitude, store.longitude], engine.map.getZoom());
    const span = document.createElement("span");
    span.textContent = price === null ? "Isi harga" : rupiah(price);
    engine.marker.setLatLng([store.latitude, store.longitude]).setIcon(
      engine.L.divIcon({
        className: "composer-map-pin",
        html: span,
        iconSize: [100, 36],
        iconAnchor: [50, 36],
      }),
    );
  }, [engine, store.latitude, store.longitude, price]);
  return (
    <div
      className={styles.mapPreview}
      aria-label={`Pratinjau lokasi ${store.name}`}
    >
      <div ref={container} className="h-full w-full" />
      {failed && (
        <p
          className="absolute bottom-6 left-2 right-2 z-[450] rounded bg-white p-2 text-xs"
          role="status"
        >
          Gambar peta belum tersedia; posisi mengikuti pin toko.
        </p>
      )}
    </div>
  );
}
