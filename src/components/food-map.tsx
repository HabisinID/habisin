"use client";
import { useEffect, useRef } from "react";
import type { Map as LeafletMap } from "leaflet";
import type { Listing } from "@/lib/api";
import { rupiah } from "@/lib/api";
import "leaflet/dist/leaflet.css";

export default function FoodMap({
  items,
  onSelect,
  origin,
}: {
  items: Listing[];
  onSelect: (item: Listing) => void;
  origin: [number, number];
}) {
  const element = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  useEffect(() => {
    let disposed = false;
    import("leaflet").then((L) => {
      if (disposed || !element.current) return;
      const instance = L.map(element.current, { zoomControl: true }).setView(
        origin,
        14,
      );
      map.current = instance;
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(instance);
      items.forEach((item) => {
        const icon = L.divIcon({
          className: "food-pin",
          html: `<span>${rupiah(item.price)}</span>`,
          iconSize: [88, 34],
          iconAnchor: [44, 34],
        });
        L.marker([item.latitude, item.longitude], {
          icon,
          title: item.name,
          keyboard: true,
        })
          .addTo(instance)
          .on("click", () => onSelect(item));
      });
      L.circleMarker(origin, {
        radius: 8,
        color: "#fff",
        fillColor: "#3479e5",
        fillOpacity: 1,
        weight: 3,
      })
        .addTo(instance)
        .bindTooltip("Lokasi pencarian");
    });
    return () => {
      disposed = true;
      map.current?.remove();
      map.current = null;
    };
  }, [items, onSelect, origin]);
  return (
    <div
      className="map-canvas"
      ref={element}
      aria-label="Peta lokasi makanan; pilih marker harga untuk melihat makanan"
    />
  );
}
