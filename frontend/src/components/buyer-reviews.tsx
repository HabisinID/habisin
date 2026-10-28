"use client";

import { useEffect, useState } from "react";
import { Check, Pencil, Star, Trash2, X } from "lucide-react";
import { feedbackApi, type Review } from "@/lib/reviews";
import { ProfileSectionHeading, profileField, profilePrimary, profileSecondary } from "./profile-ui";

function reviewDate(value: string) {
  return new Date(value).toLocaleDateString("id-ID", {
    dateStyle: "medium",
    timeZone: "Asia/Jakarta",
  });
}

export default function BuyerReviewsSection() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  async function loadReviews() {
    setLoading(true);
    setError("");
    try {
      const result = await feedbackApi.mine();
      setReviews(result.reviews);
    } catch (reason) {
      setError((reason as Error).message || "Ulasan belum dapat dimuat.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    feedbackApi
      .mine()
      .then((result) => {
        if (active) setReviews(result.reviews);
      })
      .catch((reason) => {
        if (active) setError((reason as Error).message || "Ulasan belum dapat dimuat.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  function beginEdit(review: Review) {
    setEditingId(review.id);
    setRating(review.rating);
    setComment(review.comment);
    setDeletingId(null);
    setError("");
  }

  async function saveReview(review: Review) {
    setBusyId(review.id);
    setError("");
    try {
      const updated = await feedbackApi.updateReview(review.id, rating, comment.trim());
      setReviews((current) => current.map((item) => item.id === updated.id ? updated : item));
      setEditingId(null);
    } catch (reason) {
      setError((reason as Error).message || "Ulasan gagal disimpan.");
    } finally {
      setBusyId(null);
    }
  }

  async function deleteReview(review: Review) {
    setBusyId(review.id);
    setError("");
    try {
      await feedbackApi.deleteReview(review.id);
      setReviews((current) => current.filter((item) => item.id !== review.id));
      setDeletingId(null);
      if (editingId === review.id) setEditingId(null);
    } catch (reason) {
      setError((reason as Error).message || "Ulasan gagal dihapus.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="flex min-w-0 flex-col gap-5" aria-label="Ulasan saya">
      <ProfileSectionHeading
        letter="D"
        description="Lihat dan kelola ulasan makanan yang pernah kamu bagikan."
      >
        Ulasan saya
      </ProfileSectionHeading>

      {error && (
        <p className="rounded-lg bg-error-tint p-3 text-sm text-error" role="alert">
          {error}
        </p>
      )}
      {loading ? (
        <p className="text-sm text-muted" role="status">Memuat ulasan…</p>
      ) : reviews.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line p-6 text-center">
          <p className="font-semibold">Kamu belum menulis ulasan.</p>
          <p className="mt-1 text-sm text-muted">
            Setelah pesanan selesai diambil, ulasanmu akan muncul di sini.
          </p>
        </div>
      ) : (
        <ul className="space-y-4">
          {reviews.map((review) => {
            const editing = editingId === review.id;
            const confirmingDelete = deletingId === review.id;
            const busy = busyId === review.id;
            return (
              <li key={review.id} className="overflow-hidden rounded-xl border border-line bg-surface">
                <div className="p-4">
                  <div className="min-w-0 space-y-3">
                    <div>
                      <h3 className="font-bold">{review.listing_name}</h3>
                      <p className="text-sm text-muted">{review.store_name}</p>
                      <time className="mt-1 block text-xs text-muted" dateTime={review.created_at}>
                        {reviewDate(review.created_at)}{review.updated_at !== review.created_at ? " · diedit" : ""}
                      </time>
                    </div>

                    {editing ? (
                      <div className="space-y-3">
                        <div className="flex gap-1" role="group" aria-label="Ubah rating">
                          {[1, 2, 3, 4, 5].map((value) => (
                            <button
                              key={value}
                              type="button"
                              aria-label={`${value} bintang`}
                              aria-pressed={rating === value}
                              disabled={busy}
                              onClick={() => setRating(value)}
                              className="rounded p-1 text-yellow hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-brand disabled:opacity-50"
                            >
                              <Star size={22} fill={value <= rating ? "currentColor" : "var(--color-surface-2)"} strokeWidth={0} />
                            </button>
                          ))}
                        </div>
                        <label className="block space-y-2 text-sm font-semibold">
                          Ulasan
                          <textarea
                            className={profileField}
                            rows={3}
                            maxLength={1000}
                            value={comment}
                            disabled={busy}
                            onChange={(event) => setComment(event.target.value)}
                          />
                        </label>
                        <div className="flex flex-wrap gap-2">
                          <button type="button" className={profilePrimary} disabled={busy} onClick={() => void saveReview(review)}>
                            <Check size={16} /> {busy ? "Menyimpan…" : "Simpan perubahan"}
                          </button>
                          <button type="button" className={profileSecondary} disabled={busy} onClick={() => setEditingId(null)}>
                            <X size={16} /> Batal
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-2 text-sm" aria-label={`Rating ${review.rating} dari 5`}>
                          <span className="flex text-yellow" aria-hidden="true">
                            {Array.from({ length: 5 }, (_, index) => (
                              <Star key={index} size={16} fill={index < review.rating ? "currentColor" : "var(--color-surface-2)"} strokeWidth={0} />
                            ))}
                          </span>
                          <span className="font-semibold">{review.rating}/5</span>
                        </div>
                        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-muted">
                          {review.comment || "Kamu tidak menambahkan komentar."}
                        </p>
                        {!confirmingDelete ? (
                          <div className="flex flex-wrap gap-2">
                            <button type="button" className={profileSecondary} onClick={() => beginEdit(review)}>
                              <Pencil size={15} /> Edit ulasan
                            </button>
                            <button
                              type="button"
                              className="inline-flex min-h-11 items-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold text-error hover:bg-error-tint"
                              onClick={() => setDeletingId(review.id)}
                            >
                              <Trash2 size={15} /> Hapus
                            </button>
                          </div>
                        ) : (
                          <div className="rounded-lg border border-error/30 bg-error-tint p-3">
                            <p className="text-sm font-semibold">Hapus ulasan ini?</p>
                            <div className="mt-3 flex gap-2">
                              <button type="button" className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-error px-3 py-2 text-sm font-bold text-on-error" disabled={busy} onClick={() => void deleteReview(review)}>
                                <Trash2 size={15} /> {busy ? "Menghapus…" : "Ya, hapus"}
                              </button>
                              <button type="button" className={profileSecondary} disabled={busy} onClick={() => setDeletingId(null)}>
                                Batal
                              </button>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {!loading && error && (
        <button type="button" className={profileSecondary} onClick={() => void loadReviews()}>
          Coba lagi
        </button>
      )}
    </section>
  );
}
