"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { ArrowLeft, Plus, PackageOpen } from "lucide-react";
import Modal from "./modal";
import { primaryButton, secondaryButton, errorClass } from "./store-ui";
import styles from "./partner-listings.module.css";
import {
  ApiError,
  listingCategories,
  partnerListingApi,
  rupiah,
  type Listing,
  type ListingInput,
} from "@/lib/api";

function localDate(value: string) {
  return new Date(value)
    .toLocaleString("sv-SE", { timeZone: "Asia/Jakarta" })
    .replace(" ", "T")
    .slice(0, 16);
}

function Field({
  name,
  label,
  error,
  children,
}: {
  name: string;
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className={styles["listing-field"]}>
      <label htmlFor={`listing-${name}`}>{label}</label>
      {children}
      {error && (
        <small
          id={`listing-${name}-error`}
          className={styles["listing-field-error"]}
        >
          {error}
        </small>
      )}
    </div>
  );
}

function ListingForm({
  item,
  busy,
  setBusy,
  onSaved,
  onCancel,
}: {
  item: Listing | null;
  busy: boolean;
  setBusy: (value: boolean) => void;
  onSaved: (item: Listing) => void;
  onCancel: () => void;
}) {
  const [free, setFree] = useState(item?.price === 0);
  const [error, setError] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [times] = useState(() => {
    const start = new Date();
    return {
      start: localDate(start.toISOString()),
      end: localDate(
        new Date(start.getTime() + 2 * 60 * 60 * 1000).toISOString(),
      ),
    };
  });
  const inputProps = (name: string) => ({
    id: `listing-${name}`,
    name,
    "aria-invalid": !!errors[name],
    "aria-describedby": errors[name] ? `listing-${name}-error` : undefined,
  });
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const text = (name: string) => String(form.get(name) ?? "").trim();
    const payload: ListingInput = {
      name: text("name"),
      store: text("store"),
      category: text("category"),
      description: text("description"),
      address: text("address"),
      image: text("image"),
      price: free ? 0 : Number(text("price")),
      original_price: free
        ? (item?.original_price ?? 0)
        : Number(text("original_price")),
      stock: Number(text("stock")),
      latitude: Number(text("latitude")),
      longitude: Number(text("longitude")),
      pickup_start: new Date(`${text("pickup_start")}+07:00`).toISOString(),
      pickup_end: new Date(`${text("pickup_end")}+07:00`).toISOString(),
    };
    setBusy(true);
    setError("");
    setErrors({});
    try {
      const changes = item
        ? Object.fromEntries(
            Object.entries(payload).filter(([key, value]) => {
              if (key === "pickup_start" || key === "pickup_end")
                return text(key) !== localDate(item[key]);
              return value !== item[key as keyof ListingInput];
            }),
          )
        : payload;
      onSaved(
        item
          ? await partnerListingApi.update(item.id, changes)
          : await partnerListingApi.create(payload),
      );
    } catch (e) {
      if (e instanceof ApiError) {
        setErrors(
          Object.fromEntries(
            Object.entries(e.details).map(([key, value]) => [
              key,
              Array.isArray(value) ? value.join(" ") : String(value),
            ]),
          ),
        );
      }
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className={styles["listing-form"]} onSubmit={submit}>
      <button
        type="button"
        className={`${styles["listing-back"]} text-sm font-semibold text-brand`}
        onClick={onCancel}
        disabled={busy}
      >
        <ArrowLeft size={16} /> Kembali ke listing
      </button>
      <div>
        <h3>{item ? "Ubah listing" : "Tambah listing"}</h3>
        <p className={styles["listing-hint"]}>
          Isi detail makanan dan lokasi pengambilan. Waktu menggunakan WIB.
        </p>
      </div>
      {error && (
        <p className={errorClass} role="alert">
          {error}
        </p>
      )}
      <fieldset disabled={busy} className={styles["listing-fields"]}>
        <Field name="name" label="Nama makanan" error={errors.name}>
          <input
            {...inputProps("name")}
            defaultValue={item?.name}
            required
            maxLength={160}
          />
        </Field>
        <Field name="store" label="Nama toko" error={errors.store}>
          <input
            {...inputProps("store")}
            defaultValue={item?.store}
            required
            maxLength={120}
          />
        </Field>
        <Field name="category" label="Kategori" error={errors.category}>
          <select
            {...inputProps("category")}
            defaultValue={item?.category || listingCategories[0]}
          >
            {listingCategories.map((category) => (
              <option key={category}>{category}</option>
            ))}
          </select>
        </Field>
        <Field name="stock" label="Stok tersedia (porsi)" error={errors.stock}>
          <input
            {...inputProps("stock")}
            type="number"
            min={0}
            step={1}
            required
            defaultValue={item?.stock ?? 1}
          />
        </Field>
        <div className={styles["listing-span"]}>
          <Field
            name="description"
            label="Deskripsi makanan"
            error={errors.description}
          >
            <textarea
              {...inputProps("description")}
              required
              rows={3}
              defaultValue={item?.description}
            />
          </Field>
        </div>
        <div className={styles["listing-span"]}>
          <Field name="image" label="URL foto makanan" error={errors.image}>
            <input
              {...inputProps("image")}
              type="url"
              required
              maxLength={250}
              placeholder="https://contoh.com/foto-makanan.jpg"
              defaultValue={item?.image}
            />
          </Field>
          <p className={styles["listing-hint"]}>
            Gunakan URL foto publik dengan awalan https:// atau http://.
          </p>
        </div>
        <label
          className={styles["listing-donation"] + " " + styles["listing-span"]}
        >
          <input
            type="checkbox"
            checked={free}
            onChange={(e) => setFree(e.target.checked)}
          />{" "}
          Gratis (donasi)
        </label>
        {!free && (
          <>
            <Field
              name="original_price"
              label="Harga normal (Rp)"
              error={errors.original_price}
            >
              <input
                {...inputProps("original_price")}
                type="number"
                min={0}
                step={1}
                required
                defaultValue={item?.original_price}
              />
            </Field>
            <Field name="price" label="Harga jual (Rp)" error={errors.price}>
              <input
                {...inputProps("price")}
                type="number"
                min={1}
                step={1}
                required
                defaultValue={item?.price || undefined}
              />
            </Field>
          </>
        )}
        {free && (errors.price || errors.original_price) && (
          <p
            className={
              styles["listing-field-error"] + " " + styles["listing-span"]
            }
          >
            {errors.price || errors.original_price}
          </p>
        )}
        <Field
          name="pickup_start"
          label="Mulai pengambilan (WIB)"
          error={errors.pickup_start}
        >
          <input
            {...inputProps("pickup_start")}
            type="datetime-local"
            required
            defaultValue={item ? localDate(item.pickup_start) : times.start}
          />
        </Field>
        <Field
          name="pickup_end"
          label="Batas pengambilan (WIB)"
          error={errors.pickup_end}
        >
          <input
            {...inputProps("pickup_end")}
            type="datetime-local"
            required
            defaultValue={item ? localDate(item.pickup_end) : times.end}
          />
        </Field>
        <div className={styles["listing-span"]}>
          <Field
            name="address"
            label="Alamat pengambilan"
            error={errors.address}
          >
            <textarea
              {...inputProps("address")}
              required
              maxLength={250}
              rows={2}
              defaultValue={item?.address}
            />
          </Field>
        </div>
        <Field name="latitude" label="Latitude toko" error={errors.latitude}>
          <input
            {...inputProps("latitude")}
            type="number"
            min={-90}
            max={90}
            step="any"
            required
            defaultValue={item?.latitude}
            placeholder="-6.366"
          />
        </Field>
        <Field name="longitude" label="Longitude toko" error={errors.longitude}>
          <input
            {...inputProps("longitude")}
            type="number"
            min={-180}
            max={180}
            step="any"
            required
            defaultValue={item?.longitude}
            placeholder="106.829"
          />
        </Field>
      </fieldset>
      <p className={styles["listing-hint"]}>
        Stok adalah jumlah yang masih dapat dipesan. Harga, alamat, koordinat,
        dan waktu ambil tidak dapat diubah selama ada pesanan aktif.
      </p>
      <div className={styles["listing-form-actions"]}>
        <button
          type="button"
          className={secondaryButton}
          onClick={onCancel}
          disabled={busy}
        >
          Batal
        </button>
        <button className={primaryButton} disabled={busy}>
          {busy
            ? "Menyimpan…"
            : item
              ? "Simpan perubahan"
              : "Tayangkan listing"}
        </button>
      </div>
    </form>
  );
}

