"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Star } from "lucide-react";
import { pickup, rupiah, type Reservation } from "@/lib/api";
import {
  feedbackApi,
  type ComplaintReason,
  type ReservationFeedback,
  type ReviewEligibility,
} from "@/lib/reviews";
import ListingImage from "./listing-image";
import {
  errorClass,
  fieldClass,
  primaryButton,
  secondaryButton,
} from "./store-ui";

const complaintReasons: { value: ComplaintReason; label: string }[] = [
  { value: "hygiene", label: "Masalah kebersihan" },
  { value: "freshness", label: "Makanan basi atau tidak segar" },
  { value: "mismatch", label: "Makanan tidak sesuai pesanan" },
  { value: "other", label: "Masalah lainnya" },
];

function FeedbackFrame({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto max-w-5xl px-6 py-10 tablet:px-4 tablet:py-6">
      <div className="mb-6">
        <Link href="/pesanan" className="text-sm font-semibold text-brand hover:underline">
          ← Kembali ke pesanan saya
        </Link>
        <p className="mt-5 text-xs font-bold tracking-[0.18em] text-brand">
          HABISIN · PENGALAMAN PEMBELI
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight tablet:text-2xl">
          {title}
        </h1>
      </div>
      {children}
    </main>
  );
}

function ItemSummary({
  name,
  store,
  image,
  price,
  details,
}: {
  name: string;
  store: string;
  image: string;
  price: number;
  details: React.ReactNode;
}) {
  return (
    <aside className="h-fit overflow-hidden rounded-2xl border border-line bg-surface">
      <div className="aspect-[16/10] bg-surface-2">
        {image ? (
          <ListingImage src={image} alt={name} />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted">
            Foto makanan tidak tersedia
          </div>
        )}
      </div>
      <div className="space-y-3 p-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-brand">
          Rincian pesanan
        </p>
        <div>
          <h2 className="text-lg font-bold">{name}</h2>
          <p className="text-sm text-muted">{store}</p>
        </div>
        <div className="space-y-2 border-t border-line pt-3 text-sm text-muted">
          {details}
        </div>
        <p className="border-t border-line pt-3 font-bold text-dark">
          {rupiah(price)}
        </p>
      </div>
    </aside>
  );
}

