"use client";

import { useEffect, useState } from "react";
import { Star } from "lucide-react";
import {
  feedbackApi,
  type StoreReviews as StoreReviewsData,
} from "@/lib/reviews";

export default function StoreReviews({
  storeId,
}: {
  storeId: number | string;
}) {
  const [data, setData] = useState<StoreReviewsData | null>(null);
  const [error, setError] = useState("");
  const [visibleCount, setVisibleCount] = useState(4);

  useEffect(() => {
    let active = true;
    feedbackApi
      .store(storeId)
      .then((result) => {
        if (active) setData(result);
      })
      .catch((reason) => {
        if (active) setError((reason as Error).message);
      });
    return () => {
      active = false;
    };
  }, [storeId]);

  return (
    <section aria-labelledby="store-reviews-title" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="store-reviews-title" className="text-xl font-bold">
          Ulasan pembeli
        </h2>
        {data && (
          <p className="flex items-center gap-1.5 text-sm text-muted">
            <Star size={17} fill="currentColor" strokeWidth={0} className="text-yellow" />
            <strong className="text-dark">
              {data.average_rating === null
                ? "Belum ada rating"
                : data.average_rating.toFixed(2)}
            </strong>
            <span>· {data.review_count} ulasan</span>
          </p>
        )}
      </div>
      {error ? (
        <p className="text-sm text-muted" role="status">
          Ulasan belum dapat dimuat: {error}
        </p>
      ) : !data ? (
        <p className="text-sm text-muted" role="status">
          Memuat ulasan…
        </p>
      ) : data.reviews.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line p-5 text-sm text-muted">
          Belum ada ulasan untuk toko ini.
        </p>
      ) : (
        <ul className="divide-y divide-line rounded-xl border border-line">
          {data.reviews.slice(0, visibleCount).map((review) => (
            <li className="space-y-2 p-4" key={review.id}>
              <div className="flex items-center justify-between gap-3">
                <strong className="text-sm">
                  {review.user_name || "Pembeli HABISIN"}
                </strong>
                <span
                  className="flex items-center gap-1 text-sm font-semibold"
                  aria-label={`${review.rating} dari 5 bintang`}
                >
                  <Star
                    size={15}
                    fill="currentColor"
                    strokeWidth={0}
                    className="text-yellow"
                  />
                  {review.rating}/5
                </span>
              </div>
              <p className="text-xs font-semibold text-brand">
                Produk: {review.listing_name}
              </p>
              {review.comment && (
                <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-muted">
                  {review.comment}
                </p>
              )}
              <time
                className="block text-xs text-muted"
                dateTime={review.created_at}
              >
                {new Date(review.created_at).toLocaleDateString("id-ID", {
                  dateStyle: "medium",
                  timeZone: "Asia/Jakarta",
                })}
                {review.updated_at !== review.created_at ? " · diedit" : ""}
              </time>
            </li>
          ))}
        </ul>
      )}
      {data && data.reviews.length > visibleCount && (
        <button
          className="text-sm font-semibold text-brand underline-offset-4 hover:underline"
          onClick={() => setVisibleCount((count) => count + 4)}
        >
          Lihat ulasan lainnya
        </button>
      )}
    </section>
  );
}
