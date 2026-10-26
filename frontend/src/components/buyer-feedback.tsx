"use client";

import { useCallback, useEffect, useState } from "react";
import { Star } from "lucide-react";
import type { Reservation } from "@/lib/api";
import { feedbackApi, type Complaint, type Review } from "@/lib/reviews";
import {
  errorClass,
  fieldClass,
  primaryButton,
  secondaryButton,
} from "./store-ui";

const complaintStatus: Record<Complaint["status"], string> = {
  open: "Menunggu ditinjau",
  reviewed: "Sedang ditinjau",
  resolved: "Selesai ditangani",
};

export default function BuyerFeedback({ orders }: { orders: Reservation[] }) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [reviewOrder, setReviewOrder] = useState<number | null>(null);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState("");
  const [complaintOrder, setComplaintOrder] = useState<number | null>(null);
  const [complaintDescription, setComplaintDescription] = useState("");

  const load = useCallback(async () => {
    setLoadError("");
    try {
      const data = await feedbackApi.mine();
      setReviews(data.reviews);
      setComplaints(data.complaints);
    } catch (reason) {
      setLoadError((reason as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function openReview(orderId: number) {
    const existing = reviews.find(
      (review) => review.reservation_id === orderId,
    );
    setReviewOrder(orderId);
    setReviewRating(existing?.rating ?? 5);
    setReviewComment(existing?.comment ?? "");
    setError("");
    setNotice("");
  }

  async function submitReview(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (reviewOrder === null) return;
    setBusy(true);
    setError("");
    try {
      const existing = reviews.find(
        (review) => review.reservation_id === reviewOrder,
      );
      if (existing)
        await feedbackApi.updateReview(
          existing.id,
          reviewRating,
          reviewComment.trim(),
        );
      else
        await feedbackApi.createReview(
          reviewOrder,
          reviewRating,
          reviewComment.trim(),
        );
      setReviewOrder(null);
      setNotice("Ulasan berhasil disimpan.");
      await load();
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function deleteReview(review: Review) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await feedbackApi.deleteReview(review.id);
      setNotice("Ulasan berhasil dihapus.");
      await load();
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function submitComplaint(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (complaintOrder === null) return;
    setBusy(true);
    setError("");
    try {
      await feedbackApi.createComplaint(
        complaintOrder,
        complaintDescription.trim(),
      );
      setComplaintOrder(null);
      setComplaintDescription("");
      setNotice("Laporan berhasil dikirim.");
      await load();
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const eligibleOrders = orders.filter(
    (order) => order.status === "paid" || order.status === "picked_up",
  );
  if (!eligibleOrders.length) return null;

  return (
    <section aria-labelledby="feedback-title" className="mt-5 space-y-3">
      <h3 id="feedback-title" className="font-bold">
        Ulasan dan laporan makanan
      </h3>
      {loading ? (
        <p role="status" className="text-xs text-muted">
          Memuat ulasan dan laporan…
        </p>
      ) : loadError ? (
        <div className="space-y-2">
          <p role="alert" className={errorClass}>
            {loadError}
          </p>
          <button className={secondaryButton} onClick={() => void load()}>
            Muat ulang
          </button>
        </div>
      ) : (
        <ul className="space-y-3">
          {eligibleOrders.map((order) => {
            const review = reviews.find(
              (item) => item.reservation_id === order.id,
            );
            const complaint = complaints.find(
              (item) => item.reservation_id === order.id,
            );
            const canReview = order.status === "picked_up";
            return (
              <li
                key={order.id}
                className="space-y-3 rounded-xl border border-line bg-surface p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <strong className="text-sm">{order.listing.name}</strong>
                    <p className="text-xs text-muted">{order.listing.store}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {canReview && (
                      <button
                        className={secondaryButton}
                        disabled={busy}
                        onClick={() => openReview(order.id)}
                      >
                        {review ? "Edit ulasan" : "Beri ulasan"}
                      </button>
                    )}
                    {!complaint && (
                      <button
                        className={secondaryButton}
                        disabled={busy}
                        onClick={() => {
                          setComplaintOrder(order.id);
                          setComplaintDescription("");
                          setError("");
                          setNotice("");
                        }}
                      >
                        Laporkan masalah
                      </button>
                    )}
                  </div>
                </div>
                {review && (
                  <div className="rounded-lg bg-white p-3 text-sm">
                    <p className="font-semibold">Rating {review.rating}/5</p>
                    {review.comment && (
                      <p className="mt-1 whitespace-pre-wrap text-muted">
                        {review.comment}
                      </p>
                    )}
                    <button
                      className="mt-2 text-xs font-semibold text-error"
                      disabled={busy}
                      onClick={() => void deleteReview(review)}
                    >
                      Hapus ulasan
                    </button>
                  </div>
                )}
                {complaint && (
                  <p className="rounded-lg bg-white p-3 text-xs text-muted">
                    Laporan makanan: {complaintStatus[complaint.status]}.
                  </p>
                )}
                {reviewOrder === order.id && (
                  <form
                    className="space-y-3 rounded-lg bg-white p-3"
                    onSubmit={submitReview}
                  >
                    <fieldset className="space-y-1">
                      <legend className="text-sm font-semibold">
                        Rating: {reviewRating} dari 5 bintang
                      </legend>
                      <div className="flex gap-1" role="group" aria-label="Pilih rating">
                        {[1, 2, 3, 4, 5].map((rating) => (
                          <button
                            aria-label={`${rating} bintang`}
                            aria-pressed={reviewRating === rating}
                            className="rounded p-1 text-amber-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
                            key={rating}
                            onClick={() => setReviewRating(rating)}
                            type="button"
                          >
                            <Star
                              fill={rating <= reviewRating ? "currentColor" : "none"}
                              size={24}
                            />
                          </button>
                        ))}
                      </div>
                    </fieldset>
                    <label className="block space-y-1 text-sm font-semibold">
                      Ulasan (opsional)
                      <textarea
                        className={fieldClass}
                        maxLength={1000}
                        rows={3}
                        value={reviewComment}
                        onChange={(event) =>
                          setReviewComment(event.target.value)
                        }
                      />
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <button
                        className={primaryButton}
                        disabled={busy}
                        type="submit"
                      >
                        {busy ? "Menyimpan…" : "Simpan ulasan"}
                      </button>
                      <button
                        className={secondaryButton}
                        disabled={busy}
                        type="button"
                        onClick={() => setReviewOrder(null)}
                      >
                        Batal
                      </button>
                    </div>
                  </form>
                )}
                {complaintOrder === order.id && (
                  <form
                    className="space-y-3 rounded-lg bg-white p-3"
                    onSubmit={submitComplaint}
                  >
                    <label className="block space-y-1 text-sm font-semibold">
                      Ceritakan masalah makanan (minimal 10 karakter)
                      <textarea
                        className={fieldClass}
                        minLength={10}
                        maxLength={2000}
                        required
                        rows={4}
                        value={complaintDescription}
                        onChange={(event) =>
                          setComplaintDescription(event.target.value)
                        }
                      />
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <button
                        className={primaryButton}
                        disabled={busy}
                        type="submit"
                      >
                        {busy ? "Mengirim…" : "Kirim laporan"}
                      </button>
                      <button
                        className={secondaryButton}
                        disabled={busy}
                        type="button"
                        onClick={() => setComplaintOrder(null)}
                      >
                        Batal
                      </button>
                    </div>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {error && (
        <p className={errorClass} role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="rounded-lg bg-light p-3 text-sm text-brand" role="status">
          {notice}
        </p>
      )}
    </section>
  );
}
