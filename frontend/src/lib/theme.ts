export type ThemePreference = "system" | "light" | "dark";

export const THEME_KEY = "habisin-theme";
export const THEME_EVENT = "habisin-theme";
export const themeLabel: Record<ThemePreference, string> = {
  system: "Sistem",
  light: "Terang",
  dark: "Gelap",
};
export const nextTheme: Record<ThemePreference, ThemePreference> = {
  system: "light",
  light: "dark",
  dark: "system",
};

// Runs inline in <head> before the first paint, so a dark page never flashes white.
// Kept as a string because it executes before React and must not import anything.
export const themeScript = `(() => {
  try {
    const saved = localStorage.getItem("${THEME_KEY}");
    const dark = saved === "dark" || (saved !== "light" && matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.dataset.theme = dark ? "dark" : "light";
  } catch {
    document.documentElement.dataset.theme = "light";
  }
})();`;

export function readPreference(): ThemePreference {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    return saved === "light" || saved === "dark" ? saved : "system";
  } catch {
    return "system";
  }
}

export function applyTheme(preference: ThemePreference) {
  const dark =
    preference === "dark" ||
    (preference === "system" &&
      matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
}
