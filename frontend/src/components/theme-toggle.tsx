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
} from "@/lib/theme";

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(THEME_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(THEME_EVENT, callback);
  };
}

const icons = { system: Monitor, light: Sun, dark: Moon };

// Cycles Sistem → Terang → Gelap, matching the theme choice in the design's account menu.
export default function ThemeToggle() {
  const preference = useSyncExternalStore(
    subscribe,
    readPreference,
    () => "system" as const,
  );
  // "Sistem" follows the operating system, including changes while the page is open.
  useEffect(() => {
    applyTheme(preference);
    if (preference !== "system") return;
    const media = matchMedia("(prefers-color-scheme: dark)");
    const follow = () => applyTheme("system");
    media.addEventListener("change", follow);
    return () => media.removeEventListener("change", follow);
  }, [preference]);

  const Icon = icons[preference];
  return (
    <button
      className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-dark transition-transform hover:bg-surface-2 active:scale-90"
      aria-label={`Tema tampilan: ${themeLabel[preference]}`}
      title={`Tema: ${themeLabel[preference]} (klik untuk ganti)`}
      onClick={() => {
        const next = nextTheme[preference];
        try {
          localStorage.setItem(THEME_KEY, next);
        } catch {
          // Without storage the choice still applies for this visit.
        }
        applyTheme(next);
        window.dispatchEvent(new Event(THEME_EVENT));
      }}
    >
      <Icon size={18} />
    </button>
  );
}
