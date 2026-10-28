"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Star } from "lucide-react";
import type { User } from "@/lib/api";
import {
  feedbackApi,
  type ReviewEligibility,
  type StoreReviews,
} from "@/lib/reviews";
import { primaryButton } from "./store-ui";
import RatingOverview, { sortReviews, type ReviewSort } from "./rating-overview";

export default function ProductReviewPrompt({
  listingId,
  storeId,
  user,
}: {
  listingId: number;
  storeId: number | null;
  user: User | null;
}) {
  const [eligibility, setEligibility] = useState<ReviewEligibility | null>(null);
  const [storeReviews, setStoreReviews] = useState<StoreReviews | null>(null);
  const [visibleCount, setVisibleCount] = useState(4);
  const [sort, setSort] = useState<ReviewSort>("newest");

  useEffect(() => {
    let active = true;
    if (storeId !== null) {
      feedbackApi
        .store(storeId)
        .then((data) => {
          if (active) setStoreReviews(data);
        })
        .catch(() => {
          if (active) setStoreReviews(null);
        });
    }
    if (user?.role === "buyer") {
      feedbackApi
        .eligibility(listingId)
        .then((data) => {
          if (active) setEligibility(data);
        })
        .catch(() => {
          if (active) setEligibility(null);
        });
    }
    return () => {
      active = false;
    };
  }, [listingId, storeId, user?.role]);

  const productReviews = storeReviews?.reviews.filter(
    (review) => review.listing_id === listingId,
  ) ?? [];
  return (
    <div className="space-y-3">
      {productReviews.length ? (
        <>
          <RatingOverview
            reviews={productReviews}
            sort={sort}
            onSortChange={(value) => {
              setSort(value);
              setVisibleCount(4);
            }}
          />
          <ul className="space-y-2">
          {sortReviews(productReviews, sort).slice(0, visibleCount).map((review) => (
            <li className="rounded-lg bg-surface-2 p-3 text-sm" key={review.id}>
              <div className="flex items-center justify-between gap-2">
                <strong>{review.user_name || "Pembeli HABISIN"}</strong>
                <span className="flex items-center gap-1">
                  <Star size={13} fill="currentColor" strokeWidth={0} className="text-yellow" />
                  {review.rating}/5
                </span>
              </div>
              {review.comment && (
                <p className="mt-1 whitespace-pre-wrap text-muted">{review.comment}</p>
              )}
              <time
                className="mt-2 block text-xs text-muted"
                dateTime={review.created_at}
              >
                {new Date(review.created_at).toLocaleDateString("id-ID", {
                  dateStyle: "medium",
                  timeZone: "Asia/Jakarta",
                })}
              </time>
            </li>
          ))}
          </ul>
        </>
      ) : (
        <p className="text-sm text-muted">Belum ada ulasan untuk makanan ini.</p>
      )}
      {productReviews.length > visibleCount && (
        <button
          className="text-sm font-semibold text-brand underline-offset-4 hover:underline"
          onClick={() => setVisibleCount((count) => count + 4)}
        >
          Lihat ulasan lainnya
        </button>
      )}
      {user?.role === "buyer" &&
        (eligibility?.can_review || eligibility?.review) && (
          <div className="rounded-xl border border-brand/20 bg-light p-4">
            <p className="text-sm font-semibold">
              {eligibility.review
                ? "Kamu sudah mengulas makanan ini."
                : "Sudah mengambil makanan ini? Bagikan pengalamanmu."}
            </p>
            <Link className={`${primaryButton} mt-3`} href={`/ulasan/${listingId}`}>
              {eligibility.review ? "Edit ulasan" : "Tulis ulasan produk"}
            </Link>
          </div>
        )}
    </div>
  );
}
