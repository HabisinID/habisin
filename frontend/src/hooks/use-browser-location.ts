"use client";
import { useEffect, useRef, useState } from "react";
import { validCoordinates, type Origin } from "@/lib/discovery";
export const defaultOrigin: Origin = [-6.366, 106.829];
export function useBrowserLocation(notify: (message: string) => void) {
  const [origin, setOrigin] = useState<Origin>(defaultOrigin);
  const [location, setLocation] = useState("Beji, Depok");
  const [locating, setLocating] = useState(false);
  const [recenterKey, setRecenterKey] = useState(0);
  const epoch = useRef({ value: 0, lastValid: false });
  useEffect(() => {
    const current = epoch.current;
    return () => {
      current.value++;
    };
  }, []);
  function locate() {
    const ticket = ++epoch.current.value;
    const fallback = () =>
      epoch.current.lastValid
        ? "Lokasi valid terakhir tetap digunakan."
        : "Pencarian tetap di Beji, Depok.";
    if (!navigator.geolocation) {
      setLocating(false);
      notify(`Browser ini belum mendukung lokasi. ${fallback()}`);
      return;
    }
    setLocating(true);
    const failed = (reason: string) => {
      if (ticket !== epoch.current.value) return;
      setLocating(false);
      notify(`${reason} ${fallback()}`);
    };
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (ticket !== epoch.current.value) return;
        const { latitude, longitude } = position.coords;
        if (!validCoordinates(latitude, longitude)) {
          failed("Koordinat GPS tidak valid.");
          return;
        }
        epoch.current.lastValid = true;
        setOrigin([latitude, longitude]);
        setLocation("Lokasi kamu");
        setLocating(false);
        setRecenterKey((key) => key + 1);
      },
      (error) =>
        failed(
          error.code === 1
            ? "Izin lokasi ditolak."
            : error.code === 3
              ? "Pencarian lokasi melewati batas waktu."
              : "Lokasi tidak tersedia.",
        ),
      { timeout: 10000, maximumAge: 0 },
    );
  }
  return { origin, location, locating, recenterKey, locate };
}
