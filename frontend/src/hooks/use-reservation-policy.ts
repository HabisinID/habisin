"use client";
import { useCallback, useEffect, useState } from "react";
import { api, type ReservationPolicy } from "@/lib/api";
export function useReservationPolicy(
  listingId: number,
  enabled: boolean,
  revision: number,
) {
  const [state, setState] = useState<{
    id: number;
    data?: ReservationPolicy;
    error?: string;
    loading: boolean;
  }>({ id: listingId, loading: enabled });
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  useEffect(() => {
    if (!enabled) return;
    let current: AbortController | null = null;
    let disposed = false;
    const load = () => {
      current?.abort();
      const controller = new AbortController();
      current = controller;
      void api<ReservationPolicy>(
        `listings/${listingId}/reservation-policy`,
        "GET",
        undefined,
        controller.signal,
      )
        .then((data) => {
          if (!disposed && !controller.signal.aborted)
            setState({ id: listingId, data, loading: false });
        })
        .catch((e: Error) => {
          if (!disposed && !controller.signal.aborted)
            setState({ id: listingId, error: e.message, loading: false });
        });
    };
    load();
    const timer = setInterval(load, 15000);
    window.addEventListener("focus", load);
    return () => {
      disposed = true;
      current?.abort();
      clearInterval(timer);
      window.removeEventListener("focus", load);
    };
  }, [listingId, enabled, revision, attempt]);
  return {
    data: state.id === listingId ? state.data : undefined,
    error: state.id === listingId ? state.error : undefined,
    loading: enabled && (state.id !== listingId || state.loading),
    retry,
  };
}
