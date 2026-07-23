import { useSyncExternalStore } from "react";

export type ThemeMode = "dark" | "light";

const THEME_STORAGE_KEY = "finanzas:theme";

const darkPalette = {
  bg: "#10181A",
  surface: "#1A2422",
  surface2: "#212E2C",
  surface3: "#283634",
  border: "#2E3F3C",
  borderLight: "#3A4E4A",
  text: "#EAEFE9",
  textMuted: "#8FA39F",
  textFaint: "#5E706C",
  uyu: "#D9A441",
  usd: "#4FA8A0",
  negative: "#D9776A",
  positive: "#6FBF8B",
};

const lightPalette: typeof darkPalette = {
  bg: "#F4F1EA",
  surface: "#FFFFFF",
  surface2: "#EFEBE1",
  surface3: "#E4DFD2",
  border: "#DAD3C3",
  borderLight: "#C8BFA9",
  text: "#20302C",
  textMuted: "#5C6F69",
  textFaint: "#8B9A94",
  uyu: "#B27E1F",
  usd: "#2F7C74",
  negative: "#C25443",
  positive: "#3E8F5D",
};

/**
 * Objeto de colores usado en toda la app vía `import { theme as C }`. Es
 * MUTABLE a propósito (no `as const`, siempre la misma referencia): al
 * cambiar de modo se pisan sus propiedades en el lugar con `Object.assign`,
 * y se fuerza un re-render desde la raíz (ver `useThemeMode`) para que todos
 * los componentes vuelvan a leer `C.xxx` con los valores nuevos. No hace
 * falta tocar los ~20 archivos que ya importan `theme` así.
 */
export const theme: typeof darkPalette = { ...darkPalette };

const listeners = new Set<() => void>();
let currentMode: ThemeMode = readStoredMode();

function readStoredMode(): ThemeMode {
  if (typeof window === "undefined") return "dark";
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  return stored === "light" ? "light" : "dark";
}

function applyMode(mode: ThemeMode) {
  currentMode = mode;
  Object.assign(theme, mode === "light" ? lightPalette : darkPalette);
  if (typeof document !== "undefined") {
    document.documentElement.style.colorScheme = mode;
    document.body.style.background = theme.bg;
  }
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, mode);
  } catch {
    // Sin localStorage (modo privado, etc.): el modo simplemente no persiste entre sesiones.
  }
  listeners.forEach((l) => l());
}

// Aplica el modo guardado (o el default) apenas se carga el módulo, para que
// `theme` ya tenga los valores correctos antes del primer render.
applyMode(currentMode);

export function setThemeMode(mode: ThemeMode): void {
  if (mode === currentMode) return;
  applyMode(mode);
}

export function toggleThemeMode(): void {
  setThemeMode(currentMode === "dark" ? "light" : "dark");
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): ThemeMode {
  return currentMode;
}

/**
 * Hook para leer el modo actual y re-renderizar cuando cambia. Basta con
 * llamarlo UNA vez cerca de la raíz (en `App`) para que, al cambiar de modo,
 * se re-renderice toda la app y cada componente vuelva a leer `theme.xxx`
 * actualizado (no hay memoización de subárboles en esta app que lo bloquee).
 */
export function useThemeMode(): ThemeMode {
  return useSyncExternalStore(subscribe, getSnapshot);
}
