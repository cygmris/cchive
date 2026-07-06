/**
 * useGlobalData — prime the shared data layer once at the shell root.
 *
 * The status-bar counters and the Overview tiles read their MCP / Skills /
 * tokens-today values from the shell store's thin active-identity cache, which
 * the count queries hydrate as a side effect (see {@link useMcpServers},
 * {@link useResources}, {@link useUsage} in `lib/queries`). Before this hook
 * those side effects only fired once you actually visited the MCP / Skills /
 * Usage screens, so booting straight into a non-Overview screen left the status
 * bar showing the `0` placeholders.
 *
 * Calling the count hooks once here, at the shell level, fixes that: the store
 * is hydrated regardless of the entry screen. Because TanStack Query keys the
 * cache by query key, these calls de-duplicate with the very same hooks the
 * Overview / Usage / MCP / Skills screens call — there is no extra refetch, the
 * screens just read the shared in-flight / cached result.
 *
 * It also seeds the usage query from the on-disk cache at boot so the Overview
 * paints last-known numbers INSTANTLY while the (seconds-long over a large
 * `~/.claude/projects`) recompute runs in the background.
 */
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  queryKeys,
  useAccounts,
  useMcpServers,
  useResources,
  useUsage,
} from "@/lib/queries";
import { readUsageCache } from "@/lib/usageCache";

/** Usage window the status-bar tokens-today + Overview tiles read (matches Overview). */
const GLOBAL_USAGE_RANGE_DAYS = 30;

/** Subscribe the shell to the app-wide counts so they populate from any screen. */
export function useGlobalData(): void {
  useAccounts();
  useMcpServers();
  useResources("skill");
  useUsage(GLOBAL_USAGE_RANGE_DAYS);

  // Cache-first paint: seed the usage query from disk before the (slow) recompute
  // resolves. Only seeds if nothing is present yet, so the in-flight fresh read
  // (started on mount) always wins when it lands.
  const qc = useQueryClient();
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const cached = await readUsageCache(GLOBAL_USAGE_RANGE_DAYS);
      if (cancelled || !cached) return;
      const key = queryKeys.usage(GLOBAL_USAGE_RANGE_DAYS);
      if (qc.getQueryData(key) === undefined) {
        qc.setQueryData(key, cached);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [qc]);
}
