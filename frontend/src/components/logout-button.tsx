"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { api } from "@/lib/api";
import s from "./site-header.module.css";

export default function LogoutButton({
  onLogout,
  className = "",
  showLabel = false,
}: {
  onLogout?: () => void | Promise<void>;
  className?: string;
  showLabel?: boolean;
}) {
  const router = useRouter(),
    inFlight = useRef(false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function logout() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      if (onLogout) await onLogout();
      else {
        await api("auth/logout", "POST");
        router.replace("/");
        router.refresh();
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  return (
    <span
      className={`${s.logoutControl} ${className}`}
      data-show-label={showLabel || undefined}
    >
      <button
        type="button"
        aria-label={busy ? "Sedang keluar" : "Keluar"}
        title="Keluar dari akun"
        disabled={busy}
        onClick={logout}
      >
        <LogOut size={18} aria-hidden="true" />
        {showLabel && <span>{busy ? "Keluar…" : "Keluar"}</span>}
      </button>
      {error && (
        <span className={s.logoutError} role="alert">
          {error}
        </span>
      )}
    </span>
  );
}
