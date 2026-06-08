const STORAGE_KEY = "basateen-theme";

export type ThemeMode = "light" | "dark";

function prefersDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function resolveDark(stored: string | null): boolean {
  if (stored === "dark") return true;
  if (stored === "light") return false;
  return prefersDark();
}

/** يُستدعى قبل أول رسم — ويفضّل أيضاً السكربت المضمّن في index.html */
export function initTheme(): void {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    document.documentElement.classList.toggle("dark", resolveDark(stored));
  } catch {
    /* private mode */
  }
}

export function getThemeMode(): ThemeMode {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

export function setThemeMode(mode: ThemeMode): void {
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    /* ignore */
  }
  document.documentElement.classList.toggle("dark", mode === "dark");
}

export function toggleThemeMode(): ThemeMode {
  const next: ThemeMode = getThemeMode() === "dark" ? "light" : "dark";
  setThemeMode(next);
  return next;
}
