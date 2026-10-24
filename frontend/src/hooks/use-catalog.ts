"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, type Listing } from "@/lib/api";

// One ordered, abortable request path for initial load, focus, retry and mutations.
export function useCatalog(
  path = "listings",
  initial: Listing[] | (() => Listing[]) = [],
  liveClock = false,
) {
  const [items, setItems] = useState(initial);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [hasServerData, setHasServerData] = useState(false);
  const [online, setOnline] = useState(false);
  const [error, setError] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const latest = useRef({ value: 0 });
  const current = useRef<AbortController | null>(null);
  const load = useCallback(() => {
    const ticket = ++latest.current.value;
    current.current?.abort();
    const controller = new AbortController();
    current.current = controller;
    return api<Listing[]>(path, "GET", undefined, controller.signal)
      .then((data) => {
        if (controller.signal.aborted || ticket !== latest.current.value)
          return;
        setItems(data);
        setHasServerData(true);
        setOnline(true);
        setError("");
        setNow(Date.now());
      })
      .catch((e: Error) => {
        if (controller.signal.aborted || ticket !== latest.current.value)
          return;
        setOnline(false);
        setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted && ticket === latest.current.value) {
          setLoading(false);
          setLoaded(true);
        }
      });
  }, [path]);
  const refresh = useCallback(() => {
    setLoading(true);
    void load();
  }, [load]);
  useEffect(() => {
    void load();
    const epoch = latest.current;
    const focus = () => {
      if (document.visibilityState === "visible") refresh();
    };
    window.addEventListener("focus", focus);
    document.addEventListener("visibilitychange", focus);
    window.addEventListener("habisin-catalog-changed", refresh);
    return () => {
      epoch.value++;
      current.current?.abort();
      window.removeEventListener("focus", focus);
      document.removeEventListener("visibilitychange", focus);
      window.removeEventListener("habisin-catalog-changed", refresh);
    };
  }, [load, refresh]);
  useEffect(() => {
    const expiry = Math.min(
      ...items
        .map((item) => Date.parse(item.pickup_end))
        .filter((time) => time > now),
    );
    if (!Number.isFinite(expiry)) return;
    const timer = setTimeout(
      () => setNow(Date.now()),
      Math.min(expiry - Date.now() + 1, 2_147_483_647),
    );
    return () => clearTimeout(timer);
  }, [items, now]);
  useEffect(() => {
    if (!liveClock) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [liveClock]);
  return {
    items,
    setItems,
    loading,
    loaded,
    online,
    hasServerData,
    error,
    now,
    refresh,
  };
}
