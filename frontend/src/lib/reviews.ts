import { api, type Reservation } from "./api";

export type Review = {
  id: number;
  reservation_id: number | null;
  listing_id: number;
  listing_name: string;
  product_image: string;
  store_name: string;
  rating: number;
  comment: string;
  created_at: string;
  updated_at: string;
};

export type Complaint = {
  id: number;
  reservation_id: number;
  store_name: string;
  reason: ComplaintReason;
  description: string;
  status: "open" | "reviewed" | "resolved";
  created_at: string;
};

export type ComplaintReason = "hygiene" | "freshness" | "mismatch" | "other";

export type ReviewEligibility = {
  listing: {
    id: number;
    name: string;
    store: string;
    store_id: number | null;
    image: string;
    price: number;
    pickup_start: string;
    pickup_end: string;
  };
  can_review: boolean;
  reservation_id: number | null;
  review: Review | null;
};

export type ReservationFeedback = {
  can_review: boolean;
  review: Review | null;
  can_complain: boolean;
  complaint: Complaint | null;
};

export type StoreReviews = {
  store_id: number;
  average_rating: number | null;
  review_count: number;
  reviews: {
    id: number;
    listing_id: number;
    listing_name: string;
    user_name: string;
    rating: number;
    comment: string;
    created_at: string;
    updated_at: string;
  }[];
};

export const feedbackApi = {
  mine: () =>
    api<{ reviews: Review[]; complaints: Complaint[] }>("reviews/mine"),
  store: (id: number | string) =>
    api<StoreReviews>(`stores/${encodeURIComponent(id)}/reviews`),
  eligibility: (listingId: number | string) =>
    api<ReviewEligibility>(
      `listings/${encodeURIComponent(listingId)}/review-eligibility`,
    ),
  reservation: (id: number | string) =>
    api<Reservation>(`reservations/${encodeURIComponent(id)}`),
  reservationFeedback: (id: number | string) =>
    api<ReservationFeedback>(`reservations/${encodeURIComponent(id)}/feedback`),
  createReview: (reservationId: number, rating: number, comment: string) =>
    api<Review>("reviews", "POST", {
      reservation_id: reservationId,
      rating,
      comment,
    }),
  updateReview: (id: number, rating: number, comment: string) =>
    api<Review>(`reviews/${id}`, "PATCH", { rating, comment }),
  deleteReview: (id: number) => api<void>(`reviews/${id}`, "DELETE"),
  createComplaint: (
    reservationId: number,
    reason: ComplaintReason,
    description: string,
  ) =>
    api<Complaint>("complaints", "POST", {
      reservation_id: reservationId,
      reason,
      description,
    }),
};
