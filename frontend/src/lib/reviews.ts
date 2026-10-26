import { api } from "./api";

export type Review = {
  id: number;
  reservation_id: number;
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
  description: string;
  status: "open" | "reviewed" | "resolved";
  created_at: string;
};

export type StoreReviews = {
  store_id: number;
  average_rating: number | null;
  review_count: number;
  reviews: Omit<Review, "reservation_id" | "store_name">[];
};

export const feedbackApi = {
  mine: () =>
    api<{ reviews: Review[]; complaints: Complaint[] }>("reviews/mine"),
  store: (id: number | string) =>
    api<StoreReviews>(`stores/${encodeURIComponent(id)}/reviews`),
  createReview: (reservationId: number, rating: number, comment: string) =>
    api<Review>("reviews", "POST", {
      reservation_id: reservationId,
      rating,
      comment,
    }),
  updateReview: (id: number, rating: number, comment: string) =>
    api<Review>(`reviews/${id}`, "PATCH", { rating, comment }),
  deleteReview: (id: number) => api<void>(`reviews/${id}`, "DELETE"),
  createComplaint: (reservationId: number, description: string) =>
    api<Complaint>("complaints", "POST", {
      reservation_id: reservationId,
      description,
    }),
};