export default function PartnerListings({
  onClose,
  onCatalogChange,
}: {
  onClose: () => void;
  onCatalogChange: (item: Listing | null, id: number) => void;
}) {
  const [items, setItems] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [form, setForm] = useState<{ item: Listing | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmation, setConfirmation] = useState<{
    id: number;
    action: "deactivate" | "delete";
  } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const load = useCallback((signal?: AbortSignal) => {
    return partnerListingApi
      .list(signal)
      .then((data) => {
        if (!signal?.aborted) setItems(data);
      })
      .catch((e: Error) => {
        if (!signal?.aborted) setError(e.message);
      })
      .finally(() => {
        if (!signal?.aborted) setLoading(false);
      });
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [load]);
  function saved(item: Listing) {
    setItems((current) => [
      item,
      ...current.filter((row) => row.id !== item.id),
    ]);
    onCatalogChange(item, item.id);
    setForm(null);
    setMessage(
      form?.item
        ? "Perubahan listing berhasil disimpan."
        : "Listing berhasil ditayangkan.",
    );
  }
  async function mutate(
    item: Listing,
    action: "activate" | "deactivate" | "delete",
  ) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (action === "delete") {
        await partnerListingApi.remove(item.id);
        setItems((current) => current.filter((row) => row.id !== item.id));
        onCatalogChange(null, item.id);
      } else {
        const updated = await partnerListingApi.update(item.id, {
          active: action === "activate",
        });
        setItems((current) =>
          current.map((row) => (row.id === updated.id ? updated : row)),
        );
        onCatalogChange(updated, updated.id);
      }
      setMessage(
        action === "delete"
          ? "Listing dihapus permanen."
          : action === "activate"
            ? "Listing diaktifkan."
            : "Listing dinonaktifkan.",
      );
      setConfirmation(null);
    } catch (e) {
      setError((e as Error).message);
      setConfirmation(null);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Kelola listing"
      wide
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <div className={styles["partner-listings"]}>
        {form ? (
          <ListingForm
            key={form.item?.id ?? "new"}
            item={form.item}
            busy={busy}
            setBusy={setBusy}
            onSaved={saved}
            onCancel={() => setForm(null)}
          />
        ) : (
          <>
            <div className={styles["listing-toolbar"]}>
              <p>
                Kelola makanan surplus milik tokomu, termasuk listing nonaktif
                dan kedaluwarsa.
              </p>
              <button
                className={primaryButton}
                onClick={() => {
                  setForm({ item: null });
                  setMessage("");
                  setError("");
                }}
                disabled={loading || busy}
              >
                <Plus size={17} /> Tambah listing
              </button>
            </div>
            {message && (
              <p
                className="rounded-lg bg-[#e8f1e1] p-3 text-xs leading-relaxed text-[#477543]"
                role="status"
              >
                {message}
              </p>
            )}
            {error && (
              <p className={errorClass} role="alert">
                {error}{" "}
                {items.length === 0 && (
                  <button
                    className="inline-flex items-center gap-2 py-1.5 text-xs font-semibold text-brand"
                    onClick={() => {
                      setLoading(true);
                      setError("");
                      void load();
                    }}
                  >
                    Coba lagi
                  </button>
                )}
              </p>
            )}
            {loading ? (
              <p className={styles["listing-loading"]} role="status">
                Memuat listing…
              </p>
            ) : items.length === 0 && !error ? (
              <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-line bg-light px-5 py-12 text-center text-muted [&_h3]:text-lg [&_p]:text-xs">
                <PackageOpen size={35} />
                <h3>Belum ada listing.</h3>
                <p>
                  Mulai tawarkan makanan surplus dengan tombol Tambah listing.
                </p>
              </div>
            ) : (
              items.length > 0 && (
                <div className={styles["listing-table-wrap"]}>
                  <table className={styles["listing-table"]}>
                    <caption className="sr-only">
                      Inventaris makanan surplus milik Anda
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col">Produk</th>
                        <th scope="col">Harga</th>
                        <th scope="col">Stok</th>
                        <th scope="col">Status</th>
                        <th scope="col">Aksi</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item) => {
                        const status = !item.active
                          ? "Nonaktif"
                          : new Date(item.pickup_end).getTime() <= now
                            ? "Kedaluwarsa"
                            : item.stock === 0
                              ? "Habis"
                              : "Aktif";
                        return (
                          <Fragment key={item.id}>
                            <tr>
                              <td data-label="Produk">
                                <div className={styles["listing-product"]}>
                                  <div
                                    className={styles["listing-thumbnail"]}
                                    style={{
                                      backgroundImage: `url(${JSON.stringify(item.image)})`,
                                    }}
                                  />
                                  <div>
                                    <strong>{item.name}</strong>
                                    <small>{item.store}</small>
                                    <small>
                                      Ambil sampai{" "}
                                      {new Date(item.pickup_end).toLocaleString(
                                        "id-ID",
                                        {
                                          timeZone: "Asia/Jakarta",
                                          dateStyle: "medium",
                                          timeStyle: "short",
                                        },
                                      )}{" "}
                                      WIB
                                    </small>
                                  </div>
                                </div>
                              </td>
                              <td data-label="Harga">{rupiah(item.price)}</td>
                              <td data-label="Stok">{item.stock} porsi</td>
                              <td data-label="Status">
                                <span
                                  className={`${styles["listing-status"]}${status === "Aktif" ? ` ${styles["is-active"]}` : ""}`}
                                >
                                  {status}
                                </span>
                              </td>
                              <td data-label="Aksi">
                                <div className={styles["listing-actions"]}>
                                  <button
                                    onClick={() => {
                                      setForm({ item });
                                      setError("");
                                      setMessage("");
                                    }}
                                    disabled={busy}
                                    aria-label={`Ubah ${item.name}`}
                                  >
                                    Ubah
                                  </button>
                                  <button
                                    disabled={busy}
                                    onClick={() =>
                                      item.active
                                        ? setConfirmation({
                                            id: item.id,
                                            action: "deactivate",
                                          })
                                        : void mutate(item, "activate")
                                    }
                                    aria-label={`${item.active ? "Nonaktifkan" : "Aktifkan"} ${item.name}`}
                                  >
                                    {item.active ? "Nonaktifkan" : "Aktifkan"}
                                  </button>
                                  <button
                                    className={styles["listing-delete"]}
                                    disabled={busy}
                                    onClick={() =>
                                      setConfirmation({
                                        id: item.id,
                                        action: "delete",
                                      })
                                    }
                                    aria-label={`Hapus ${item.name}`}
                                  >
                                    Hapus
                                  </button>
                                </div>
                              </td>
                            </tr>
                            {confirmation?.id === item.id && (
                              <tr>
                                <td colSpan={5}>
                                  <div
                                    className={styles["listing-confirm"]}
                                    role="group"
                                    aria-label="Konfirmasi aksi listing"
                                  >
                                    <p>
                                      {confirmation.action === "delete"
                                        ? `Hapus ${item.name} permanen? Listing dengan riwayat pesanan hanya dapat dinonaktifkan.`
                                        : `Nonaktifkan ${item.name}? Pesanan yang sudah masuk tetap berlaku.`}
                                    </p>
                                    <div className={styles["listing-actions"]}>
                                      <button
                                        disabled={busy}
                                        onClick={() =>
                                          void mutate(item, confirmation.action)
                                        }
                                      >
                                        {busy
                                          ? "Memproses…"
                                          : confirmation.action === "delete"
                                            ? "Ya, hapus"
                                            : "Ya, nonaktifkan"}
                                      </button>
                                      <button
                                        disabled={busy}
                                        onClick={() => setConfirmation(null)}
                                      >
                                        Batal
                                      </button>
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
