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

/* ------------------------------------------------------------------------- *
 * UI language slice.
 *
 * A single language tag (e.g. "en", "zh-Hans", "fr"). Stored alongside the
 * theme prefs in the same backends, but under its own key. The localStorage
 * copy is a plain string (not JSON) so i18next-browser-languagedetector can read
 * it directly via `lookupLocalStorage`. Defaults to "en"; never throws.
 * ------------------------------------------------------------------------- */

const LANG_STORE_KEY = "language";
/** Shared with the i18next language detector (`lookupLocalStorage`). */
export const LANGUAGE_LS_KEY = "clavis.language";
const DEFAULT_LANGUAGE = "en";

/** Last-known language, the final fallback when no backend is readable. */
let memoryLanguage: string = DEFAULT_LANGUAGE;

function sanitizeLanguage(raw: unknown): string {
  return typeof raw === "string" && raw.length > 0 ? raw : DEFAULT_LANGUAGE;
}

/** Read the persisted UI language, falling back to "en". Never throws. */
export async function getLanguagePref(): Promise<string> {
  const store = await getStore();
  if (store) {
    try {
      const raw = await store.get<string>(LANG_STORE_KEY);
      if (raw != null) {
        memoryLanguage = sanitizeLanguage(raw);
        return memoryLanguage;
      }
    } catch {
      /* fall through to localStorage / memory */
    }
  }

  try {
    if (typeof localStorage !== "undefined") {
      const raw = localStorage.getItem(LANGUAGE_LS_KEY);
      if (raw) {
        memoryLanguage = sanitizeLanguage(raw);
        return memoryLanguage;
      }
    }
  } catch {
    /* ignore — fall through to memory */
  }

  return memoryLanguage;
}

/** Persist the UI language across all available backends. Never throws. */
export async function setLanguagePref(language: string): Promise<void> {
  memoryLanguage = sanitizeLanguage(language);

  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(LANGUAGE_LS_KEY, memoryLanguage);
    }
  } catch {
    /* ignore — memory copy still holds the value */
  }

  const store = await getStore();
  if (store) {
    try {
      await store.set(LANG_STORE_KEY, memoryLanguage);
      await store.save();
    } catch {
      /* ignore — localStorage / memory already updated */
    }
  }
}

/* ------------------------------------------------------------------------- *
 * Experimental flags slice.
 *
 * Clavis-local toggles for unstable features. These are app preferences only —
 * NO Claude Code files are touched. Stored alongside the theme + language prefs
 * in the same backends, under its own key. Corrupt or partial data degrades to
 * the defaults (everything off, mode "auto"); never throws.
 * ------------------------------------------------------------------------- */

/** How teammates are presented while an Agent Teams run is in progress. */
export type TeammateMode = "auto" | "inProcess" | "splitPanes";

export interface ExperimentalPrefs {
  /** Coordinate multiple Claude Code instances as a team. @default false */
  agentTeams: boolean;
  /** Teammate display mode (only meaningful while `agentTeams` is on). */
  teammateMode: TeammateMode;
}

export const DEFAULT_EXPERIMENTAL_PREFS: ExperimentalPrefs = {
  agentTeams: false,
  teammateMode: "auto",
};

const EXPERIMENTAL_STORE_KEY = "experimental";
const EXPERIMENTAL_LS_KEY = "clavis.experimental";
const TEAMMATE_MODES: readonly TeammateMode[] = [
  "auto",
  "inProcess",
  "splitPanes",
];

/** Last-known experimental prefs, the final fallback when no backend is readable. */
let memoryExperimental: ExperimentalPrefs = { ...DEFAULT_EXPERIMENTAL_PREFS };

/** Coerce arbitrary stored data into a valid `ExperimentalPrefs`, filling defaults. */
function sanitizeExperimental(raw: unknown): ExperimentalPrefs {
  const v = (raw && typeof raw === "object"
    ? raw
    : {}) as Partial<ExperimentalPrefs>;
  return {
    agentTeams: v.agentTeams === true,
    teammateMode: TEAMMATE_MODES.includes(v.teammateMode as TeammateMode)
      ? (v.teammateMode as TeammateMode)
      : DEFAULT_EXPERIMENTAL_PREFS.teammateMode,
  };
}

function readExperimentalLocalStorage(): ExperimentalPrefs | null {
  try {
    if (typeof localStorage === "undefined") return null;
    const raw = localStorage.getItem(EXPERIMENTAL_LS_KEY);
    return raw ? sanitizeExperimental(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

function writeExperimentalLocalStorage(prefs: ExperimentalPrefs): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(EXPERIMENTAL_LS_KEY, JSON.stringify(prefs));
  } catch {
    /* ignore — memory copy still holds the value */
  }
}

/** Read the persisted experimental flags, falling back to defaults. Never throws. */
export async function getExperimentalPrefs(): Promise<ExperimentalPrefs> {
  const store = await getStore();
  if (store) {
    try {
      const raw = await store.get<ExperimentalPrefs>(EXPERIMENTAL_STORE_KEY);
      if (raw != null) {
        memoryExperimental = sanitizeExperimental(raw);
        return memoryExperimental;
      }
    } catch {
      /* fall through to localStorage / memory */
    }
  }

  const ls = readExperimentalLocalStorage();
  if (ls) {
    memoryExperimental = ls;
    return ls;
  }

  return { ...memoryExperimental };
}

/** Persist a single experimental flag across all available backends. Never throws. */
export async function setExperimentalPref<K extends keyof ExperimentalPrefs>(
  key: K,
  value: ExperimentalPrefs[K],
): Promise<void> {
  const next: ExperimentalPrefs = {
    ...(await getExperimentalPrefs()),
    [key]: value,
  };
  memoryExperimental = next;
  writeExperimentalLocalStorage(next);

  const store = await getStore();
  if (store) {
    try {
      await store.set(EXPERIMENTAL_STORE_KEY, next);
      await store.save();
    } catch {
      /* ignore — localStorage / memory already updated */
    }
  }
}
