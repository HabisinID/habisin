"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Reservation } from "@/lib/api";
import { feedbackApi, type ReservationFeedback } from "@/lib/reviews";
import { secondaryButton } from "./store-ui";

export function OrderFeedbackActions({ order }: { order: Reservation }) {
  const [data, setData] = useState<ReservationFeedback | null>(null);
  const [error, setError] = useState("");

  const eligible = order.status === "paid" || order.status === "picked_up";
  useEffect(() => {
    if (!eligible) return;
    let active = true;
    feedbackApi
      .reservationFeedback(order.id)
      .then((result) => {
        if (active) setData(result);
      })
      .catch((reason) => {
        if (active) setError((reason as Error).message);
      });
    return () => {
      active = false;
    };
  }, [order.id, eligible]);

  if (!eligible) return null;
  if (error) return <p role="status" className="text-xs text-muted">{error}</p>;
  if (!data)
    return (
      <span role="status" className="text-xs text-muted">
        Memuat ulasan…
      </span>
    );

  return (
    <div className="flex flex-wrap items-center gap-2">
      {order.status === "picked_up" && (
        <Link className={secondaryButton} href={`/ulasan/${order.listing.id}`}>
          {data.review ? "Edit ulasan" : "Beri ulasan"}
        </Link>
      )}
      {data.can_complain ? (
        <Link className={secondaryButton} href={`/komplain/${order.id}`}>
          Laporkan masalah
        </Link>
      ) : data.complaint ? (
        <span className="text-xs text-muted">
          Laporan: {data.complaint.status === "open"
            ? "menunggu ditinjau"
            : data.complaint.status === "reviewed"
              ? "sedang ditinjau"
              : "selesai ditangani"}
        </span>
      ) : null}
    </div>
  );
}
