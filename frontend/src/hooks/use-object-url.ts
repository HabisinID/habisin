"use client";
import { useMemo, useSyncExternalStore } from "react";
// The external resource is allocated on subscription, never during render.
class ObjectUrlStore {
  private url = "";
  constructor(private file: File | null) {}
  snapshot = () => this.url;
  subscribe = (notify: () => void) => {
    if (this.file) {
      this.url = URL.createObjectURL(this.file);
      notify();
    }
    return () => {
      if (this.url) URL.revokeObjectURL(this.url);
      this.url = "";
    };
  };
}
export function useObjectUrl(file: File | null) {
  const store = useMemo(() => new ObjectUrlStore(file), [file]);
  return useSyncExternalStore(store.subscribe, store.snapshot, () => "");
}
