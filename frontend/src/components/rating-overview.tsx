"use client";

import { Star } from "lucide-react";

export type ReviewSort = "newest" | "highest" | "lowest";

type RatedReview = {
  rating: number;
  created_at: string;
};

export function sortReviews<T extends RatedReview>(reviews: T[], sort: ReviewSort) {
  return [...reviews].sort((a, b) => {
    if (sort === "highest" && a.rating !== b.rating) return b.rating - a.rating;
    if (sort === "lowest" && a.rating !== b.rating) return a.rating - b.rating;
    return Date.parse(b.created_at) - Date.parse(a.created_at);
  });
}

export default function RatingOverview({
  reviews,
  sort,
  onSortChange,
}: {
  reviews: RatedReview[];
  sort: ReviewSort;
  onSortChange: (sort: ReviewSort) => void;
}) {
  const total = reviews.length;
  const average = total
    ? reviews.reduce((sum, review) => sum + review.rating, 0) / total
    : null;
  const counts = [5, 4, 3, 2, 1].map(
    (rating) => reviews.filter((review) => review.rating === rating).length,
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-[minmax(115px,0.55fr)_minmax(0,1.45fr)] items-center gap-6 rounded-xl bg-surface p-5 mobile:grid-cols-1 mobile:gap-4">
        <div className="text-center mobile:text-left">
          <p className="text-5xl font-extrabold leading-none tracking-tight">
            {average === null ? "—" : average.toFixed(1).replace(".", ",")}
          </p>
          <div className="mt-2 flex justify-center text-yellow mobile:justify-start" aria-hidden="true">
            {[1, 2, 3, 4, 5].map((rating) => (
              <Star
                key={rating}
                size={18}
                fill={average !== null && rating <= Math.round(average) ? "currentColor" : "var(--color-surface-2)"}
                strokeWidth={0}
              />
            ))}
          </div>
          <p className="mt-1 text-xs text-muted">dari {total} ulasan</p>
        </div>

        <div className="space-y-2" aria-label="Sebaran rating">
          {counts.map((count, index) => {
            const rating = 5 - index;
            const percentage = total ? (count / total) * 100 : 0;
            return (
              <div
                key={rating}
                className="grid grid-cols-[16px_16px_minmax(0,1fr)_28px] items-center gap-2 text-xs text-muted"
                aria-label={`${rating} bintang: ${count} ulasan`}
              >
                <span className="text-right font-semibold text-dark">{rating}</span>
                <Star size={14} className="text-brand" aria-hidden="true" />
                <span className="h-2 overflow-hidden rounded-full bg-surface-2">
                  <span
                    className="block h-full rounded-full bg-brand"
                    style={{ width: `${percentage}%` }}
                  />
                </span>
                <span className="text-right tabular-nums">{count}</span>
              </div>
            );
          })}
        </div>
      </div>

      {total > 0 && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Urutkan ulasan">
          {([
            ["newest", "Terbaru"],
            ["highest", "Rating tertinggi"],
            ["lowest", "Rating terendah"],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={sort === value}
              onClick={() => onSortChange(value)}
              className={`min-h-9 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${sort === value ? "border-brand bg-light text-brand" : "border-border bg-surface text-dark hover:bg-surface-2"}`}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
