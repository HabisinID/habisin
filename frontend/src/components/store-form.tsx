"use client";

import dynamic from "next/dynamic";
import { useRef, useState } from "react";
import { Check, MapPin, Search } from "lucide-react";
import { api, type GeocodeResult, type Store } from "@/lib/api";
import {
  errorClass,
  fieldClass,
  primaryButton,
  secondaryButton,
} from "./store-ui";

const StoreMap = dynamic(() => import("./store-map"), {
  ssr: false,
  loading: () => (
    <div
      className="grid h-72 place-items-center rounded-xl bg-light"
      role="status"
    >
      Memuat peta…
    </div>
  ),
});
const normalize = (value: string) => value.trim().replace(/\s+/g, " ");

type Location = { latitude: number; longitude: number };

export default function StoreForm({
  store,
  onSaved,
  onCancel,
}: {
  store: Store | null;
  onSaved: (store: Store) => void;
  onCancel: () => void;
}) {
  const [address, setAddress] = useState(store?.address ?? "");
  const [point, setPoint] = useState<Location | null>(
    store ? { latitude: store.latitude, longitude: store.longitude } : null,
  );
  const [coordinates, setCoordinates] = useState({
    latitude: store ? String(store.latitude) : "",
    longitude: store ? String(store.longitude) : "",
  });
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [token, setToken] = useState<string | null>(null);
  const [geocodedAddress, setGeocodedAddress] = useState(store?.address ?? "");
  const [confirmed, setConfirmed] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [searchError, setSearchError] = useState("");
  const revision = useRef(0);
  const locationReady = Boolean(
    point && normalize(address) === normalize(geocodedAddress),
  );

  function changeAddress(value: string) {
    revision.current += 1;
    setAddress(value);
    setPoint(null);
    setResults([]);
    setToken(null);
    setConfirmed(false);
    setGeocodedAddress("");
    setSearchError("");
    setSearched(false);
    setSearching(false);
  }
  async function search() {
    const query = normalize(address);
    const current = ++revision.current;
    setSearching(true);
    setSearchError("");
    setResults([]);
    setPoint(null);
    setToken(null);
    setConfirmed(false);
    setSearched(false);
    try {
      const data = await api<{
        results: GeocodeResult[];
        geocode_token: string | null;
      }>("partner/geocode", "POST", { address: query });
      if (current !== revision.current) return;
      setResults(data.results);
      setToken(data.geocode_token);
      setGeocodedAddress(query);
      setSearched(true);
      if (data.results.length === 1) movePoint(data.results[0]);
    } catch (e) {
      if (current === revision.current) setSearchError((e as Error).message);
    } finally {
      if (current === revision.current) setSearching(false);
    }
  }
  function movePoint(next: Location) {
    setPoint({ latitude: next.latitude, longitude: next.longitude });
    setCoordinates({
      latitude: String(next.latitude),
      longitude: String(next.longitude),
    });
    setConfirmed(false);
  }
  function editCoordinate(field: keyof Location, value: string) {
    setCoordinates((current) => ({ ...current, [field]: value }));
    setConfirmed(false);
    const number = Number(value);
    const limit = field === "latitude" ? 90 : 180;
    if (
      point &&
      value.trim() &&
      Number.isFinite(number) &&
      Math.abs(number) <= limit
    ) {
      setPoint({ ...point, [field]: number });
    }
  }
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!point || !locationReady || !confirmed) {
      setError("Cari alamat dan konfirmasi posisi pin toko terlebih dahulu.");
      return;
    }
    const data = Object.fromEntries(new FormData(event.currentTarget));
    setSaving(true);
    setError("");
    try {
      const saved = await api<Store>(
        store ? `partner/stores/${store.id}` : "partner/stores",
        store ? "PATCH" : "POST",
        {
          name: data.name,
          description: data.description,
          address: normalize(address),
          opening_time: data.opening_time,
          closing_time: data.closing_time,
          ...point,
          location_confirmed: confirmed,
          ...(token ? { geocode_token: token } : {}),
        },
      );
      onSaved(saved);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="space-y-7">
      <div>
        <p className="mb-2 text-xs font-bold tracking-widest text-brand">
          MITRA HABISIN
        </p>
        <h1 className="text-3xl font-bold tracking-tight">
          {store ? "Edit data toko" : "Kenalkan toko kamu."}
        </h1>
        <p className="mt-3 leading-relaxed text-muted">
          Bantu tetangga menemukan tokomu. Isi profil, cari alamat, lalu
          pastikan posisi pin sudah tepat.
        </p>
      </div>
      <fieldset disabled={saving} className="space-y-5 disabled:opacity-70">
        <label className="block space-y-2 font-semibold">
          Nama toko
          <input
            className={fieldClass}
            name="name"
            defaultValue={store?.name}
            required
            maxLength={120}
            autoComplete="organization"
          />
        </label>
        <label className="block space-y-2 font-semibold">
          Deskripsi toko
          <textarea
            className={`${fieldClass} min-h-28 resize-y font-normal`}
            name="description"
            defaultValue={store?.description}
            required
            maxLength={2000}
            placeholder="Ceritakan makanan dan hal istimewa dari tokomu."
          />
        </label>
        <div className="grid grid-cols-2 gap-4 mobile:grid-cols-1">
          <label className="block space-y-2 font-semibold">
            Jam buka (WIB)
            <input
              className={fieldClass}
              type="time"
              name="opening_time"
              defaultValue={store?.opening_time.slice(0, 5) ?? "08:00"}
              required
            />
          </label>
          <label className="block space-y-2 font-semibold">
            Jam tutup (WIB)
            <input
              className={fieldClass}
              type="time"
              name="closing_time"
              defaultValue={store?.closing_time.slice(0, 5) ?? "21:00"}
              required
            />
          </label>
        </div>
        <p className="text-xs leading-relaxed text-muted">
          Berlaku setiap hari. Jam tutup yang lebih awal dari jam buka berarti
          tutup pada hari berikutnya.
        </p>
        <div className="rounded-xl border border-line bg-cream p-5 mobile:p-4">
          <label htmlFor="store-address" className="mb-2 block font-semibold">
            Alamat toko
          </label>
          <textarea
            id="store-address"
            className={`${fieldClass} min-h-24 resize-y`}
            value={address}
            onChange={(e) => changeAddress(e.target.value)}
            required
            minLength={5}
            maxLength={250}
            autoComplete="street-address"
            placeholder="Jalan, nomor, kelurahan, kota, dan kode pos"
          />
          <p className="my-3 text-xs leading-relaxed text-muted">
            Gunakan alamat usaha yang dapat dilihat publik. Saat kamu mencari,
            alamat dikirim ke Nominatim (OpenStreetMap).
          </p>
          <button
            className={secondaryButton}
            type="button"
            onClick={search}
            disabled={searching || normalize(address).length < 5}
          >
            <Search size={16} />
            {searching ? "Mencari alamat…" : "Cari alamat di peta"}
          </button>
          {searchError && (
            <p role="alert" className={`${errorClass} mt-3`}>
              {searchError}
            </p>
          )}
          {searched && results.length === 0 && (
            <p role="status" className="mt-3 text-sm text-muted">
              Alamat belum ditemukan. Tambahkan nama jalan, kota, atau kode pos
              lalu cari lagi.
            </p>
          )}
          {results.length > 0 && (
            <fieldset className="mt-4 space-y-2">
              <legend className="mb-2 font-semibold">
                Pilih hasil yang sesuai
              </legend>
              {results.map((result, index) => (
                <label
                  key={`${result.latitude}-${result.longitude}-${index}`}
                  className="flex cursor-pointer items-start gap-3 rounded-lg border border-line bg-surface p-3 text-sm leading-relaxed"
                >
                  <input
                    className="mt-1 shrink-0 accent-brand"
                    type="radio"
                    name="geocode_result"
                    checked={
                      point?.latitude === result.latitude &&
                      point?.longitude === result.longitude
                    }
                    onChange={() => movePoint(result)}
                  />
                  <span>{result.display_name}</span>
                </label>
              ))}
            </fieldset>
          )}
          <p className="mt-3 text-xs text-muted">
            Pencarian alamat ©{" "}
            <a
              href="https://www.openstreetmap.org/copyright"
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              OpenStreetMap contributors
            </a>
          </p>
        </div>
        {point && locationReady && (
          <section className="space-y-4" aria-label="Konfirmasi lokasi">
            <h2 className="flex items-center gap-2 text-lg font-bold">
              <MapPin size={20} className="text-brand" />
              Pastikan pin tepat di tokomu
            </h2>
            <p className="text-sm leading-relaxed text-muted">
              Geser pin atau klik peta untuk menyesuaikan posisi. Kamu juga
              dapat mengisi koordinat di bawah ini.
            </p>
            <StoreMap
              latitude={point.latitude}
              longitude={point.longitude}
              onChange={(next) => {
                if (!saving) movePoint(next);
              }}
            />
            <div className="grid grid-cols-2 gap-4 mobile:grid-cols-1">
              <label className="block space-y-2 text-sm font-semibold">
                Latitude
                <input
                  className={fieldClass}
                  type="number"
                  min={-90}
                  max={90}
                  step="any"
                  required
                  value={coordinates.latitude}
                  onChange={(e) => editCoordinate("latitude", e.target.value)}
                />
              </label>
              <label className="block space-y-2 text-sm font-semibold">
                Longitude
                <input
                  className={fieldClass}
                  type="number"
                  min={-180}
                  max={180}
                  step="any"
                  required
                  value={coordinates.longitude}
                  onChange={(e) => editCoordinate("longitude", e.target.value)}
                />
              </label>
            </div>
            <label className="flex cursor-pointer items-start gap-3 rounded-lg bg-light p-4 text-sm leading-relaxed">
              <input
                type="checkbox"
                className="mt-1 shrink-0 accent-brand"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                required
              />
              Saya sudah memastikan pin berada di lokasi toko yang benar.
            </label>
          </section>
        )}
        {error && (
          <p className={errorClass} role="alert">
            {error}
          </p>
        )}
        <div className="flex flex-wrap gap-3 border-t border-line pt-5">
          <button
            className={primaryButton}
            disabled={saving || searching || !locationReady || !confirmed}
          >
            <Check size={17} />
            {saving
              ? "Menyimpan…"
              : store
                ? "Simpan perubahan toko"
                : "Daftarkan toko"}
          </button>
          <button
            type="button"
            className={secondaryButton}
            onClick={onCancel}
            disabled={saving}
          >
            Batal
          </button>
        </div>
      </fieldset>
    </form>
  );
}
