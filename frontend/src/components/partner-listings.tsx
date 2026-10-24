"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { Plus, PackageOpen } from "lucide-react";
import Modal from "./modal";
import { designFont } from "@/lib/design-font";
import ListingComposer from "./listing-composer";
import { primaryButton, errorClass } from "./store-ui";
import styles from "./partner-listings.module.css";
import { partnerListingApi, rupiah, type Listing } from "@/lib/api";

export default function PartnerListings({
  onClose,
  onCatalogChange,
  userId,
  onViewListing,
  onAccount,
  startWithCreate = false,
  startWithCopy = false,
}: {
  userId: number;
  startWithCreate?: boolean;
  startWithCopy?: boolean;
  onViewListing: (item: Listing) => void;
  onAccount: () => void;
  onClose: () => void;
  onCatalogChange: (item: Listing | null, id: number) => void;
}) {
  const [items, setItems] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [form, setForm] = useState<{
    item: Listing | null;
    session?: number;
    copy?: boolean;
  } | null>(startWithCreate ? { item: null, copy: startWithCopy } : null);
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
    if (form?.item) setForm(null);
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
      title={
        form
          ? form.item
            ? "Ubah listing"
            : "Tambah listing"
          : "Kelola listing"
      }
      wide
      fullscreen={!!form}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <div className={`${styles["partner-listings"]} ${designFont.className}`}>
        {form ? (
          <ListingComposer
            key={`${form.item?.id ?? "new"}-${form.session ?? 0}`}
            userId={userId}
            now={now}
            items={items}
            onView={onViewListing}
            onAccount={onAccount}
            onNew={() => setForm({ item: null, session: Date.now() })}
            item={form.item}
            initialCopyOpen={!!form.copy}
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
