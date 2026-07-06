/**
 * Disk cache for computed usage summaries.
 *
 * Parsing `~/.claude/projects/**​/*.jsonl` is O(all history) — on a heavy setup
 * (thousands of files, gigabytes) it takes seconds. So the Overview/Usage screens
 * paint the LAST-KNOWN summary instantly from this cache while the fresh recompute
 * runs in the background (see `useUsage` + `useGlobalData`).
 *
 * Backed by `tauri-plugin-store` (`cchive-usage-cache.json`), keyed by range
 * window. Non-secret — token *counts* only, never a credential. Contract: these
 * NEVER throw; a miss/failure just returns null (the query then shows a loader).
 */
import type { UsageSummary } from "./types";

const STORE_FILE = "cchive-usage-cache.json";

/** Minimal surface of `tauri-plugin-store` that we rely on. */
interface TauriStore {
  get<T>(key: string): Promise<T | null | undefined>;
  set(key: string, value: unknown): Promise<void>;
  save(): Promise<void>;
}

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

const cacheKey = (rangeDays: number): string => `usage:${rangeDays}`;

/** Read the cached summary for a range window, or null on miss. Never throws. */
export async function readUsageCache(
  rangeDays: number,
): Promise<UsageSummary | null> {
  const store = await getStore();
  if (!store) return null;
  try {
    const raw = await store.get<UsageSummary>(cacheKey(rangeDays));
    return raw ?? null;
  } catch {
    return null;
  }
}

/** Persist a freshly-computed summary for its range window. Never throws. */
export async function writeUsageCache(
  rangeDays: number,
  summary: UsageSummary,
): Promise<void> {
  const store = await getStore();
  if (!store) return;
  try {
    await store.set(cacheKey(rangeDays), summary);
    await store.save();
  } catch {
    /* ignore — a stale/absent cache only costs a loader next time */
  }
}
