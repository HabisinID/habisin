"use client";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { Plus, PackageOpen, Pencil, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  api,
  partnerListingApi,
  pickup,
  rupiah,
  type Listing,
  type ListingInput,
  type Store,
} from "@/lib/api";
import {
  draftKey,
  listingDrafts,
  type ListingDraft,
} from "@/lib/listing-draft";
import RoleWorkspace from "./role-workspace";
import ListingComposer from "./listing-composer";
import ListingImage from "./listing-image";
import Modal from "./modal";
import s from "./role-workspace.module.css";

export default function PartnerInventory() {
  return (
    <RoleWorkspace
      title="Listing"
      subtitle="Ubah stok, harga dan status listing. Perubahan tersimpan ke katalog."
    >
      {(user) => <Inventory userId={user.id} />}
    </RoleWorkspace>
  );
}
function Inventory({ userId }: { userId: number }) {
  const router = useRouter();
  const [items, setItems] = useState<Listing[]>([]),
    [stores, setStores] = useState<Store[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [filter, setFilter] = useState("all"),
    [storeId, setStoreId] = useState(""),
    [form, setForm] = useState<{
      item: Listing | null;
      session: number;
    } | null>(null),
    [busy, setBusy] = useState(false),
    [busyRows, setBusyRows] = useState<number[]>([]),
    [confirmOff, setConfirmOff] = useState<number | null>(null),
    [remove, setRemove] = useState<Listing | null>(null),
    [understood, setUnderstood] = useState(false),
    [draft, setDraft] = useState<ListingDraft | null>(null),
    [draftError, setDraftError] = useState(""),
    [now, setNow] = useState(() => Date.now());
  const stockRequests = useRef(new Set<number>());
  const load = useCallback(
    (signal?: AbortSignal) =>
      partnerListingApi
        .list(signal)
        .then((data) => {
          if (!signal?.aborted) {
            setItems(data);
            setError("");
          }
        })
        .catch((e) => {
          if (!signal?.aborted) setError(e.message);
        })
        .finally(() => {
          if (!signal?.aborted) setLoading(false);
        }),
    [],
  );
  useEffect(() => {
    const c = new AbortController();
    void load(c.signal);
    api<{ stores: Store[] }>("partner/stores", "GET", undefined, c.signal)
      .then((data) => {
        if (!c.signal.aborted) setStores(data.stores);
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message);
      });
    const refresh = () => void load(c.signal);
    window.addEventListener("focus", refresh);
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      c.abort();
      window.removeEventListener("focus", refresh);
      clearInterval(timer);
    };
  }, [load]);
  useEffect(() => {
    let active = true;
    if (!form)
      listingDrafts
        .load(draftKey(userId))
        .then((d) => {
          if (active) setDraft(d);
        })
        .catch((e) => {
          if (active) setDraftError(e.message);
        });
    return () => {
      active = false;
    };
  }, [userId, form]);
  const status = (item: Listing) =>
    item.moderated_at
      ? "removed"
      : !item.active ||
          item.stock === 0 ||
          Date.parse(item.pickup_end) <= now ||
          item.store_summary?.is_open === false
        ? "inactive"
        : "live";
  const subset = items.filter(
    (item) => !storeId || String(item.store_id) === storeId,
  );
  const visible = subset.filter(
    (item) => filter === "all" || status(item) === filter,
  );
  const draftMatches = draft && (!storeId || draft.fields.store_id === storeId);
  const removed = subset.filter((item) => item.moderated_at);
  async function update(
    item: Listing,
    changes: Partial<ListingInput> & { active?: boolean },
  ) {
    if (stockRequests.current.has(item.id)) return;
    stockRequests.current.add(item.id);
    setBusyRows((current) => [...current, item.id]);
    setError("");
    try {
      const updated = await partnerListingApi.update(item.id, changes);
      setItems((current) =>
        current.map((row) =>
          row.id === item.id ? { ...row, ...updated } : row,
        ),
      );
      setMessage(
        changes.stock !== undefined
          ? `Stok ${item.name} tersimpan.`
          : `${item.name} ${changes.active ? "ditayangkan" : "dinonaktifkan"}.`,
      );
      setConfirmOff(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      stockRequests.current.delete(item.id);
      setBusyRows((current) => current.filter((id) => id !== item.id));
    }
  }
  async function deleteListing(e: React.FormEvent) {
    e.preventDefault();
    if (!remove || busy || !understood) return;
    setBusy(true);
    setError("");
    try {
      await partnerListingApi.remove(remove.id);
      setItems((current) => current.filter((item) => item.id !== remove.id));
      setMessage(
        "Listing dihapus dari inventaris. Riwayat transaksi tetap tersimpan.",
      );
      setRemove(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function saved(item: Listing) {
    setItems((current) => [
      item,
      ...current.filter((row) => row.id !== item.id),
    ]);
    setMessage(
      form?.item
        ? "Perubahan listing berhasil disimpan."
        : "Listing berhasil ditayangkan.",
    );
    if (form?.item) setForm(null);
  }
  const showDraft = draftMatches && (filter === "all" || filter === "draft");
  return (
    <section aria-label="Kelola listing mitra">
      <div className={`${s.toolbar} ${s.inventoryToolbar}`}>
        <div className={s.filters} aria-label="Filter status listing">
          {[
            [
              "live",
              `Tayang ${subset.filter((i) => status(i) === "live").length}`,
            ],
            ["draft", `Draf ${draftMatches ? 1 : 0}`],
            [
              "inactive",
              `Nonaktif ${subset.filter((i) => status(i) === "inactive").length}`,
            ],
            ["removed", `Diturunkan ${removed.length}`],
            ["all", `Semua ${subset.length + (draftMatches ? 1 : 0)}`],
          ].map(([key, label]) => (
            <button
              key={key}
              className={s.pill}
              aria-pressed={filter === key}
              onClick={() => setFilter(key)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className={s.row}>
          <label className="sr-only" htmlFor="inventory-store">
            Cabang listing
          </label>
          <select
            id="inventory-store"
            className={s.field}
            value={storeId}
            onChange={(e) => setStoreId(e.target.value)}
          >
            <option value="">Semua toko</option>
            {stores.map((store) => (
              <option key={store.id} value={store.id}>
                {store.name}
              </option>
            ))}
          </select>
          <button
            className={s.primary}
            disabled={loading}
            onClick={() => setForm({ item: null, session: Date.now() })}
          >
            <Plus size={18} />
            Tambah listing
          </button>
        </div>
      </div>
      {message && (
        <p role="status" className={s.message}>
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className={s.error}>
          {error} <button onClick={() => void load()}>Coba lagi listing</button>
        </p>
      )}
      {draftError && (
        <p role="status" className={s.muted}>
          {draftError}
        </p>
      )}
      {removed.length > 0 && (
        <div className={s.error} role="status">
          <strong>{removed.length} listing diturunkan admin.</strong>
          <p>
            Listing hilang dari peta dan pencarian. Pesanan yang sudah dibayar
            tetap berlaku. Lihat alasan pada baris listing.
          </p>
        </div>
      )}
      {loading ? (
        <div role="status" aria-label="Memuat listing">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className={s.skeleton} />
          ))}
          <span className="sr-only">Memuat listing…</span>
        </div>
      ) : visible.length === 0 && !showDraft && !error ? (
        <div className={s.empty}>
          <PackageOpen size={32} />
          <h2 className={s.title}>
            {items.length
              ? "Tidak ada listing pada filter ini."
              : "Belum ada listing."}
          </h2>
          <p className={s.muted}>
            Tambahkan makanan surplus untuk mulai menawarkan.
          </p>
          <button
            className={s.primary}
            onClick={() => setForm({ item: null, session: Date.now() })}
          >
            Tambah listing pertama
          </button>
        </div>
      ) : (
        <div className={s.tableWrap}>
          <table className={`${s.table} ${s.inventoryTable}`}>
            <caption className="sr-only">
              Inventaris makanan surplus milik Anda
            </caption>
            <thead>
              <tr>
                {[
                  "Produk",
                  "Harga",
                  "Stok",
                  "Batas ambil",
                  "Status",
                  "Aksi",
                ].map((label) => (
                  <th key={label} scope="col">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((item) => {
                const locked =
                  !!item.moderated_at ||
                  !!stores.find((store) => store.id === item.store_id)
                    ?.closed_at;
                const pending = busyRows.includes(item.id);
                const state = status(item);
                return (
                  <Fragment key={item.id}>
                    <tr data-listing-id={item.id}>
                      <td data-label="Produk">
                        <div className={s.product}>
                          <div className={s.thumb}>
                            <ListingImage src={item.image} alt={item.name} />
                          </div>
                          <div>
                            <strong>{item.name}</strong>
                            <p className={s.muted}>
                              {item.category} · {item.store}
                            </p>
                            {item.moderated_at && (
                              <p className="mt-2 max-w-sm text-error text-xs">
                                Diturunkan {pickup(item.moderated_at)} ·{" "}
                                {item.moderation_reason}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td data-label="Harga">
                        <strong>{rupiah(item.price)}</strong>
                        {item.price > 0 && item.original_price > item.price && (
                          <del className="block text-xs text-muted mt-1">
                            {rupiah(item.original_price)}
                          </del>
                        )}
                      </td>
                      <td data-label="Stok">
                        <div
                          className={s.stock}
                          aria-label={`Stok ${item.name}`}
                        >
                          <button
                            aria-label={`Kurangi stok ${item.name}`}
                            disabled={locked || pending || item.stock === 0}
                            onClick={() =>
                              void update(item, { stock: item.stock - 1 })
                            }
                          >
                            −
                          </button>
                          <output aria-live="polite">{item.stock}</output>
                          <button
                            aria-label={`Tambah stok ${item.name}`}
                            disabled={locked || pending}
                            onClick={() =>
                              void update(item, { stock: item.stock + 1 })
                            }
                          >
                            +
                          </button>
                        </div>
                      </td>
                      <td data-label="Batas ambil">
                        <span className={s.mono}>
                          {pickup(item.pickup_end)}
                        </span>
                        <small className="block text-muted mt-1">
                          {Date.parse(item.pickup_end) <= now
                            ? "Berakhir"
                            : `${Math.ceil((Date.parse(item.pickup_end) - now) / 60000)} mnt lagi`}
                        </small>
                      </td>
                      <td data-label="Status">
                        <span
                          className={`${s.badge} ${state === "removed" ? s.removed : ""}`}
                        >
                          {state === "removed"
                            ? "Diturunkan"
                            : state === "live"
                              ? "Tayang"
                              : item.stock === 0
                                ? "Habis"
                                : Date.parse(item.pickup_end) <= now
                                  ? "Kedaluwarsa"
                                  : "Nonaktif"}
                        </span>
                      </td>
                      <td data-label="Aksi">
                        <div className={s.actions}>
                          <button
                            className={s.secondary}
                            aria-label={`Ubah ${item.name}`}
                            disabled={locked || pending}
                            onClick={() =>
                              setForm({ item, session: Date.now() })
                            }
                          >
                            <Pencil size={14} />
                            Ubah
                          </button>
                          <button
                            role="switch"
                            aria-checked={item.active}
                            className={s.pill}
                            disabled={locked || pending}
                            aria-label={`${item.active ? "Nonaktifkan" : "Aktifkan"} ${item.name}`}
                            onClick={() =>
                              item.active
                                ? setConfirmOff(item.id)
                                : void update(item, { active: true })
                            }
                          >
                            {item.active ? "Tayang" : "Nonaktif"}
                          </button>
                          <button
                            className={s.danger}
                            disabled={locked || pending}
                            aria-label={`Hapus ${item.name}`}
                            onClick={() => {
                              setRemove(item);
                              setUnderstood(false);
                            }}
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                    {confirmOff === item.id && (
                      <tr>
                        <td colSpan={6} className={s.inline}>
                          <div className={s.rowBetween}>
                            <div>
                              <strong>Nonaktifkan {item.name}?</strong>
                              <p className={s.muted}>
                                Hilang dari peta dan pencarian. Pesanan yang
                                sudah dibayar tetap berlaku.
                              </p>
                            </div>
                            <div className={s.actions}>
                              <button
                                className={s.secondary}
                                onClick={() => setConfirmOff(null)}
                                disabled={pending}
                              >
                                Batal
                              </button>
                              <button
                                className={s.danger}
                                disabled={pending}
                                onClick={() =>
                                  void update(item, { active: false })
                                }
                              >
                                Ya, nonaktifkan
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
              {showDraft && (
                <tr>
                  <td data-label="Produk">
                    <strong>{draft.fields.name || "Listing baru"}</strong>
                    <p className={s.muted}>Draf lokal · browser ini</p>
                  </td>
                  <td colSpan={3} className={s.muted}>
                    Belum ditawarkan. Lanjutkan dan lengkapi foto serta
                    informasi makanan.
                  </td>
                  <td>
                    <span className={s.badge}>Draf</span>
                  </td>
                  <td>
                    <button
                      className={s.secondary}
                      onClick={() =>
                        setForm({ item: null, session: Date.now() })
                      }
                    >
                      Lanjutkan draf
                    </button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      <p className={`${s.muted} mt-5`}>
        Stok adalah porsi tersisa dan tersimpan otomatis. Listing diturunkan
        hanya dapat dipulihkan admin.
      </p>
      {form && (
        <Modal
          title={form.item ? "Ubah listing" : "Tambah listing"}
          drawer={!!form.item}
          fullscreen={!form.item}
          onClose={() => {
            if (!busy) {
              setForm(null);
              void load();
            }
          }}
        >
          <ListingComposer
            key={`${form.item?.id ?? "new"}-${form.session}`}
            compact={!!form.item}
            userId={userId}
            item={form.item}
            items={items.filter((item) => !item.moderated_at)}
            now={now}
            busy={busy}
            setBusy={setBusy}
            onSaved={saved}
            onCancel={() => {
              setForm(null);
              void load();
            }}
            onView={(item) => router.push(`/jelajahi?listing=${item.id}`)}
            onNew={() => setForm({ item: null, session: Date.now() })}
            onAccount={() => router.push("/partner/account")}
          />
        </Modal>
      )}
      {remove && (
        <Modal
          title={`Hapus ${remove.name}?`}
          onClose={() => {
            if (!busy) setRemove(null);
          }}
        >
          <form className={s.form} onSubmit={deleteListing}>
            <p>
              Listing dihapus dari peta, pencarian dan Kelola listing. Riwayat
              pesanan tetap disimpan. Tindakan ini tidak dapat dibatalkan.
            </p>
            {remove.has_active_orders && (
              <p className={s.error}>
                Masih ada pesanan aktif; penghapusan akan ditolak sampai pesanan
                ditangani.
              </p>
            )}
            <label className={s.row}>
              <input
                type="checkbox"
                required
                checked={understood}
                onChange={(e) => setUnderstood(e.target.checked)}
              />
              Saya paham tindakan ini permanen.
            </label>
            <div className={s.actions}>
              <button
                type="button"
                className={s.secondary}
                disabled={busy}
                onClick={() => setRemove(null)}
              >
                Batal
              </button>
              <button
                className={s.danger}
                disabled={busy || !understood || remove.has_active_orders}
              >
                Hapus permanen
              </button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  );
}
