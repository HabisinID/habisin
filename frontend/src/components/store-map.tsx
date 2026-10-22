"use client";

import { useEffect, useRef, useState } from "react";
import type { Map as LeafletMap, Marker } from "leaflet";
import "leaflet/dist/leaflet.css";

type Point = { latitude: number; longitude: number };

export default function StoreMap({
  latitude,
  longitude,
  onChange,
}: Point & { onChange?: (point: Point) => void }) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const marker = useRef<Marker | null>(null);
  const change = useRef(onChange);
  const initial = useRef({ latitude, longitude });
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    change.current = onChange;
  }, [onChange]);
  const editable = Boolean(onChange);
  useEffect(() => {
    let disposed = false;
    import("leaflet")
      .then((L) => {
        if (disposed || !container.current) return;
        const point: [number, number] = [
          initial.current.latitude,
          initial.current.longitude,
        ];
        const instance = L.map(container.current, {
          scrollWheelZoom: false,
        }).setView(point, 16);
        map.current = instance;
        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
          maxZoom: 19,
        }).addTo(instance);
        const pin = L.marker(point, {
          draggable: editable,
          autoPan: true,
          title: editable
            ? "Posisi toko; geser pin untuk menyesuaikan"
            : "Lokasi toko",
          icon: L.divIcon({
            className: "store-pin",
            html: '<span class="block h-7 w-7 rounded-full border-4 border-white bg-brand shadow-lg"></span>',
            iconSize: [28, 28],
            iconAnchor: [14, 14],
          }),
        }).addTo(instance);
        marker.current = pin;
        pin.on("dragend", () => {
          const p = pin.getLatLng().wrap();
          change.current?.({ latitude: p.lat, longitude: p.lng });
        });
        if (editable)
          instance.on("click", (event) => {
            const p = event.latlng.wrap();
            pin.setLatLng(p);
            change.current?.({ latitude: p.lat, longitude: p.lng });
          });
        const observer = new ResizeObserver(() => instance.invalidateSize());
        observer.observe(container.current);
        instance.once("unload", () => observer.disconnect());
      })
      .catch(() => {
        if (!disposed) setFailed(true);
      });
    return () => {
      disposed = true;
      map.current?.remove();
      map.current = null;
      marker.current = null;
    };
  }, [editable]);
  useEffect(() => {
    initial.current = { latitude, longitude };
    const point: [number, number] = [latitude, longitude];
    marker.current?.setLatLng(point);
    map.current?.panTo(point);
  }, [latitude, longitude]);
  return (
    <div>
      <div
        ref={container}
        className="relative z-0 h-72 w-full rounded-xl bg-light"
        role="region"
        aria-label={
          editable ? "Peta konfirmasi posisi toko" : "Peta lokasi toko"
        }
      />
      {failed && (
        <p role="alert" className="mt-2 text-sm text-red-800">
          Peta belum dapat dimuat. Gunakan kolom koordinat untuk mengatur posisi
          pin.
        </p>
      )}
    </div>
  );
}