export function ReviewFormPage({ listingId }: { listingId: string }) {
  const [data, setData] = useState<ReviewEligibility | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");

  useEffect(() => {
    let active = true;
    feedbackApi
      .eligibility(listingId)
      .then((result) => {
        if (!active) return;
        setData(result);
        setRating(result.review?.rating ?? 5);
        setComment(result.review?.comment ?? "");
      })
      .catch((reason) => {
        if (active) setError((reason as Error).message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [listingId]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!data) return;
    setBusy(true);
    setError("");
    try {
      const review = data.review
        ? await feedbackApi.updateReview(data.review.id, rating, comment.trim())
        : data.reservation_id
          ? await feedbackApi.createReview(data.reservation_id, rating, comment.trim())
          : null;
      if (!review) throw new Error("Pesanan yang sudah diambil tidak ditemukan.");
      setData({ ...data, can_review: false, review });
      setSaved(true);
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function deleteReview() {
    if (!data?.review) return;
    setBusy(true);
    setError("");
    try {
      await feedbackApi.deleteReview(data.review.id);
      setData({ ...data, review: null, can_review: data.reservation_id !== null });
      setConfirmDelete(false);
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (loading)
    return (
      <FeedbackFrame title="Tulis ulasan">
        <p role="status" className="text-sm text-muted">Memuat rincian produk…</p>
      </FeedbackFrame>
    );
  if (error && !data)
    return (
      <FeedbackFrame title="Tulis ulasan">
        <p role="alert" className={errorClass}>{error}</p>
      </FeedbackFrame>
    );
  if (!data) return null;

  const reviewExists = Boolean(data.review);
  const eligible = data.can_review || reviewExists;
  return (
    <FeedbackFrame title={saved ? "Ulasan tersimpan" : reviewExists ? "Edit ulasan" : "Tulis ulasan"}>
      <div className="grid grid-cols-[minmax(250px,0.8fr)_minmax(0,1.2fr)] gap-8 tablet:grid-cols-1">
        <ItemSummary
          name={data.listing.name}
          store={data.listing.store}
          image={data.listing.image}
          price={data.listing.price}
          details={
            <>
              <p>Produk yang sudah kamu ambil</p>
              <p>Batas pengambilan: {pickup(data.listing.pickup_end)} WIB</p>
            </>
          }
        />
        <section className="rounded-2xl border border-line bg-surface p-7 tablet:p-5">
          {saved ? (
            <div className="space-y-4" role="status">
              <CheckCircle2 size={36} className="text-brand" />
              <h2 className="text-xl font-bold">Terima kasih atas ulasanmu!</h2>
              <p className="text-sm leading-relaxed text-muted">
                Ulasanmu membantu pembeli lain memilih makanan dan membantu toko meningkatkan layanannya.
              </p>
              <Link className={primaryButton} href="/pesanan">Kembali ke pesanan</Link>
            </div>
          ) : !eligible ? (
            <div className="space-y-4">
              <h2 className="text-xl font-bold">Ulasan belum tersedia</h2>
              <p className="text-sm leading-relaxed text-muted">
                Kamu bisa mengulas makanan ini setelah pesananmu selesai diambil. Setiap pembeli hanya dapat memiliki satu ulasan untuk produk yang sama.
              </p>
              <Link className={secondaryButton} href="/pesanan">Lihat pesanan saya</Link>
            </div>
          ) : (
            <form className="space-y-6" onSubmit={submit}>
              <div>
                <h2 className="text-xl font-bold">{data.listing.name}</h2>
                <p className="mt-1 text-sm text-muted">Bagaimana pengalamanmu?</p>
              </div>
              <fieldset className="space-y-2">
                <legend className="text-sm font-semibold">Beri rating</legend>
                <div className="flex gap-2" role="group" aria-label="Pilih rating bintang">
                  {[1, 2, 3, 4, 5].map((value) => (
                    <button
                      key={value}
                      type="button"
                      aria-label={`${value} bintang`}
                      aria-pressed={rating === value}
                      onClick={() => setRating(value)}
                      className="rounded-lg p-2 text-warning hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
                    >
                      <Star size={30} fill={value <= rating ? "currentColor" : "none"} />
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted">{rating} dari 5 bintang</p>
              </fieldset>
              <label className="block space-y-2 text-sm font-semibold">
                Ceritakan pengalamanmu <span className="font-normal text-muted">(opsional)</span>
                <textarea
                  className={fieldClass}
                  rows={6}
                  maxLength={1000}
                  placeholder="Apa yang kamu suka dari makanan ini?"
                  value={comment}
                  onChange={(event) => setComment(event.target.value)}
                />
                <span className="block text-right text-xs font-normal text-muted">{comment.length}/1000</span>
              </label>
              {error && <p className={errorClass} role="alert">{error}</p>}
              <div className="flex flex-wrap gap-3">
                <button className={primaryButton} type="submit" disabled={busy}>
                  {busy ? "Menyimpan…" : reviewExists ? "Simpan perubahan" : "Kirim ulasan"}
                </button>
                <Link className={secondaryButton} href="/pesanan">Batal</Link>
                {reviewExists && (
                  <button
                    className="min-h-12 px-4 font-semibold text-error underline-offset-4 hover:underline"
                    type="button"
                    disabled={busy}
                    onClick={() => setConfirmDelete(true)}
                  >
                    Hapus ulasan
                  </button>
                )}
              </div>
              {confirmDelete && (
                <div className="rounded-xl border border-error/30 bg-error-tint p-4" role="group" aria-label="Konfirmasi hapus ulasan">
                  <p className="text-sm font-semibold">Hapus ulasan untuk produk ini?</p>
                  <div className="mt-3 flex gap-2">
                    <button className="min-h-11 rounded-control bg-error px-4 font-bold text-on-error" type="button" disabled={busy} onClick={() => void deleteReview()}>
                      {busy ? "Menghapus…" : "Ya, hapus"}
                    </button>
                    <button className={secondaryButton} type="button" disabled={busy} onClick={() => setConfirmDelete(false)}>
                      Batal
                    </button>
                  </div>
                </div>
              )}
              <p className="text-xs leading-relaxed text-muted">
                Ulasan hanya dapat dibuat satu kali untuk produk ini. Setelah dikirim, kamu masih bisa mengeditnya.
              </p>
            </form>
          )}
        </section>
      </div>
    </FeedbackFrame>
  );
}

export function ComplaintFormPage({ reservationId }: { reservationId: string }) {
  const [order, setOrder] = useState<Reservation | null>(null);
  const [feedback, setFeedback] = useState<ReservationFeedback | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [reason, setReason] = useState<ComplaintReason>("hygiene");
  const [description, setDescription] = useState("");

  useEffect(() => {
    let active = true;
    Promise.all([
      feedbackApi.reservation(reservationId),
      feedbackApi.reservationFeedback(reservationId),
    ])
      .then(([orderData, feedbackData]) => {
        if (!active) return;
        setOrder(orderData);
        setFeedback(feedbackData);
        if (feedbackData.complaint) {
          setReason(feedbackData.complaint.reason);
          setDescription(feedbackData.complaint.description);
        }
      })
      .catch((problem) => {
        if (active) setError((problem as Error).message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [reservationId]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const complaint = await feedbackApi.createComplaint(
        Number(reservationId),
        reason,
        description.trim(),
      );
      setFeedback((current) => current ? { ...current, can_complain: false, complaint } : current);
      setSent(true);
    } catch (problem) {
      setError((problem as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (loading)
    return (
      <FeedbackFrame title="Laporkan masalah">
        <p role="status" className="text-sm text-muted">Memuat rincian pesanan…</p>
      </FeedbackFrame>
    );
  if (error && !order)
    return (
      <FeedbackFrame title="Laporkan masalah">
        <p role="alert" className={errorClass}>{error}</p>
      </FeedbackFrame>
    );
  if (!order || !feedback) return null;

  const existing = feedback.complaint;
  const canSubmit = feedback.can_complain && !existing;
  const complete = sent || Boolean(existing);
  return (
    <FeedbackFrame title={complete ? "Laporan terkirim" : "Laporkan masalah"}>
      <div className="grid grid-cols-[minmax(250px,0.8fr)_minmax(0,1.2fr)] gap-8 tablet:grid-cols-1">
        <ItemSummary
          name={order.listing.name}
          store={order.listing.store}
          image={order.listing.image}
          price={order.total}
          details={
            <>
              <p>{order.quantity} porsi</p>
              <p>Kode pesanan: {order.code}</p>
              <p>Batas pengambilan: {pickup(order.listing.pickup_end)} WIB</p>
            </>
          }
        />
        <section className="rounded-2xl border border-line bg-surface p-7 tablet:p-5">
          {complete ? (
            <div className="space-y-4" role="status">
              <CheckCircle2 size={36} className="text-brand" />
              <h2 className="text-xl font-bold">Laporanmu sudah diterima</h2>
              <p className="text-sm leading-relaxed text-muted">
                Tim HABISIN akan meninjau laporan ini. Terima kasih sudah membantu menjaga keamanan makanan.
              </p>
              <div className="rounded-xl bg-surface-2 p-4 text-sm">
                <strong>{complaintReasons.find((item) => item.value === (existing?.reason ?? reason))?.label}</strong>
                <p className="mt-1 whitespace-pre-wrap text-muted">{existing?.description ?? description}</p>
              </div>
              <Link className={primaryButton} href="/pesanan">Kembali ke pesanan</Link>
            </div>
          ) : !canSubmit ? (
            <div className="space-y-4">
              <h2 className="text-xl font-bold">Laporan belum tersedia</h2>
              <p className="text-sm leading-relaxed text-muted">
                Laporan hanya dapat dikirim untuk pesanan yang masih dibayar atau sudah diambil, dan satu laporan dapat dibuat untuk setiap pesanan.
              </p>
              <Link className={secondaryButton} href="/pesanan">Lihat pesanan saya</Link>
            </div>
          ) : (
            <form className="space-y-6" onSubmit={submit}>
              <div>
                <h2 className="text-xl font-bold">Apa masalah yang kamu alami?</h2>
                <p className="mt-1 text-sm text-muted">Pilih kategori dan jelaskan detailnya.</p>
              </div>
              <fieldset className="grid gap-2">
                <legend className="mb-2 text-sm font-semibold">Kategori laporan</legend>
                {complaintReasons.map((option) => (
                  <label
                    className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 text-sm transition-colors ${reason === option.value ? "border-brand bg-light text-dark" : "border-line hover:bg-surface-2"}`}
                    key={option.value}
                  >
                    <input
                      className="accent-[var(--color-brand)]"
                      type="radio"
                      name="reason"
                      value={option.value}
                      checked={reason === option.value}
                      onChange={() => setReason(option.value)}
                    />
                    {option.label}
                  </label>
                ))}
              </fieldset>
              <label className="block space-y-2 text-sm font-semibold">
                Detail masalah
                <textarea
                  className={fieldClass}
                  rows={5}
                  minLength={10}
                  maxLength={2000}
                  required
                  placeholder="Ceritakan apa yang terjadi agar kami bisa menindaklanjuti laporanmu."
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                />
                <span className="block text-right text-xs font-normal text-muted">{description.length}/2000</span>
              </label>
              {error && <p className={errorClass} role="alert">{error}</p>}
              <div className="flex flex-wrap gap-3">
                <button className={primaryButton} type="submit" disabled={busy}>
                  {busy ? "Mengirim…" : "Kirim laporan"}
                </button>
                <Link className={secondaryButton} href="/pesanan">Batal</Link>
              </div>
              <p className="text-xs leading-relaxed text-muted">
                Laporan hanya dapat dilihat oleh tim HABISIN dan akan ditinjau secara pribadi.
              </p>
            </form>
          )}
        </section>
      </div>
    </FeedbackFrame>
  );
}
