"use client";
import { useMemo, useSyncExternalStore } from "react";
import type { Listing } from "./api";
export type CartItem = { item: Listing; quantity: number; selected: boolean };
type Snapshot = { items: CartItem[]; error: string };
const empty: Snapshot = { items: [], error: "" };
const stores = new Map<number, CartStore>();
class CartStore {
  private value: Snapshot = empty;
  private loaded = false;
  private listeners = new Set<() => void>();
  constructor(private userId: number) {}
  private get key() {
    return `habisin-cart:${this.userId}`;
  }
  snapshot = () => this.value;
  private read = () => {
    try {
      const data = JSON.parse(localStorage.getItem(this.key) || "[]");
      if (!Array.isArray(data) || data.length > 100) throw new Error();
      this.value = {
        items: data.filter(
          (r) =>
            r &&
            r.item &&
            Number.isInteger(r.item.id) &&
            typeof r.item.name === "string" &&
            typeof r.item.store === "string" &&
            Number.isFinite(r.item.price) &&
            Number.isInteger(r.quantity) &&
            r.quantity >= 1 &&
            r.quantity <= 10 &&
            typeof r.selected === "boolean",
        ),
        error: "",
      };
    } catch {
      this.value = {
        ...this.value,
        error:
          "Keranjang lokal belum dapat dibaca. Pilihan sementara tetap dapat digunakan.",
      };
    }
    this.listeners.forEach((l) => l());
  };
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    if (!this.loaded) {
      this.loaded = true;
      this.read();
    }
    const sync = (e: StorageEvent) => {
      if (e.key === this.key) this.read();
    };
    window.addEventListener("storage", sync);
    return () => {
      this.listeners.delete(listener);
      window.removeEventListener("storage", sync);
    };
  };
  update = (mutate: (rows: CartItem[]) => CartItem[]) => {
    const items = mutate(this.value.items);
    let error = "";
    try {
      localStorage.setItem(this.key, JSON.stringify(items));
    } catch {
      error =
        "Keranjang hanya tersimpan sementara karena penyimpanan browser tidak tersedia.";
    }
    this.value = { items, error };
    this.listeners.forEach((l) => l());
  };
}
export function useCart(userId: number | undefined) {
  const store = useMemo(() => {
    if (!userId) return null;
    let s = stores.get(userId);
    if (!s) {
      s = new CartStore(userId);
      stores.set(userId, s);
    }
    return s;
  }, [userId]);
  const value = useSyncExternalStore(
    store?.subscribe ?? (() => () => {}),
    store?.snapshot ?? (() => empty),
    () => empty,
  );
  return { ...value, update: store?.update ?? (() => {}) };
}
