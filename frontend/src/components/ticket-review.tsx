"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Flag, Star } from "lucide-react";
import type { Reservation } from "@/lib/api";
import { feedbackApi, type ReservationFeedback } from "@/lib/reviews";
import { errorClass, primaryButton } from "./store-ui";

// Quick notes from the design; the chosen ones become the review comment.
const CHIPS = ["Masih segar", "Porsi sesuai", "Kasir ramah", "Sesuai foto"];
const COMPLAINT_STATUS = {
  open: "menunggu ditinjau",
  reviewed: "sedang ditinjau",
  resolved: "selesai ditangani",
};

// Modul 8, after pickup: "Bagaimana …?" asks for stars and quick notes, saved
// through the review API (Modul 9), with a link to report a problem.
export default function TicketReview({ order }: { order: Reservation }) {
  const [feedback, setFeedback] = useState<ReservationFeedback | null>(null);
  const [rating, setRating] = useState(0);
  const [chips, setChips] = useState<string[]>([]);
  const [state, setState] = useState<"asking" | "sending" | "sent" | "later">(
    "asking",
  );
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    feedbackApi
      .reservationFeedback(order.id)
      .then((data) => active && setFeedback(data))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [order.id]);

  if (!feedback) return null;
  const { listing } = order;

  async function send() {
    setState("sending");
    setError("");
    try {
      await feedbackApi.createReview(order.id, rating, chips.join(", "));
      setState("sent");
    } catch (e) {
      setError((e as Error).message);
      setState("asking");
    }
  }

  const toggle = (chip: string) =>
    setChips((chosen) =>
      chosen.includes(chip)
        ? chosen.filter((c) => c !== chip)
        : CHIPS.filter((c) => c === chip || chosen.includes(c)),
    );

  return (
    <div className="mt-8 space-y-6">
      {state === "sent" || feedback.review ? (
        <p className="rounded-control bg-surface-2 p-4 text-sm" role="status">
          {state === "sent"
            ? "Terima kasih! Ulasanmu sudah tersimpan."
            : "Ulasanmu sudah tersimpan."}{" "}
          <Link
            href={`/ulasan/${listing.id}`}
            className="font-bold text-brand underline-offset-4 hover:underline"
          >
            Ubah ulasan
          </Link>
        </p>
      ) : !feedback.can_review ? null : state === "later" ? (
        <p className="text-sm text-muted">
          Kamu bisa mengulas nanti dari Pesanan saya.
        </p>
      ) : (
        <section aria-labelledby="review-title" className="space-y-4">
          <div>
            <h2 id="review-title" className="text-lg font-bold">
              Bagaimana {listing.name}?
            </h2>
            <p className="mt-1 text-sm text-muted">
              Ulasanmu tampil di halaman {listing.store} dan membantu pembeli
              lain.
            </p>
          </div>
          <fieldset className="flex gap-1">
            <legend className="sr-only">Rating</legend>
            {[1, 2, 3, 4, 5].map((n) => (
              <label key={n} className="relative cursor-pointer p-1">
                <input
                  type="radio"
                  name="rating"
                  value={n}
                  aria-label={`${n} bintang`}
                  checked={rating === n}
                  onChange={() => setRating(n)}
                  className="peer absolute inset-0 cursor-pointer opacity-0"
                />
                <Star
                  size={28}
                  aria-hidden="true"
                  className={`rounded-sm text-urgency-text peer-focus-visible:outline-3 peer-focus-visible:outline-brand ${n <= rating ? "fill-yellow" : ""}`}
                />
              </label>
            ))}
          </fieldset>
          <div className="flex flex-wrap gap-2">
            {CHIPS.map((chip) => (
              <button
                key={chip}
                type="button"
                aria-pressed={chips.includes(chip)}
                onClick={() => toggle(chip)}
                className="min-h-11 rounded-full border border-border px-4 text-sm font-semibold aria-pressed:border-brand aria-pressed:bg-light aria-pressed:text-brand"
              >
                {chip}
              </button>
            ))}
          </div>
          {error && (
            <p className={errorClass} role="alert">
              {error}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-4">
            <button
              className={primaryButton}
              disabled={!rating || state === "sending"}
              onClick={send}
            >
              Kirim ulasan
            </button>
            <button
              className="min-h-11 px-2 font-semibold"
              onClick={() => setState("later")}
            >
              Nanti saja
            </button>
          </div>
        </section>
      )}

      {(feedback.can_complain || feedback.complaint) && (
        <p className="flex flex-wrap items-center gap-2 border-t border-line pt-4 text-sm text-muted">
          Makanan tidak layak atau ada masalah?
          {feedback.can_complain ? (
            <Link
              href={`/komplain/${order.id}`}
              className="inline-flex items-center gap-1.5 font-bold text-dark underline-offset-4 hover:underline"
            >
              <Flag size={16} aria-hidden="true" />
              Laporkan masalah
            </Link>
          ) : (
            <span>
              Laporanmu {COMPLAINT_STATUS[feedback.complaint!.status]}.
            </span>
          )}
        </p>
      )}
    </div>
  );
}
