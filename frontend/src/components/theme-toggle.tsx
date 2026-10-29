"use client";
import { useEffect, useSyncExternalStore } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import {
  THEME_EVENT,
  THEME_KEY,
  applyTheme,
  nextTheme,
  readPreference,
  themeLabel,
  type ThemePreference,
} from "@/lib/theme";

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(THEME_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(THEME_EVENT, callback);
  };
}

// One preference for the TopNav switcher and the Akun choice, kept in sync.
export function useThemePreference() {
  return useSyncExternalStore(
    subscribe,
    readPreference,
    () => "system" as const,
  );
}

export function setThemePreference(next: ThemePreference) {
  try {
    localStorage.setItem(THEME_KEY, next);
  } catch {
    // Without storage the choice still applies for this visit.
  }
  applyTheme(next);
  window.dispatchEvent(new Event(THEME_EVENT));
}

// Mounted once in the root layout, so pages without a switcher (Mitra) still
// apply the saved theme and "Sistem" follows the OS while the page is open.
export function ThemeSync() {
  const preference = useThemePreference();
  useEffect(() => {
    applyTheme(preference);
    if (preference !== "system") return;
    const media = matchMedia("(prefers-color-scheme: dark)");
    const follow = () => applyTheme("system");
    media.addEventListener("change", follow);
    return () => media.removeEventListener("change", follow);
  }, [preference]);
  return null;
}

const icons = { system: Monitor, light: Sun, dark: Moon };

// TopNav switcher: cycles Sistem → Terang → Gelap.
export default function ThemeToggle() {
  const preference = useThemePreference();
  const Icon = icons[preference];
  return (
    <button
      data-theme-toggle
      className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-border text-dark transition-transform hover:bg-surface-2 active:scale-90 mobile:h-10 mobile:w-10"
      aria-label={`Tema tampilan: ${themeLabel[preference]}`}
      title={`Tema: ${themeLabel[preference]} (klik untuk ganti)`}
      onClick={() => setThemePreference(nextTheme[preference])}
    >
      <Icon size={20} />
    </button>
  );
}
