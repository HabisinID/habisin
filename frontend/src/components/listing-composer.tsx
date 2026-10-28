"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import SiteHeader from "./site-header";
import HabisinLogo from "./habisin-logo";
import {
  ArrowLeft,
  ChevronRight,
  Copy,
  Minus,
  Plus,
  Timer,
  Check,
  AlertCircle,
  ShieldCheck,
  LayoutDashboard,
  List,
  ShoppingBag,
  Store as StoreIcon,
  UserRound,
} from "lucide-react";
import {
  api,
  ApiError,
  listingCategories,
  partnerListingApi,
  rupiah,
  pickup,
  type Listing,
  type ListingInput,
  type Store,
  type UploadProgress,
} from "@/lib/api";
import {
  draftKey,
  listingDrafts,
  newListingFields,
  wibDateTime,
  type ListingDraft,
  type ListingFields,
} from "@/lib/listing-draft";
import { pickupEndForStore, storeHoursLabel } from "@/lib/store-profile";
import { designFont } from "@/lib/design-font";
import { validCoordinates } from "@/lib/discovery";
import { useObjectUrl } from "@/hooks/use-object-url";
import ListingPhotoField, { type PhotoDraft } from "./listing-photo-field";
import ListingImage from "./listing-image";
import Modal from "./modal";
import styles from "./listing-composer.module.css";
const PreviewMap = dynamic(() => import("./listing-preview-map"), {
  ssr: false,
  loading: () => <p className={styles.mapPlaceholder}>Menyiapkan peta…</p>,
});
function Field({
  name,
  label,
  error,
  hint,
  children,
}: {
  name: string;
  label: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className={styles.field}>
      <label htmlFor={`listing-${name}`}>{label}</label>
      {children}
      {error ? (
        <small className={styles.error} id={`listing-${name}-error`}>
          {error}
        </small>
      ) : (
        hint && <small className={styles.hint}>{hint}</small>
      )}
    </div>
  );
}
export default function ListingComposer({
  item,
  items,
  initialCopyOpen = false,
  compact = false,
  userId,
  now,
  busy,
  setBusy,
  onSaved,
  onCancel,
  onView,
  onNew,
  onAccount,
}: {
  item: Listing | null;
  items: Listing[];
  initialCopyOpen?: boolean;
  compact?: boolean;
  userId: number;
  now: number;
  busy: boolean;
  setBusy: (v: boolean) => void;
  onSaved: (item: Listing) => void;
  onCancel: () => void;
  onView: (item: Listing) => void;
  onNew: () => void;
  onAccount: () => void;
}) {
  const [fields, setFields] = useState(() => newListingFields(item));
  const [photo, setPhoto] = useState<PhotoDraft>({
    mode: item?.image_source || "upload",
    url: item?.image_source === "upload" ? "" : item?.image || "",
    file: null,
    editing: false,
  });
  const [stores, setStores] = useState<Store[]>([]);
  const [storesLoading, setStoresLoading] = useState(true);
  const [storesError, setStoresError] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [attempted, setAttempted] = useState(false);
  const [copyOpen, setCopyOpen] = useState(initialCopyOpen);
  const [copying, setCopying] = useState<number | null>(null);
  const [copyError, setCopyError] = useState("");
  const [draft, setDraft] = useState<ListingDraft | null>(null);
  const [draftError, setDraftError] = useState("");
  const [draftMessage, setDraftMessage] = useState("");
  const [savingDraft, setSavingDraft] = useState(false);
  const [published, setPublished] = useState<Listing | null>(null);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const form = useRef<HTMLFormElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const requestInFlight = useRef(false);
  const success = useRef<Listing | null>(null);
  const alive = useRef(true);
  const copyAbort = useRef<AbortController | null>(null);
  const key = draftKey(userId, item?.id);
  const selectedStore = stores.find((s) => String(s.id) === fields.store_id);
  const locked = busy || !!published;
  const ticketLocked = !!item?.has_active_orders;
  const previewFile = useObjectUrl(photo.file);
  const previewImage =
    photo.mode === "url"
      ? photo.url
      : photo.file
        ? previewFile
        : item?.image_source === "upload"
          ? item.image
          : "";
  const hasPhoto =
    photo.mode === "url"
      ? !!photo.url.trim()
      : !!photo.file || item?.image_source === "upload";
  const pricesChanged =
    !item ||
    Number(fields.price) !== item.price ||
    Number(fields.original_price) !== item.original_price;
  const pricesValid =
    fields.free ||
    (Number.isInteger(Number(fields.price)) &&
      Number(fields.price) > 0 &&
      Number.isInteger(Number(fields.original_price)) &&
      Number(fields.original_price) > 0 &&
      (!pricesChanged || Number(fields.price) < Number(fields.original_price)));
  const saving =
    fields.price !== "" &&
    Number(fields.original_price) > 0 &&
    Number(fields.price) >= 0
      ? Math.max(
          0,
          Math.round(
            (1 - Number(fields.price) / Number(fields.original_price)) * 100,
          ),
        )
      : 0;
  const chosenPrice = fields.free ? 0 : Math.max(0, Number(fields.price) || 0);
  const previous = items
    .filter(
      (row) => row.id !== item?.id && !row.moderated_at && !row.deleted_at,
    )
    .sort((a, b) => b.id - a.id);
  useEffect(() => {
    alive.current = true;
    heading.current?.focus({ preventScroll: true });
    return () => {
      alive.current = false;
      copyAbort.current?.abort();
    };
  }, []);
  const loadStores = useCallback(
    (signal?: AbortSignal) =>
      api<{ stores: Store[] }>("partner/stores", "GET", undefined, signal)
        .then((data) => {
          if (!signal?.aborted) {
            setStores(data.stores);
            setStoresError("");
          }
        })
        .catch((e: Error) => {
          if (!signal?.aborted) setStoresError(e.message);
        })
        .finally(() => {
          if (!signal?.aborted) setStoresLoading(false);
        }),
    [],
  );
  useEffect(() => {
    const c = new AbortController();
    void loadStores(c.signal);
    return () => c.abort();
  }, [loadStores]);
  useEffect(() => {
    let active = true;
    void listingDrafts
      .load(key)
      .then((data) => {
        if (active) setDraft(data);
      })
      .catch((e: Error) => {
        if (active) setDraftError(e.message);
      });
    return () => {
      active = false;
    };
  }, [key]);
  function update<K extends keyof ListingFields>(
    name: K,
    value: ListingFields[K],
  ) {
    setFields((old) => {
      const store =
        name === "store_id" && !item
          ? stores.find((s) => String(s.id) === value)
          : undefined;
      return {
        ...old,
        [name]: value,
        ...(store ? { pickup_end: pickupEndForStore(store) } : {}),
      };
    });
    setErrors((old) => {
      const next = { ...old };
      delete next[name];
      return next;
    });
    setDraftMessage("");
  }
  function input(name: Exclude<keyof ListingFields, "free">) {
    return {
      id: `listing-${name}`,
      name,
      disabled:
        ticketLocked &&
        ["price", "store_id", "pickup_start", "pickup_end"].includes(name),
      value: fields[name],
      onChange: (
        e: React.ChangeEvent<
          HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
        >,
      ) => update(name, e.target.value),
      "aria-invalid": !!errors[name],
      "aria-describedby": errors[name] ? `listing-${name}-error` : undefined,
    };
  }
  function validation() {
    const e: Record<string, string> = {};
    if (!hasPhoto)
      e.image =
        photo.mode === "upload"
          ? "Pilih dan crop foto makanan sebelum menyimpan."
          : "URL foto makanan wajib diisi.";
    if (photo.mode === "url" && photo.url) {
      try {
        const u = new URL(photo.url);
        if (!["http:", "https:"].includes(u.protocol) || photo.url.length > 250)
          throw new Error();
      } catch {
        e.image = "URL foto harus HTTP/HTTPS dan maksimal 250 karakter.";
      }
    }
    if (!fields.name.trim())
      e.name = "Isi nama makanan, misalnya Nasi Ayam Geprek.";
    else if (fields.name.trim().length > 60 && fields.name !== item?.name)
      e.name = "Nama makanan maksimal 60 karakter.";
    if (!listingCategories.includes(fields.category))
      e.category = "Pilih kategori makanan.";
    if (!selectedStore) e.store_id = "Pilih toko yang menjual makanan ini.";
    else if (
      !selectedStore.is_open &&
      (!item || item.store_id !== selectedStore.id)
    )
      e.store_id = "Pilih toko yang aktif.";
    if (!fields.description.trim())
      e.description = "Deskripsi makanan wajib diisi.";
    if (!fields.free) {
      if (!Number.isInteger(Number(fields.price)) || Number(fields.price) < 1)
        e.price = "Isi harga sekarang lebih dari nol.";
      if (
        !Number.isInteger(Number(fields.original_price)) ||
        Number(fields.original_price) < 1
      )
        e.original_price = "Isi harga normal yang valid.";
      if (
        pricesChanged &&
        Number(fields.price) >= Number(fields.original_price) &&
        !e.price
      )
        e.price = "Harga sekarang harus lebih rendah dari harga normal.";
    }
    if (
      !Number.isInteger(Number(fields.stock)) ||
      !fields.stock ||
      Number(fields.stock) < (item ? 0 : 1) ||
      Number(fields.stock) > 2147483647
    )
      e.stock = `Isi jumlah porsi minimal ${item ? 0 : 1}.`;
    const start = Date.parse(`${fields.pickup_start}+07:00`),
      end = Date.parse(`${fields.pickup_end}+07:00`),
      prepared = Date.parse(`${fields.prepared_at}+07:00`);
    if (!Number.isFinite(start))
      e.pickup_start = "Isi waktu mulai pengambilan.";
    if (!Number.isFinite(end) || end <= start)
      e.pickup_end = "Batas ambil harus setelah waktu mulai.";
    const timesChanged =
      !item ||
      fields.pickup_start !== wibDateTime(item.pickup_start) ||
      fields.pickup_end !== wibDateTime(item.pickup_end);
    if (timesChanged && end <= Date.now())
      e.pickup_end = "Batas pengambilan harus di masa depan.";
    if (!Number.isFinite(prepared)) e.prepared_at = "Isi waktu makanan dibuat.";
    else if (prepared > Date.now() || prepared > end)
      e.prepared_at =
        "Waktu dibuat tidak boleh di masa depan atau setelah batas ambil.";
    for (const name of ["packaging", "storage_notes", "allergens"] as const)
      if (fields[name].length > 500) e[name] = "Maksimal 500 karakter.";
    if (fields.buyer_notes.length > 140)
      e.buyer_notes = "Catatan maksimal 140 karakter.";
    return e;
  }
  function reveal(e: Record<string, string>) {
    setErrors(e);
    setAttempted(true);
    const first = Object.keys(e)[0];
    requestAnimationFrame(() => {
      const target =
        first === "image"
          ? form.current?.querySelector<HTMLElement>(
              '[data-photo-trigger],button[class*="photoEmpty"],button[class*="photoChange"],#listing-image',
            )
          : first === "category"
            ? form.current?.querySelector<HTMLElement>('[role="radio"]')
            : document.getElementById(
                first === "pickup_end"
                  ? "listing-pickup-end-time"
                  : `listing-${first}`,
              );
      target?.focus();
    });
  }
  async function saveDraft() {
    if (locked || savingDraft || photo.editing) return;
    setSavingDraft(true);
    setDraftError("");
    try {
      const saved: ListingDraft = {
        version: 1,
        fields,
        photo: { mode: photo.mode, url: photo.url, file: photo.file },
        savedAt: new Date().toISOString(),
      };
      await listingDrafts.save(key, saved);
      if (!alive.current) return;
      setDraft(saved);
      setDraftMessage(
        `Draf tersimpan lokal di browser · ${pickup(saved.savedAt)} WIB.`,
      );
    } catch (e) {
      if (alive.current) setDraftError((e as Error).message);
    } finally {
      if (alive.current) setSavingDraft(false);
    }
  }
  function restoreDraft() {
    if (!draft) return;
    const defaults = newListingFields(item);
    setFields({ ...defaults, ...draft.fields });
    setPhoto({ ...draft.photo, editing: false });
    setErrors({});
    setError("");
    setDraftMessage(
      "Draf lokal dipulihkan. Periksa kembali toko dan waktu sebelum tayang.",
    );
    setDraft(null);
  }
  async function copyListing(source: Listing) {
    if (copying !== null) return;
    const controller = new AbortController();
    copyAbort.current = controller;
    setCopying(source.id);
    setCopyError("");
    try {
      let file: File | null = null;
      if (source.image_source === "upload") {
        const response = await fetch(source.image, {
          credentials: "same-origin",
          signal: controller.signal,
        });
        if (!response.ok)
          throw new Error(
            "Foto sumber belum dapat disalin. Coba lagi; isian saat ini tetap ada.",
          );
        const blob = await response.blob();
        file = new File([blob], "salinan-listing.jpg", {
          type: blob.type || "image/jpeg",
        });
      }
      if (!alive.current || controller.signal.aborted) return;
      const today = wibDateTime(new Date().toISOString());
      const next = newListingFields(source);
      next.pickup_start = today;
      next.pickup_end = `${today.slice(0, 10)}T${wibDateTime(source.pickup_end).slice(11)}`;
      next.prepared_at = "";
      next.store_id = stores.some((s) => s.id === source.store_id && s.is_open)
        ? String(source.store_id)
        : "";
      setFields(next);
      setPhoto({
        mode: source.image_source || "url",
        url: source.image_source === "upload" ? "" : source.image,
        file,
        editing: false,
      });
      setCopyOpen(false);
      setErrors({});
      setError("");
      setDraftMessage(
        "Listing disalin ke isian baru. Isi waktu dibuat dan periksa jam ambil hari ini.",
      );
    } catch (e) {
      if (!controller.signal.aborted && alive.current)
        setCopyError((e as Error).message);
    } finally {
      if (alive.current) setCopying(null);
    }
  }
  async function submit(event?: React.FormEvent) {
    event?.preventDefault();
    if (
      locked ||
      success.current ||
      requestInFlight.current ||
      photo.editing ||
      storesLoading ||
      storesError
    )
      return;
    const invalid = validation();
    if (Object.keys(invalid).length) {
      reveal(invalid);
      return;
    }
    requestInFlight.current = true;
    setBusy(true);
    setError("");
    setErrors({});
    setProgress(null);
    const payload: ListingInput = {
      name: fields.name.trim(),
      category: fields.category,
      description: fields.description.trim(),
      store_id: Number(fields.store_id),
      price: fields.free ? 0 : Number(fields.price),
      original_price: fields.free
        ? Number(fields.original_price) || item?.original_price || 0
        : Number(fields.original_price),
      stock: Number(fields.stock),
      prepared_at: new Date(`${fields.prepared_at}+07:00`).toISOString(),
      pickup_start: new Date(`${fields.pickup_start}+07:00`).toISOString(),
      pickup_end: new Date(`${fields.pickup_end}+07:00`).toISOString(),
      packaging: fields.packaging.trim(),
      storage_notes: fields.storage_notes.trim(),
      allergens: fields.allergens.trim(),
      buyer_notes: fields.buyer_notes.trim(),
    };
    if (photo.mode === "upload" && photo.file)
      Object.assign(payload, {
        image_file: photo.file,
        image_source: "upload",
      });
    if (
      photo.mode === "url" &&
      (!item || item.image_source !== "url" || photo.url.trim() !== item.image)
    )
      Object.assign(payload, { image: photo.url.trim(), image_source: "url" });
    try {
      const changes = item
        ? Object.fromEntries(
            Object.entries(payload).filter(([k, v]) => {
              if (
                k === "prepared_at" ||
                k === "pickup_start" ||
                k === "pickup_end"
              )
                return !item[k] || fields[k] !== wibDateTime(item[k]);
              return !(k in item) || v !== item[k as keyof Listing];
            }),
          )
        : payload;
      const result = item
        ? await partnerListingApi.update(item.id, changes, setProgress)
        : await partnerListingApi.create(payload, setProgress);
      success.current = result;
      setPublished(result);
      onSaved(result);
      try {
        await listingDrafts.remove(key);
        setDraft(null);
        setDraftMessage("");
      } catch {
        setDraftError(
          "Listing sudah tayang, tetapi draf lokal belum dapat dibersihkan. Jangan tayangkan ulang; hapus draf lokal saat tersedia.",
        );
      }
    } catch (e) {
      setError((e as Error).message);
      if (e instanceof ApiError) {
        const perField = Object.fromEntries(
          Object.entries(e.details)
            .filter(([k]) => k !== "detail")
            .map(([k, v]) => [k, Array.isArray(v) ? v.join(" ") : String(v)]),
        );
        if (Object.keys(perField).length) reveal(perField);
      }
    } finally {
      // Busy belongs to the inventory parent, which remains mounted after edit.
      setBusy(false);
      if (alive.current) setProgress(null);
      requestInFlight.current = false;
    }
  }
  const checks: [string, boolean][] = [
    ["Foto makanan", hasPhoto],
    [
      "Nama makanan",
      !!fields.name.trim() &&
        (fields.name.length <= 60 || fields.name === item?.name),
    ],
    ["Kategori", listingCategories.includes(fields.category)],
    ["Harga sekarang", pricesValid],
    [
      "Jumlah porsi",
      !!fields.stock &&
        Number.isInteger(Number(fields.stock)) &&
        Number(fields.stock) >= (item ? 0 : 1) &&
        Number(fields.stock) <= 2147483647,
    ],
    [
      "Ambil sebelum",
      !!fields.pickup_end &&
        Date.parse(`${fields.pickup_end}+07:00`) > now &&
        Date.parse(`${fields.pickup_end}+07:00`) >
          Date.parse(`${fields.pickup_start}+07:00`),
    ],
    [
      "Toko & informasi makanan",
      !!selectedStore &&
        (selectedStore.is_open || selectedStore.id === item?.store_id) &&
        !!fields.description.trim() &&
        !!fields.prepared_at &&
        Date.parse(`${fields.prepared_at}+07:00`) <= now &&
        Date.parse(`${fields.prepared_at}+07:00`) <=
          Date.parse(`${fields.pickup_end}+07:00`),
    ],
  ];
  const ready = checks.filter(([, v]) => v).length;
  const bodyPrices = (
    <div className={styles.prices}>
      {(
        [
          ["original_price", "Harga normal"],
          ["price", "Harga sekarang"],
        ] as const
      ).map(([name, label]) => (
        <Field key={name} name={name} label={label} error={errors[name]}>
          <div
            className={`${styles.money} ${errors[name] ? styles.invalid : ""}`}
          >
            <span>Rp</span>
            <input
              {...input(name)}
              aria-label={`${label} (Rp)`}
              type="number"
              min={name === "price" ? 1 : 0}
              step={1}
            />
          </div>
        </Field>
      ))}
      <p className={styles.saving}>
        {saving > 0
          ? `Hemat ${saving}% · tampil di kartu sebagai ${rupiah(chosenPrice)} ${rupiah(Number(fields.original_price) || 0)}`
          : "Harga sekarang harus lebih rendah dari harga normal."}
      </p>
    </div>
  );
  const copyButton = (
    <>
      <Copy size={20} />
      <span>
        <strong>Salin dari listing kemarin</strong>
        <small>
          {previous[0]
            ? `${previous[0].name} · ${rupiah(previous[0].price)} · ${previous[0].stock} porsi · ${pickup(previous[0].pickup_end)}`
            : "Pilih listing sebelumnya milik Anda"}
        </small>
      </span>
      <ChevronRight size={20} />
    </>
  );
  return (
    <div
      className={`${styles.shell} ${compact ? styles.compact : ""} ${designFont.className}`}
    >
      <aside className={styles.sidebar} aria-label="Navigasi mitra">
        <HabisinLogo />
        <a
          className={`${styles.navItem} ${styles.verify}`}
          href="/api/partner/kasir"
        >
          <ShieldCheck size={20} />
          Verifikasi kode
        </a>
        <button className={styles.navItem} disabled={busy} onClick={onCancel}>
          <LayoutDashboard size={18} />
          Dasbor
        </button>
        <button
          className={styles.navItem}
          aria-current="page"
          disabled={busy}
          onClick={onCancel}
        >
          <List size={18} />
          Listing<strong>{items.length}</strong>
        </button>
        <button className={styles.navItem} disabled>
          <ShoppingBag size={18} />
          Pesanan<small>Belum tersedia</small>
        </button>
        <Link
          className={styles.navItem}
          href="/partner/store"
          target="_blank"
          rel="noopener noreferrer"
        >
          <StoreIcon size={18} />
          Profil toko
        </Link>
        <button className={styles.navItem} disabled={busy} onClick={onAccount}>
          <UserRound size={18} />
          Akun
        </button>
      </aside>
      <div className={styles.workspace}>
        <SiteHeader nav={[]} className={styles.mobileHeader}>
          <button
            className={styles.back}
            type="button"
            aria-label="Kembali ke listing"
            onClick={onCancel}
            disabled={busy}
          >
            <ArrowLeft size={24} />
          </button>
          <h1 ref={heading} tabIndex={-1}>
            {item ? "Ubah listing" : "Tambah listing"}
          </h1>
          <button
            type="button"
            className={styles.save}
            onClick={saveDraft}
            disabled={locked || savingDraft || photo.editing}
          >
            {savingDraft ? "Menyimpan…" : "Simpan draf"}
          </button>
        </SiteHeader>
        <SiteHeader nav={[]} className={styles.desktopHeader}>
          <div>
            <button
              className={styles.breadcrumb}
              aria-label="Kembali ke listing"
              onClick={onCancel}
              disabled={busy}
            >
              Listing / {item ? "Ubah listing" : "Tambah listing"}
            </button>
            <h1>{item ? "Ubah listing" : "Tambah listing"}</h1>
            <p>
              Kolom bertanda * wajib diisi.
              {selectedStore
                ? ` ${selectedStore.name} · ${selectedStore.address}`
                : " Pilih toko penjual pada detail tambahan."}
            </p>
          </div>
          {!item && (
            <button
              className={styles.secondary}
              onClick={() => setCopyOpen(true)}
              disabled={locked}
            >
              <Copy size={20} />
              Salin dari listing kemarin
            </button>
          )}
        </SiteHeader>
        <div className={styles.body}>
          <form className={styles.form} ref={form} onSubmit={submit} noValidate>
            <div className={styles.scroll}>
              {!item && (
                <button
                  className={styles.copyMobile}
                  type="button"
                  onClick={() => setCopyOpen(true)}
                  disabled={locked}
                >
                  {copyButton}
                </button>
              )}
              {(draft || draftError || draftMessage) && (
                <div className={styles.draftBanner} role="status">
                  {draftMessage ||
                    draftError ||
                    `Ada draf lokal dari ${new Date(draft!.savedAt).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })} WIB.`}
                  {draft && !draftMessage && (
                    <div>
                      <button
                        type="button"
                        className={styles.textButton}
                        onClick={restoreDraft}
                        disabled={locked}
                      >
                        Pulihkan draf
                      </button>
                      <button
                        type="button"
                        className={styles.textButton}
                        disabled={locked}
                        onClick={async () => {
                          try {
                            await listingDrafts.remove(key);
                            setDraft(null);
                          } catch (e) {
                            setDraftError((e as Error).message);
                          }
                        }}
                      >
                        Hapus draf lokal
                      </button>
                    </div>
                  )}
                </div>
              )}
              {(error || (attempted && Object.keys(errors).length > 0)) && (
                <div className={styles.alert} role="alert">
                  <AlertCircle size={20} />
                  <p>
                    {Object.keys(errors).length
                      ? `${Object.keys(errors).length} kolom perlu diperbaiki sebelum tayang.`
                      : error}
                  </p>
                </div>
              )}
              <fieldset className={styles.fields} disabled={locked}>
                <div className={styles.identity}>
                  <ListingPhotoField
                    item={item}
                    value={photo}
                    onChange={(draft) => {
                      setPhoto(draft);
                      setErrors((old) => {
                        const n = { ...old };
                        delete n.image;
                        delete n.image_file;
                        delete n.image_source;
                        return n;
                      });
                    }}
                    error={
                      errors.image ||
                      errors.image_file ||
                      errors.image_source ||
                      (error && photo.file ? error : undefined)
                    }
                    busy={busy}
                    progress={progress}
                    onRetry={() => void submit()}
                  />
                  <div className={styles.identityFields}>
                    <Field
                      name="name"
                      label="Nama makanan"
                      error={errors.name}
                      hint={`Maks. 60 karakter · ${fields.name.length}/60${fields.name.length > 60 && fields.name === item?.name ? " · nama lama dipertahankan; ubahan wajib ≤60" : ""}`}
                    >
                      <input
                        {...input("name")}
                        maxLength={Math.max(60, item?.name.length || 0)}
                        placeholder="Contoh: Roti Sisir Mentega"
                      />
                    </Field>
                    <div className={styles.field}>
                      <span
                        className={styles.label}
                        id="listing-category-label"
                      >
                        Kategori
                      </span>
                      <div
                        className={styles.chips}
                        role="radiogroup"
                        aria-labelledby="listing-category-label"
                        aria-invalid={!!errors.category}
                        onKeyDown={(e) => {
                          if (
                            [
                              "ArrowLeft",
                              "ArrowRight",
                              "ArrowUp",
                              "ArrowDown",
                              "Home",
                              "End",
                            ].includes(e.key)
                          ) {
                            e.preventDefault();
                            const radios = [
                              ...e.currentTarget.querySelectorAll<HTMLButtonElement>(
                                '[role="radio"]',
                              ),
                            ].filter((el) => el.getClientRects().length > 0);
                            const current = radios.indexOf(
                              e.target as HTMLButtonElement,
                            );
                            const next =
                              e.key === "Home"
                                ? 0
                                : e.key === "End"
                                  ? radios.length - 1
                                  : (current +
                                      (["ArrowRight", "ArrowDown"].includes(
                                        e.key,
                                      )
                                        ? 1
                                        : radios.length - 1)) %
                                    radios.length;
                            const button = radios[next];
                            if (button?.dataset.category) {
                              update("category", button.dataset.category);
                              button.focus();
                            }
                          }
                        }}
                      >
                        {listingCategories.map((c) => (
                          <button
                            type="button"
                            key={c}
                            className={styles.chip}
                            role="radio"
                            data-category={c}
                            aria-checked={fields.category === c}
                            onClick={() => update("category", c)}
                          >
                            {c === "Makanan berat" ? "Nasi & lauk" : c}
                          </button>
                        ))}
                      </div>
                      {errors.category && (
                        <small className={styles.error}>
                          {errors.category}
                        </small>
                      )}
                      {!["Roti & kue", "Makanan berat", "Minuman"].includes(
                        fields.category,
                      ) && (
                        <small className={styles.hint}>
                          Dipilih: {fields.category}
                        </small>
                      )}
                    </div>
                    <div className={styles.donation} data-free={fields.free}>
                      <div>
                        <strong>Gratis (donasi)</strong>
                        <p className={styles.hint}>
                          Pembeli klaim tanpa bayar. Maks. 2 porsi per orang per
                          hari WIB di seluruh toko.
                        </p>
                      </div>
                      <label className={styles.switch}>
                        <input
                          type="checkbox"
                          aria-label="Gratis (donasi)"
                          checked={fields.free}
                          disabled={ticketLocked}
                          onChange={(e) => update("free", e.target.checked)}
                        />
                        <span />
                      </label>
                    </div>
                  </div>
                </div>
                {fields.free && (
                  <p className={styles.freeNotice}>
                    <ShieldCheck size={18} />
                    Kami hanya tampilkan stok dan batas ambil. Kuota gratis
                    maksimal 2 porsi per hari WIB di seluruh toko tetap berlaku.
                  </p>
                )}
                <div className={styles.pricesAndStock}>
                  {!fields.free && bodyPrices}
                  <div className={styles.portion}>
                    <label className={styles.label} htmlFor="listing-stock">
                      Jumlah porsi
                    </label>
                    <div className={styles.stepper}>
                      <button
                        type="button"
                        aria-label="Kurangi porsi"
                        disabled={Number(fields.stock) <= (item ? 0 : 1)}
                        onClick={() =>
                          update(
                            "stock",
                            String(
                              Math.max(
                                item ? 0 : 1,
                                (Number(fields.stock) || 0) - 1,
                              ),
                            ),
                          )
                        }
                      >
                        <Minus size={20} />
                      </button>
                      <input
                        {...input("stock")}
                        type="number"
                        min={item ? 0 : 1}
                        max={2147483647}
                        step={1}
                        aria-label="Jumlah porsi"
                      />
                      <button
                        type="button"
                        aria-label="Tambah porsi"
                        onClick={() =>
                          update(
                            "stock",
                            String((Number(fields.stock) || 0) + 1),
                          )
                        }
                      >
                        <Plus size={20} />
                      </button>
                    </div>
                    <p className={styles.hint}>
                      Stok berkurang otomatis saat dipesan
                    </p>
                    {errors.stock && (
                      <p className={styles.error} id="listing-stock-error">
                        {errors.stock}
                      </p>
                    )}
                  </div>
                </div>
                <div className={styles.timingAndNotes}>
                  <div className={styles.field}>
                    <label htmlFor="listing-pickup-end-time">
                      Ambil sebelum
                    </label>
                    <div className={styles.timeRow}>
                      <div className={styles.timeInput}>
                        <Timer size={18} />
                        <strong
                          aria-hidden="true"
                          className={styles.timeDisplay}
                        >
                          {fields.pickup_end.slice(11).replace(":", ".")}
                        </strong>
                        <input
                          id="listing-pickup-end-time"
                          type="time"
                          onClick={(event) => {
                            try {
                              event.currentTarget.showPicker?.();
                            } catch {}
                          }}
                          aria-label="Jam ambil sebelum (WIB)"
                          disabled={ticketLocked}
                          value={fields.pickup_end.slice(11)}
                          aria-invalid={!!errors.pickup_end}
                          aria-describedby={
                            errors.pickup_end
                              ? "listing-pickup_end-error"
                              : undefined
                          }
                          onChange={(e) =>
                            update(
                              "pickup_end",
                              `${fields.pickup_end.slice(0, 10)}T${e.target.value}`,
                            )
                          }
                        />
                      </div>
                      <div className={styles.quickTimes}>
                        {["19:00", "20:00", "21:00"].map((t) => (
                          <button
                            type="button"
                            className={styles.chip}
                            key={t}
                            disabled={ticketLocked}
                            aria-pressed={fields.pickup_end.slice(11) === t}
                            onClick={() =>
                              update(
                                "pickup_end",
                                `${fields.pickup_end.slice(0, 10)}T${t}`,
                              )
                            }
                          >
                            {t.replace(":", ".")}
                          </button>
                        ))}
                      </div>
                    </div>
                    {errors.pickup_end ? (
                      <small
                        id="listing-pickup_end-error"
                        className={styles.error}
                      >
                        {errors.pickup_end}
                      </small>
                    ) : (
                      <small className={styles.hint}>
                        {fields.pickup_end.slice(0, 10)} WIB
                        {selectedStore
                          ? ` · ${storeHoursLabel(selectedStore)}`
                          : " · pilih toko penjual"}
                      </small>
                    )}
                  </div>
                  <Field
                    name="buyer_notes"
                    label="Catatan untuk pembeli (opsional)"
                    hint={`${fields.buyer_notes.length}/140`}
                    error={errors.buyer_notes}
                  >
                    <input
                      {...input("buyer_notes")}
                      maxLength={140}
                      placeholder="Contoh: Bawa wadah sendiri lebih baik"
                    />
                  </Field>
                </div>
                <section
                  className={styles.details}
                  aria-label="Detail toko dan informasi makanan"
                >
                  <h2 className={styles.detailHeading}>
                    Detail toko &amp; informasi makanan
                  </h2>
                  {ticketLocked && (
                    <p role="status" className={styles.hint}>
                      Ada pesanan aktif. Harga, toko, dan waktu pengambilan
                      dikunci untuk melindungi tiket. Stok tetap berarti porsi
                      tersisa.
                    </p>
                  )}
                  <div className={styles.detailFields}>
                    <div className={styles.span}>
                      <Field
                        name="store_id"
                        label="Toko penjual"
                        error={errors.store_id}
                      >
                        <select
                          {...input("store_id")}
                          disabled={
                            locked ||
                            ticketLocked ||
                            storesLoading ||
                            !!storesError
                          }
                        >
                          <option value="">Pilih toko penjual</option>
                          {stores.map((store) => (
                            <option
                              key={store.id}
                              value={store.id}
                              disabled={
                                !!store.closed_at ||
                                (!store.is_open && item?.store_id !== store.id)
                              }
                            >
                              {store.name} · {store.address} · #{store.id}
                              {store.closed_at
                                ? " (ditutup permanen)"
                                : !store.is_open
                                  ? " (ditutup sementara)"
                                  : ""}
                            </option>
                          ))}
                        </select>
                      </Field>
                      {storesLoading ? (
                        <p role="status">Memuat pilihan toko…</p>
                      ) : storesError ? (
                        <p className={styles.error} role="alert">
                          {storesError}
                        </p>
                      ) : !stores.length ? (
                        <p className={styles.hint}>
                          Belum ada toko. Daftarkan toko terlebih dahulu untuk
                          menayangkan listing.
                        </p>
                      ) : null}
                      {selectedStore && (
                        <div
                          className={styles.storeLocation}
                          aria-label="Lokasi pengambilan dari toko"
                        >
                          <strong>Pengambilan di {selectedStore.name}</strong>
                          <p>{selectedStore.address}</p>
                          <p>
                            Pin toko: {selectedStore.latitude.toFixed(6)},{" "}
                            {selectedStore.longitude.toFixed(6)}
                          </p>
                          {!selectedStore.is_open && (
                            <p>
                              Toko sedang ditutup; listing tidak ditawarkan
                              sampai toko dibuka.
                            </p>
                          )}
                        </div>
                      )}
                      {item && !item.store_id && (
                        <p className={styles.hint}>
                          Listing lama belum terhubung ke toko. Pilih toko
                          dengan lokasi pengambilan yang sesuai sebelum
                          menyimpan.
                        </p>
                      )}
                      <div className={styles.storeActions}>
                        <Link
                          href="/partner/store"
                          target="_blank"
                          className={styles.textButton}
                        >
                          Daftarkan atau kelola toko (tab baru)
                        </Link>
                        <button
                          type="button"
                          disabled={storesLoading}
                          className={styles.textButton}
                          onClick={() => {
                            setStoresLoading(true);
                            setStoresError("");
                            void loadStores();
                          }}
                        >
                          {storesError ? "Coba lagi" : "Muat ulang toko"}
                        </button>
                      </div>
                    </div>
                    <div className={styles.span}>
                      <Field
                        name="description"
                        label="Deskripsi makanan"
                        error={errors.description}
                      >
                        <textarea {...input("description")} rows={3} />
                      </Field>
                    </div>
                    <Field
                      name="prepared_at"
                      label="Makanan dibuat (WIB)"
                      error={errors.prepared_at}
                    >
                      <input
                        {...input("prepared_at")}
                        type="datetime-local"
                        max={wibDateTime(new Date().toISOString())}
                      />
                    </Field>
                    <Field
                      name="pickup_start"
                      label="Mulai pengambilan (WIB)"
                      error={errors.pickup_start}
                    >
                      <input {...input("pickup_start")} type="datetime-local" />
                    </Field>
                    <Field
                      name="pickup_end"
                      label="Batas pengambilan (WIB)"
                      error={undefined}
                    >
                      <input {...input("pickup_end")} type="datetime-local" />
                    </Field>
                    {(
                      [
                        ["packaging", "Kemasan (opsional)"],
                        ["storage_notes", "Disimpan (opsional)"],
                        ["allergens", "Mengandung/alergen (opsional)"],
                      ] as const
                    ).map(([name, label]) => (
                      <Field
                        key={name}
                        name={name}
                        label={label}
                        error={errors[name]}
                      >
                        <input {...input(name)} maxLength={500} />
                      </Field>
                    ))}
                    <p className={`${styles.hint} ${styles.span}`}>
                      Waktu menggunakan WIB. Harga, toko/alamat dan waktu ambil
                      dilindungi selama ada pesanan aktif. Draf hanya tersimpan
                      lokal di browser akun ini.
                    </p>
                  </div>
                </section>
              </fieldset>
            </div>
            <footer className={styles.actions}>
              <p>
                {published
                  ? `Tersimpan ${pickup(new Date().toISOString())} WIB.`
                  : !hasPhoto
                    ? "Lengkapi foto makanan untuk menayangkan."
                    : "Langsung tampil di peta setelah tayang."}
              </p>
              <button
                className={styles.secondary}
                type="button"
                disabled={locked || savingDraft || photo.editing}
                onClick={saveDraft}
              >
                Simpan draf
              </button>
              {published ? (
                <button
                  className={styles.primary}
                  type="button"
                  onClick={onNew}
                >
                  Tambah listing lain
                </button>
              ) : (
                <button
                  className={styles.primary}
                  type="submit"
                  disabled={
                    busy ||
                    photo.editing ||
                    storesLoading ||
                    !!storesError ||
                    stores.length === 0
                  }
                >
                  {busy
                    ? "Memproses…"
                    : item
                      ? "Simpan perubahan"
                      : "Tayangkan listing"}
                </button>
              )}
              {published && (
                <div className={styles.snackbar} role="status">
                  <ShieldCheck size={20} />
                  <div>
                    <strong>{published.name} sudah tayang</strong>
                    <span>Listing berhasil ditayangkan.</span>
                    <small>
                      Terlihat di peta sampai {pickup(published.pickup_end)} WIB
                    </small>
                  </div>
                  <button type="button" onClick={() => onView(published)}>
                    Lihat
                  </button>
                </div>
              )}
            </footer>
          </form>
          <aside className={styles.preview} aria-label="Pratinjau listing">
            <div>
              <p className={styles.eyebrow}>PRATINJAU LANGSUNG</p>
              <h2>Begini listing Anda terlihat oleh pembeli</h2>
            </div>
            <div className={styles.previewCard}>
              <div>
                <ListingImage
                  src={previewImage}
                  alt="Pratinjau kartu makanan"
                />
              </div>
              <div>
                <h3>{fields.name || "Nama makanan"}</h3>
                <p>{selectedStore?.name || "Pilih toko penjual"}</p>
                <div className={styles.previewPrices}>
                  <strong>
                    {fields.free || fields.price
                      ? rupiah(chosenPrice)
                      : "Isi harga"}
                  </strong>
                  {!fields.free &&
                    Number(fields.original_price) > chosenPrice && (
                      <>
                        <del>{rupiah(Number(fields.original_price))}</del>
                        <span>Hemat {saving}%</span>
                      </>
                    )}
                </div>
                <p>
                  Ambil sebelum {fields.pickup_end.slice(11).replace(":", ".")}{" "}
                  · {fields.stock || 0} porsi tersisa
                </p>
              </div>
            </div>
            <p className={styles.hint}>Di peta · stiker di lokasi toko</p>
            {selectedStore &&
            validCoordinates(
              selectedStore.latitude,
              selectedStore.longitude,
            ) ? (
              <PreviewMap
                store={selectedStore}
                price={fields.free || fields.price ? chosenPrice : null}
              />
            ) : (
              <div className={styles.mapPreview}>
                <p className={styles.mapPlaceholder}>
                  Pilih toko untuk melihat pin pengambilan.
                </p>
              </div>
            )}
            <div className={styles.checklist}>
              <h3>
                {ready === checks.length ? "Siap tayang" : "Belum lengkap"} ·{" "}
                {ready} dari {checks.length} bagian wajib
              </h3>
              <ul>
                {checks.map(([label, ok]) => (
                  <li key={label} data-ready={ok}>
                    {ok ? <Check size={16} /> : <AlertCircle size={16} />}{" "}
                    {label}
                  </li>
                ))}
              </ul>
            </div>
            <p className={styles.hint}>
              Tayang sampai {fields.pickup_end.slice(11).replace(":", ".")} WIB,
              lalu hilang sendiri dari peta. Tandai habis kapan saja dari
              Dasbor.
            </p>
          </aside>
        </div>
      </div>
      {copyOpen && (
        <Modal
          title="Salin dari listing sebelumnya"
          onClose={() => {
            copyAbort.current?.abort();
            setCopyOpen(false);
          }}
          sheet
        >
          <p className={styles.hint}>
            Foto, nama, harga, dan porsi ikut tersalin. Jam ambil diganti ke
            hari ini. Waktu dibuat perlu diisi ulang.
          </p>
          {copyError && (
            <p role="alert" className={styles.error}>
              {copyError}
            </p>
          )}
          <div className={styles.copyList}>
            {previous.length ? (
              previous.map((row) => (
                <div key={row.id} className={styles.copyRow}>
                  <div>
                    <ListingImage src={row.image} alt={row.name} />
                  </div>
                  <div>
                    <strong>{row.name}</strong>
                    <p>
                      {new Date(row.pickup_end).toLocaleDateString("id-ID", {
                        day: "numeric",
                        month: "short",
                        timeZone: "Asia/Jakarta",
                      })}{" "}
                      · {rupiah(row.price)} · {row.stock} porsi
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={copying !== null}
                    aria-label={`Salin ${row.name}`}
                    onClick={() => void copyListing(row)}
                  >
                    {copying === row.id ? "Menyalin…" : "Salin"}
                  </button>
                </div>
              ))
            ) : (
              <p className={styles.hint}>
                Belum ada listing sebelumnya untuk disalin.
              </p>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
