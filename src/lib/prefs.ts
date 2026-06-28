/**
 * Non-secret preference persistence.
 *
 * Primary backing store is `tauri-plugin-store` (`clavis.store.json` in the
 * platform app-config dir). When the Tauri store is unavailable — e.g. the
 * component gallery running in a plain browser, or a corrupt/locked store —
 * this transparently falls back to `localStorage`, then to an in-memory copy.
 *
 * Contract: these functions NEVER throw. On any failure they degrade to the
 * next backend and ultimately return sane defaults.
 */
import {
  ACCENT_NAMES,
  DEFAULT_THEME_PREFS,
  type AccentName,
  type ThemePrefs,
} from "./types";

const STORE_FILE = "clavis.store.json";
const STORE_KEY = "theme";
const LS_KEY = "clavis.theme";

/** Minimal surface of `tauri-plugin-store` that we rely on. */
interface TauriStore {
  get<T>(key: string): Promise<T | null | undefined>;
  set(key: string, value: unknown): Promise<void>;
  save(): Promise<void>;
}

/** Last-known prefs, used as the final fallback when no backend is writable. */
let memoryPrefs: ThemePrefs = { ...DEFAULT_THEME_PREFS };

/** Cached store handle (or `null` when running outside Tauri). */
let storePromise: Promise<TauriStore | null> | null = null;

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

async function getStore(): Promise<TauriStore | null> {
  if (!isTauri()) return null;
  if (!storePromise) {
    storePromise = (async () => {
      try {
        const mod = await import("@tauri-apps/plugin-store");
        return (await mod.load(STORE_FILE, {
          defaults: {},
          autoSave: false,
        })) as unknown as TauriStore;
      } catch {
        return null;
      }
    })();
  }
  return storePromise;
}

/** Coerce arbitrary stored data into a valid `ThemePrefs`, filling defaults. */
function sanitize(raw: unknown): ThemePrefs {
  const v = (raw && typeof raw === "object" ? raw : {}) as Partial<ThemePrefs>;
  return {
    theme: v.theme === "dark" ? "dark" : "light",
    accent: ACCENT_NAMES.includes(v.accent as AccentName)
      ? (v.accent as AccentName)
      : DEFAULT_THEME_PREFS.accent,
    density: v.density === "compact" ? "compact" : "comfortable",
  };
}

function readLocalStorage(): ThemePrefs | null {
  try {
    if (typeof localStorage === "undefined") return null;
    const raw = localStorage.getItem(LS_KEY);
    return raw ? sanitize(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

function writeLocalStorage(prefs: ThemePrefs): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(LS_KEY, JSON.stringify(prefs));
  } catch {
    /* ignore — memory copy still holds the value */
  }
}

/** Read the persisted prefs, falling back to defaults. Never throws. */
export async function getPrefs(): Promise<ThemePrefs> {
  const store = await getStore();
  if (store) {
    try {
      const raw = await store.get<ThemePrefs>(STORE_KEY);
      if (raw != null) {
        memoryPrefs = sanitize(raw);
        return memoryPrefs;
      }
    } catch {
      /* fall through to localStorage / memory */
    }
  }

  const ls = readLocalStorage();
  if (ls) {
    memoryPrefs = ls;
    return ls;
  }

  return { ...memoryPrefs };
}

/** Persist a single preference field across all available backends. Never throws. */
export async function setPref<K extends keyof ThemePrefs>(
  key: K,
  value: ThemePrefs[K],
): Promise<void> {
  const next: ThemePrefs = { ...(await getPrefs()), [key]: value };
  memoryPrefs = next;
  writeLocalStorage(next);

  const store = await getStore();
  if (store) {
    try {
      await store.set(STORE_KEY, next);
      await store.save();
    } catch {
      /* ignore — localStorage / memory already updated */
    }
  }
}
