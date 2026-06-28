/**
 * The single source of truth for ephemeral shell UI state.
 *
 * Holds navigation (`activeScreen`), the overlay open-states (command palette,
 * account switcher, add-account modal) and a thin cached `activeIdentity`
 * (label/email/tier/model + the MCP/Skills/tokens display values) that the
 * queries layer hydrates via {@link ShellState.setActiveIdentity} so the Sidebar
 * card and StatusBar render instantly.
 *
 * The real account / provider lists are NOT held here — they live in the
 * TanStack Query cache (`lib/queries.ts`), the single source of backend truth.
 * This store only mirrors the *active* identity so the chrome has something to
 * paint before (and between) queries. No secret ever enters this store.
 */
import { create } from "zustand";
import type { Screen } from "@/lib/shell-types";

/** Which kind of credential the active session is using. */
export type ActiveKind = "account" | "provider" | "none";

/**
 * The thin, instantly-readable snapshot of the active session. Hydrated from the
 * `useActiveIdentity` query (which remains the source of truth); never a secret.
 * The counts/tokens are display-only values the status bar shows.
 */
export interface ActiveIdentityCache {
  kind: ActiveKind;
  /** Display name (account holder or provider title). */
  label: string;
  email: string | null;
  tier: string | null;
  model: string | null;
  mcpEnabledCount: number;
  skillsEnabledCount: number;
  tokensToday: string;
}

/** Pre-hydration placeholder so the chrome renders before the first query. */
const INITIAL_IDENTITY: ActiveIdentityCache = {
  kind: "none",
  label: "No active config",
  email: null,
  tier: null,
  model: "—",
  mcpEnabledCount: 0,
  skillsEnabledCount: 0,
  tokensToday: "0",
};

export interface ShellState {
  // --- Navigation + overlays ---
  activeScreen: Screen;
  paletteOpen: boolean;
  switcherOpen: boolean;
  addAccountOpen: boolean;

  // --- Thin active-identity cache (hydrated by the queries layer) ---
  activeIdentity: ActiveIdentityCache;

  // --- Actions ---
  go: (screen: Screen) => void;
  openPalette: () => void;
  closePalette: () => void;
  togglePalette: () => void;
  openSwitcher: () => void;
  closeSwitcher: () => void;
  toggleSwitcher: () => void;
  openAddAccount: () => void;
  closeAddAccount: () => void;
  /** Merge a partial active-identity snapshot into the cache (queries layer). */
  setActiveIdentity: (patch: Partial<ActiveIdentityCache>) => void;
}

export const useShellStore = create<ShellState>((set) => ({
  activeScreen: "overview",
  paletteOpen: false,
  switcherOpen: false,
  addAccountOpen: false,

  activeIdentity: INITIAL_IDENTITY,

  go: (screen) => set({ activeScreen: screen }),
  openPalette: () => set({ paletteOpen: true }),
  closePalette: () => set({ paletteOpen: false }),
  togglePalette: () => set((s) => ({ paletteOpen: !s.paletteOpen })),
  openSwitcher: () => set({ switcherOpen: true }),
  closeSwitcher: () => set({ switcherOpen: false }),
  toggleSwitcher: () => set((s) => ({ switcherOpen: !s.switcherOpen })),
  openAddAccount: () => set({ addAccountOpen: true }),
  closeAddAccount: () => set({ addAccountOpen: false }),
  setActiveIdentity: (patch) =>
    set((s) => ({ activeIdentity: { ...s.activeIdentity, ...patch } })),
}));

/** Values the status bar renders, derived from the active-identity cache. */
export interface StatusValues {
  /** Active config display name. */
  name: string;
  model: string;
  mcpEnabledCount: number;
  skillsEnabledCount: number;
  tokensToday: string;
}

/** Derive the status-bar values from the active-identity cache. */
export function selectStatus(state: ShellState): StatusValues {
  const id = state.activeIdentity;
  return {
    name: id.label,
    model: id.model ?? "—",
    mcpEnabledCount: id.mcpEnabledCount,
    skillsEnabledCount: id.skillsEnabledCount,
    tokensToday: id.tokensToday,
  };
}
