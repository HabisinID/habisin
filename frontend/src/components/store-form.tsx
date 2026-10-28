"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { Check, MapPin, Search, Plus, Trash2 } from "lucide-react";
import { api, type GeocodeResult, type Store } from "@/lib/api";

import { storeSchedule, weekdays } from "@/lib/store-profile";
import s from "./role-workspace.module.css";

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
  onDirtyChange,
}: {
  store: Store | null;
  onSaved: (store: Store) => void;
  onCancel: () => void;
  onDirtyChange?: (dirty: boolean) => void;
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
  const [confirmed, setConfirmed] = useState(!!store);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [searchError, setSearchError] = useState("");
  const revision = useRef(0);
  const locationReady = Boolean(
    point && normalize(address) === normalize(geocodedAddress),
  );

  const [fields, setFields] = useState(() => ({
    name: store?.name || "",
    description: store?.description || "",
    category: store?.category || "",
    neighborhood: store?.neighborhood || "",
    city: store?.city ?? "Depok",
    landmark: store?.landmark || "",
    opening_time: store?.opening_time.slice(0, 5) || "08:00",
    closing_time: store?.closing_time.slice(0, 5) || "21:00",
  }));
  const [hours, setHours] = useState(() => storeSchedule(store));
  const initial = useRef(JSON.stringify({ fields, address, point, hours }));
  const dirty =
    JSON.stringify({ fields, address, point, hours }) !== initial.current;
  const initialFields = useRef(fields);
  const changed =
    Object.entries(fields).filter(
      ([key, value]) =>
        value !== initialFields.current[key as keyof typeof fields],
    ).length +
    Number(address !== (store?.address || "")) +
    Number(JSON.stringify(hours) !== JSON.stringify(storeSchedule(store))) +
    Number(
      point?.latitude !== store?.latitude ||
        point?.longitude !== store?.longitude,
    );
  useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  function update<K extends keyof typeof fields>(key: K, value: string) {
    setFields((current) => ({ ...current, [key]: value }));
  }
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

    setSaving(true);
    setError("");
    try {
      const saved = await api<Store>(
        store ? `partner/stores/${store.id}` : "partner/stores",
        store ? "PATCH" : "POST",
        {
          ...fields,
          weekly_hours: hours,
          address: normalize(address),
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
    <form
      onSubmit={save}
      className={s.form}
      aria-label={store ? "Ubah profil toko" : "Daftarkan toko"}
    >
      {error && (
        <p role="alert" className={s.error}>
          {error}
        </p>
      )}
      <nav className={s.formSections} aria-label="Bagian profil toko">
        <a href="#store-identity">Identitas</a>
        <a href="#store-location">Lokasi</a>
        <a href="#store-hours">Jam buka</a>
      </nav>
      <div className={s.grid}>
        <fieldset disabled={saving} className={s.form}>
          <section id="store-identity" aria-label="Identitas toko">
            <h2>A · Identitas toko</h2>
            <label className={s.label}>
              Nama toko
              <input
                aria-label="Nama toko"
                className={s.field}
                value={fields.name}
                onChange={(e) => update("name", e.target.value)}
                required
                maxLength={Math.max(60, store?.name.length || 0)}
                autoComplete="organization"
              />
              <small>
                Tampil di peta dan tiket pembeli · {fields.name.length}/60
              </small>
            </label>
            <label className={s.label}>
              Deskripsi toko
              <textarea
                className={s.field}
                value={fields.description}
                onChange={(e) => update("description", e.target.value)}
                required
                maxLength={Math.max(280, store?.description.length || 0)}
                rows={4}
              />
              <small>
                Dibaca pembeli sebelum memesan · {fields.description.length}/280
              </small>
            </label>
            <fieldset>
              <legend className="mb-2 font-semibold text-sm">
                Kategori toko
              </legend>
              <div className={s.filters}>
                {[
                  "Roti & kue",
                  "Nasi & lauk",
                  "Minuman",
                  "Camilan",
                  "Katering",
                  "Lainnya",
                ].map((category) => (
                  <label key={category} className={s.pill}>
                    <input
                      type="radio"
                      name="store_category"
                      className="mr-2 accent-brand"
                      value={category}
                      checked={fields.category === category}
                      onChange={() => update("category", category)}
                      required
                    />
                    {category}
                  </label>
                ))}
              </div>
            </fieldset>
          </section>
          <section id="store-location" aria-label="Alamat dan lokasi toko">
            <h2>B · Alamat &amp; lokasi</h2>
            <p className={s.muted}>
              Alamat dipakai pembeli untuk rute; pin peta dipakai untuk jarak
              pencarian. Perubahan lokasi langsung berlaku setelah geocoding dan
              konfirmasi, selama tidak dikunci pesanan aktif.
            </p>
            <label className={s.label} htmlFor="store-address">
              Alamat lengkap
              <textarea
                aria-label="Alamat lengkap"
                id="store-address"
                className={s.field}
                value={address}
                onChange={(e) => changeAddress(e.target.value)}
                required
                minLength={5}
                maxLength={250}
                autoComplete="street-address"
                rows={3}
              />
            </label>
            <div className={s.two}>
              <label className={s.label}>
                Kelurahan
                <input
                  className={s.field}
                  value={fields.neighborhood}
                  onChange={(e) => update("neighborhood", e.target.value)}
                  maxLength={120}
                />
              </label>
              <label className={s.label}>
                Kota
                <input
                  className={s.field}
                  value={fields.city}
                  onChange={(e) => update("city", e.target.value)}
                  maxLength={80}
                />
              </label>
            </div>
            <label className={s.label}>
              Patokan (opsional)
              <input
                className={s.field}
                value={fields.landmark}
                onChange={(e) => update("landmark", e.target.value)}
                maxLength={250}
              />
              <small>
                Tampil di profil dan tiket pembeli; tidak menggantikan alamat
                untuk geocoding.
              </small>
            </label>
            <button
              className={s.secondary}
              type="button"
              onClick={search}
              disabled={searching || normalize(address).length < 5}
            >
              <Search size={16} />
              {searching ? "Mencari alamat…" : "Cari lokasi toko"}
            </button>
            <p className={s.muted}>
              Alamat pencarian dikirim ke Nominatim (OpenStreetMap).
            </p>
            {searchError && (
              <p role="alert" className={s.error}>
                {searchError}
              </p>
            )}
            {searched && results.length === 0 && (
              <p role="status">
                Alamat belum ditemukan. Tambahkan nama jalan, kota, atau kode
                pos.
              </p>
            )}
            {results.length > 0 && (
              <fieldset>
                <legend className="mb-3 font-semibold">
                  Pilih hasil yang sesuai
                </legend>
                {results.map((result, index) => (
                  <label
                    key={`${result.latitude}-${result.longitude}-${index}`}
                    className={`${s.row} mb-3`}
                  >
                    <input
                      type="radio"
                      name="geocode_result"
                      checked={
                        point?.latitude === result.latitude &&
                        point?.longitude === result.longitude
                      }
                      onChange={() => movePoint(result)}
                    />
                    {result.display_name}
                  </label>
                ))}
              </fieldset>
            )}
            {point && locationReady && (
              <div className={s.form} aria-label="Konfirmasi lokasi">
                <h3 className={s.title}>
                  <MapPin size={18} className="inline" /> Pastikan pin tepat di
                  tokomu
                </h3>
                <div className={s.two}>
                  {(["latitude", "longitude"] as const).map((key) => (
                    <label key={key} className={s.label}>
                      {key === "latitude" ? "Latitude" : "Longitude"}
                      <input
                        className={s.field}
                        type="number"
                        step="any"
                        value={coordinates[key]}
                        onChange={(e) => editCoordinate(key, e.target.value)}
                        min={key === "latitude" ? -90 : -180}
                        max={key === "latitude" ? 90 : 180}
                        required
                      />
                    </label>
                  ))}
                </div>
                <label className={s.row}>
                  <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={(e) => setConfirmed(e.target.checked)}
                    required
                  />
                  Saya sudah memastikan pin berada di lokasi toko yang benar.
                </label>
                <p className={s.muted}>
                  Konfirmasi lokasi oleh mitra; peninjauan admin belum tersedia.
                </p>
              </div>
            )}
          </section>
          <section id="store-hours" aria-label="Jam buka toko">
            <h2>C · Jam buka per hari</h2>
            <p className={s.muted}>
              Waktu WIB. Jam tutup lebih awal berarti hari berikutnya. Maksimal
              tiga sesi per hari.
            </p>
            {hours.map((day, index) => (
              <div key={day.day} className={s.schedule}>
                <label className="font-semibold">
                  <input
                    type="checkbox"
                    className="mr-2 accent-brand"
                    checked={day.enabled}
                    aria-label={`Buka pada ${weekdays[day.day]}`}
                    onChange={(e) =>
                      setHours((current) =>
                        current.map((row) =>
                          row.day === day.day
                            ? {
                                ...row,
                                enabled: e.target.checked,
                                sessions: row.sessions.length
                                  ? row.sessions
                                  : [{ start: "08:00", end: "21:00" }],
                              }
                            : row,
                        ),
                      )
                    }
                  />
                  {weekdays[day.day]}
                </label>
                <div className="space-y-2">
                  {day.enabled ? (
                    day.sessions.map((session, n) => (
                      <div className={s.row} key={n}>
                        <input
                          type="time"
                          className={s.field}
                          value={session.start}
                          aria-label={`Jam buka ${weekdays[day.day]} sesi ${n + 1}`}
                          onChange={(e) =>
                            setHours((current) =>
                              current.map((row) =>
                                row.day === day.day
                                  ? {
                                      ...row,
                                      sessions: row.sessions.map((v, j) =>
                                        j === n
                                          ? { ...v, start: e.target.value }
                                          : v,
                                      ),
                                    }
                                  : row,
                              ),
                            )
                          }
                          required
                        />
                        <span>–</span>
                        <input
                          type="time"
                          className={s.field}
                          value={session.end}
                          aria-label={`Jam tutup ${weekdays[day.day]} sesi ${n + 1}`}
                          onChange={(e) =>
                            setHours((current) =>
                              current.map((row) =>
                                row.day === day.day
                                  ? {
                                      ...row,
                                      sessions: row.sessions.map((v, j) =>
                                        j === n
                                          ? { ...v, end: e.target.value }
                                          : v,
                                      ),
                                    }
                                  : row,
                              ),
                            )
                          }
                          required
                        />
                        {day.sessions.length > 1 && (
                          <button
                            type="button"
                            className={s.danger}
                            aria-label={`Hapus sesi ${n + 1} ${weekdays[day.day]}`}
                            onClick={() =>
                              setHours((current) =>
                                current.map((row) =>
                                  row.day === day.day
                                    ? {
                                        ...row,
                                        sessions: row.sessions.filter(
                                          (_, j) => j !== n,
                                        ),
                                      }
                                    : row,
                                ),
                              )
                            }
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    ))
                  ) : (
                    <span className={s.muted}>Tutup</span>
                  )}
                  {day.enabled && (
                    <button
                      className="text-xs font-semibold text-brand py-2"
                      type="button"
                      disabled={day.sessions.length >= 3}
                      onClick={() =>
                        setHours((current) =>
                          current.map((row) =>
                            row.day === day.day
                              ? {
                                  ...row,
                                  sessions: [
                                    ...row.sessions,
                                    { start: "13:00", end: "21:00" },
                                  ],
                                }
                              : row,
                          ),
                        )
                      }
                    >
                      <Plus size={13} className="inline" />
                      Tambah sesi
                    </button>
                  )}
                  {index === 0 && (
                    <button
                      type="button"
                      className="text-xs font-semibold text-brand p-2"
                      onClick={() =>
                        setHours((current) =>
                          current.map((row) => ({
                            ...row,
                            enabled: day.enabled,
                            sessions: structuredClone(day.sessions),
                          })),
                        )
                      }
                    >
                      Salin ke semua hari
                    </button>
                  )}
                </div>
              </div>
            ))}
          </section>
        </fieldset>
        <aside className={s.preview} aria-label="Pratinjau profil toko">
          {point ? (
            <StoreMap
              latitude={point.latitude}
              longitude={point.longitude}
              onChange={(next) => {
                if (!saving) movePoint(next);
              }}
            />
          ) : (
            <div className={`${s.empty} min-h-64`}>
              <MapPin size={30} />
              <p>Cari alamat untuk menampilkan pin.</p>
            </div>
          )}
          <p className={`${s.muted} mt-3`}>
            {point
              ? `${point.latitude.toFixed(6)}, ${point.longitude.toFixed(6)} · ${confirmed ? "dikonfirmasi mitra" : "perlu konfirmasi"}`
              : "Lokasi belum dipilih"}
          </p>
          <div className={`${s.card} mt-6`}>
            <p className="font-mono text-xs text-muted mb-4">
              PRATINJAU UNTUK PEMBELI
            </p>
            <h3 className={s.title}>{fields.name || "Nama toko"}</h3>
            <p className={s.muted}>
              {fields.category || "Kategori toko"} · {address || "Alamat toko"}
            </p>
            {fields.landmark && (
              <p className={s.muted}>Patokan: {fields.landmark}</p>
            )}
            <p className="mt-3 text-sm text-brand">
              Jadwal mengikuti hari yang dipilih.
            </p>
          </div>
        </aside>
      </div>
      {(dirty || !store) && (
        <div className={s.saveBar}>
          <p className={s.muted}>
            {store
              ? `${Math.max(1, changed)} perubahan belum disimpan`
              : "Lengkapi identitas dan konfirmasi pin toko."}
          </p>
          <div className={s.actions}>
            <button
              type="button"
              className={s.secondary}
              onClick={onCancel}
              disabled={saving}
            >
              Batalkan
            </button>
            <button
              className={s.primary}
              disabled={saving || searching || !locationReady || !confirmed}
            >
              <Check size={16} />
              {saving
                ? "Menyimpan…"
                : store
                  ? "Simpan perubahan toko"
                  : "Daftarkan toko"}
            </button>
          </div>
        </div>
      )}
    </form>
  );
}
