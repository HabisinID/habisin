"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type * as Leaflet from "leaflet";
import { rupiah, type Listing } from "@/lib/api";
import {
  storePriceRange,
  type MapBounds,
  type StoreGroup,
  type Origin,
} from "@/lib/discovery";
import { LocateFixed } from "lucide-react";
import { listingTime } from "@/lib/listing-time";
import StoreMapPopup from "./store-map-popup";
import styles from "./food-map.module.css";
import { designFont } from "@/lib/design-font";
import "leaflet/dist/leaflet.css";
type Engine = {
  L: typeof Leaflet;
  map: Leaflet.Map;
  tile: Leaflet.TileLayer;
  popup: Leaflet.Popup;
  host: HTMLDivElement;
  point: Leaflet.CircleMarker;
  markers: Map<string, Leaflet.Marker>;
};
function updatePopup(popup: Leaflet.Popup, host: HTMLDivElement) {
  const focused = document.activeElement as HTMLElement | null;
  const restore = focused && host.contains(focused);
  popup.update();
  if (restore) focused.focus({ preventScroll: true });
}
export default function FoodMap({
  groups,
  onSelect,
  origin,
  visible,
  recenterKey,
  onFallback,
  onReset,
  appearance = "default",
  now = 0,
  onSearchArea,
  onLocate,
  locating = false,
  focus,
  onFocusChange,
}: {
  groups: StoreGroup[];
  onSelect: (item: Listing) => void;
  origin: Origin;
  visible: boolean;
  recenterKey: number;
  onFallback: () => void;
  onReset: () => void;
  appearance?: "default" | "discovery" | "landing";
  now?: number;
  onSearchArea?: (bounds: MapBounds) => void;
  onLocate?: () => void;
  locating?: boolean;
  focus?: { key: string; request: number } | null;
  onFocusChange?: (key: string | null) => void;
}) {
  const design = appearance !== "default";
  const landing = appearance === "landing";
  const markerSignatures = useRef(new Map<string, string>());
  const container = useRef<HTMLDivElement>(null);
  const region = useRef<HTMLDivElement>(null);
  const latest = useRef({ groups, onSelect });
  const initial = useRef(origin);
  const [engine, setEngine] = useState<Engine | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [popupKey, setPopupKey] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [tileFailed, setTileFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const lastCenter = useRef(recenterKey);
  const currentKey = useRef<string | null>(null);
  const focusZoom = useRef<number | null>(null);
  const focusing = useRef(false);
  const focusCallback = useRef(onFocusChange);
  useEffect(() => {
    focusCallback.current = onFocusChange;
  }, [onFocusChange]);
  useEffect(() => {
    latest.current = { groups, onSelect };
  }, [groups, onSelect]);
  useEffect(() => {
    initial.current = origin;
  }, [origin]);
  useEffect(() => {
    let disposed = false;
    let instance: Leaflet.Map | undefined;
    let observer: ResizeObserver | undefined;
    import("leaflet")
      .then((L) => {
        if (disposed || !container.current) return;
        instance = L.map(container.current, {
          zoomControl: !design,
          scrollWheelZoom: !landing,
        }).setView(initial.current, 14);
        if (design) L.control.zoom({ position: "topright" }).addTo(instance);
        if (landing) instance.attributionControl.setPosition("topleft");
        const tile = L.tileLayer(
          "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
          {
            attribution:
              '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
            maxZoom: 19,
          },
        );
        tile.on("tileerror", () => {
          if (!disposed) setTileFailed(true);
        });
        tile.addTo(instance);
        const host = document.createElement("div");
        const popup = L.popup({
          className: "habisin-map-popup",
          closeButton: false,
          closeOnEscapeKey: false,
          minWidth: 200,
          maxWidth: 290,
          autoPanPaddingTopLeft: [12, 55],
          autoPanPaddingBottomRight: [12, 55],
        }).setContent(host);
        const point = L.circleMarker(initial.current, {
          radius: 8,
          color: "#fff",
          fillColor: "#3479e5",
          fillOpacity: 1,
          weight: 3,
        })
          .addTo(instance)
          .bindTooltip("Lokasi pencarian");
        const markers = new Map<string, Leaflet.Marker>();
        instance.on("popupclose", () => {
          if (focusing.current) return;
          const restore =
            host.contains(document.activeElement) ||
            document.activeElement === document.body;
          const previous = currentKey.current;
          currentKey.current = null;
          setSelectedKey(null);
          setPopupKey(null);
          focusCallback.current?.(null);
          if (restore)
            requestAnimationFrame(() => {
              if (disposed) return;
              (
                (previous && markers.get(previous)?.getElement()) ||
                region.current
              )?.focus({ preventScroll: true });
            });
        });
        instance.on("zoomend", () => {
          if (instance)
            region.current?.setAttribute(
              "data-zoom",
              String(instance.getZoom()),
            );
          if (
            focusZoom.current !== null &&
            instance &&
            instance.getZoom() <= focusZoom.current - 2
          ) {
            currentKey.current = null;
            focusZoom.current = null;
            setSelectedKey(null);
            instance.closePopup();
            focusCallback.current?.(null);
          }
        });
        observer = new ResizeObserver(() => {
          instance?.invalidateSize({ pan: false });
          if (popup.isOpen()) updatePopup(popup, host);
        });
        observer.observe(container.current);
        setEngine({ L, map: instance, tile, popup, host, point, markers });
      })
      .catch(() => {
        if (!disposed) setFailed(true);
      });
    return () => {
      disposed = true;
      observer?.disconnect();
      instance?.off();
      instance?.remove();
    };
  }, [attempt, design, landing]);
  const openGroup = useCallback(
    (key: string) => {
      const group = latest.current.groups.find((g) => g.key === key);
      if (!engine || !group) return;
      currentKey.current = key;
      setSelectedKey(key);
      setPopupKey(key);
      focusZoom.current = engine.map.getZoom();
      focusCallback.current?.(key);
      engine.popup
        .setLatLng([group.latitude, group.longitude])
        .openOn(engine.map);
    },
    [engine],
  );
  const closePopup = useCallback(() => {
    engine?.map.closePopup();
    currentKey.current = null;
    focusZoom.current = null;
    setSelectedKey(null);
    setPopupKey(null);
    focusCallback.current?.(null);
  }, [engine]);
  useEffect(() => {
    if (!engine || focus === undefined) return;
    if (!focus) {
      if (currentKey.current) {
        engine.map.closePopup();
        currentKey.current = null;
        requestAnimationFrame(() => setSelectedKey(null));
      }
      focusCallback.current?.(null);
      return;
    }
    if (!focus.request) return;
    const group = latest.current.groups.find((g) => g.key === focus.key);
    if (!group) return;
    focusing.current = true;
    engine.map.closePopup();
    focusing.current = false;
    currentKey.current = focus.key;
    focusZoom.current = 16;
    engine.map.setView([group.latitude, group.longitude], 16, {
      animate: false,
    });
    // Selecting from the list keeps its card visible instead of opening a popup.
    requestAnimationFrame(() => {
      setSelectedKey(focus.key);
      setPopupKey(null);
      focusCallback.current?.(focus.key);
    });
  }, [engine, focus]);
  useEffect(() => {
    if (!engine) return;
    const keys = new Set(groups.map((group) => group.key));
    for (const [key, marker] of engine.markers) {
      if (!keys.has(key)) {
        if (currentKey.current === key) {
          const restore =
            engine.host.contains(document.activeElement) ||
            marker.getElement() === document.activeElement;
          engine.map.closePopup();
          if (restore && !document.querySelector("dialog[open]"))
            region.current?.focus({ preventScroll: true });
        }
        marker.remove();
        engine.markers.delete(key);
        markerSignatures.current.delete(key);
      }
    }
    for (const group of groups) {
      const span = document.createElement("span");
      if (design) {
        const name = document.createElement("b");
        name.className = "pin-store-name";
        name.textContent = group.name;
        const price = document.createElement("strong");
        price.className = "pin-store-price";
        price.textContent = storePriceRange(group);
        span.append(name, document.createTextNode(" | "), price);
      } else span.textContent = rupiah(group.minPrice);
      const urgent = group.items.some((item) => listingTime(item, now).urgent);
      const hiddenLabel = design && popupKey === group.key;
      const pinClass = `food-pin${design ? ` discovery-pin ${group.minPrice === 0 ? "free-pin" : "paid-pin"}${urgent ? " urgent-pin" : ""}${selectedKey === group.key ? " selected-pin" : ""}${hiddenLabel ? " popup-pin" : ""}` : ""}`;
      const icon = engine.L.divIcon({
        className: pinClass,
        html: span,
        iconSize: design ? undefined : [100, 36],
        iconAnchor: [design ? 0 : 50, 36],
      });
      let marker = engine.markers.get(group.key);
      const label = `${group.name}, ${group.items.length} makanan, mulai ${rupiah(group.minPrice)}${group.storeId === null ? ", profil belum terhubung" : `, toko #${group.storeId}`}`;
      const signature = `${pinClass}:${span.textContent}:${group.latitude}:${group.longitude}`;
      if (marker) {
        if (markerSignatures.current.get(group.key) !== signature)
          marker.setLatLng([group.latitude, group.longitude]).setIcon(icon);
      } else {
        marker = engine.L.marker([group.latitude, group.longitude], {
          icon,
          title: label,
          keyboard: true,
        }).addTo(engine.map);
        engine.markers.set(group.key, marker);
        marker.on("click", () => openGroup(group.key));
        const element = marker.getElement();
        if (element) {
          const space = (event: KeyboardEvent) => {
            if (event.key === " " || event.key === "Enter") {
              event.preventDefault();
              event.stopPropagation();
              openGroup(group.key);
            }
          };
          element.addEventListener("keydown", space);
          marker.once("remove", () =>
            element.removeEventListener("keydown", space),
          );
        }
      }
      markerSignatures.current.set(group.key, signature);
      marker.getElement()?.setAttribute("title", label);
      marker.getElement()?.setAttribute("aria-label", label);
      const element = marker.getElement();
      if (element) {
        element.tabIndex = hiddenLabel ? -1 : 0;
        if (hiddenLabel) element.setAttribute("aria-hidden", "true");
        else element.removeAttribute("aria-hidden");
      }
      if (currentKey.current === group.key)
        engine.popup.setLatLng([group.latitude, group.longitude]);
    }
  }, [groups, engine, openGroup, design, now, selectedKey, popupKey]);
  useEffect(() => {
    if (!engine) return;
    engine.point.setLatLng(origin);
    if (lastCenter.current !== recenterKey) {
      engine.map.panTo(origin);
      lastCenter.current = recenterKey;
    }
  }, [engine, origin, recenterKey]);
  useEffect(() => {
    if (!engine || !visible) return;
    const frame = requestAnimationFrame(() =>
      engine.map.invalidateSize({ pan: false }),
    );
    return () => cancelAnimationFrame(frame);
  }, [engine, visible]);
  const selected = groups.find((group) => group.key === selectedKey);
  useEffect(() => {
    if (!engine || !selected) return;
    const frame = requestAnimationFrame(() => {
      updatePopup(engine.popup, engine.host);
    });
    return () => cancelAnimationFrame(frame);
  }, [engine, selected]);
  return (
    <div
      ref={region}
      role="region"
      aria-label="Peta toko makanan, marker dapat dipilih dengan Enter atau Spasi"
      tabIndex={-1}
      className={`${styles.map} ${design ? styles.discovery : ""} ${designFont.className} relative`}
      onKeyDown={(event) => {
        if (event.key === "Escape" && currentKey.current) {
          event.preventDefault();
          event.stopPropagation();
          closePopup();
        }
      }}
    >
      <div
        className={`map-canvas relative z-0 w-full bg-[var(--color-light)] ${design ? "h-full min-h-[400px]" : "h-[530px] tablet:h-[480px]"}`}
        ref={container}
      />
      {design && !landing && engine && (
        <>
          <button
            className={styles.searchArea}
            onClick={() => {
              const b = engine.map.getBounds();
              onSearchArea?.({
                south: b.getSouth(),
                north: b.getNorth(),
                west: b.getWest(),
                east: b.getEast(),
              });
            }}
          >
            Cari di area ini
          </button>
          <button
            className={styles.locate}
            aria-label="Gunakan lokasi saya pada peta"
            onClick={onLocate}
            disabled={locating}
          >
            <LocateFixed size={18} />
          </button>
          <div className={styles.legend} aria-label="Legenda peta">
            <span>
              <i className={styles.gold} />
              Harga diskon
            </span>
            <span>
              <i className={styles.free} />
              Gratis
            </span>
            <span>
              <i className={styles.orange} />
              Ambil &lt;30 menit
            </span>
          </div>
        </>
      )}
      {engine &&
        selected &&
        engine.popup.isOpen() &&
        createPortal(
          <StoreMapPopup
            group={selected}
            neighbors={groups.filter(
              (g) =>
                g.latitude === selected.latitude &&
                g.longitude === selected.longitude,
            )}
            origin={origin}
            onClose={closePopup}
            onStore={openGroup}
            onSelect={(item) => latest.current.onSelect(item)}
          />,
          engine.host,
        )}
      {failed && (
        <div
          role="alert"
          className="absolute inset-x-3 top-14 z-[500] space-y-2 rounded-xl bg-surface p-4 text-sm shadow"
        >
          <p>Peta belum dapat dimuat. Makanan tetap tersedia melalui daftar.</p>
          <button
            onClick={() => {
              setEngine(null);
              setFailed(false);
              setTileFailed(false);
              setAttempt((n) => n + 1);
            }}
            className="mr-4 min-h-11 font-bold text-[var(--color-brand)]"
          >
            Coba lagi peta
          </button>
          <button
            onClick={onFallback}
            className="min-h-11 font-bold text-[var(--color-brand)]"
          >
            Kembali ke daftar
          </button>
        </div>
      )}
      {tileFailed && (
        <div
          role="status"
          className="absolute inset-x-3 top-3 z-[500] rounded-lg bg-surface p-2 text-xs shadow"
        >
          Gambar peta gagal dimuat; marker dan pilihan makanan tetap tersedia.{" "}
          <button
            onClick={() => {
              setTileFailed(false);
              engine?.tile.redraw();
            }}
            className="font-bold text-[var(--color-brand)]"
          >
            Coba lagi gambar peta
          </button>
        </div>
      )}
      {groups.length === 0 && !failed && (
        <div
          className="absolute left-1/2 top-1/2 z-[450] w-[min(260px,80%)] -translate-x-1/2 -translate-y-1/2 rounded-xl bg-surface p-4 text-center text-sm shadow"
          role="status"
        >
          <p>Belum ada toko yang dapat dipetakan untuk filter ini.</p>
          <button
            onClick={onReset}
            className="mt-2 min-h-11 font-bold text-[var(--color-brand)]"
          >
            Reset filter peta
          </button>
        </div>
      )}
    </div>
  );
}
