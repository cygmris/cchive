/**
 * The single source of truth for ephemeral shell state.
 *
 * Holds the active screen, overlay open-states, the active config id and the
 * seeded mock domain data (accounts, providers, MCP/Skills counts, today's
 * tokens, model). Every shell component reads from / dispatches to this store;
 * nothing else holds cross-cutting shell state. The seed is shaped exactly like
 * the real domain types so S4 can replace the source without touching the UI.
 */
import { create } from "zustand";
import type { Account, Provider, Screen } from "@/lib/shell-types";

/** Mock Claude accounts. `claude-personal` (Max 5×) is active by default. */
const SEED_ACCOUNTS: Account[] = [
  {
    id: "claude-personal",
    name: "Alex Rivera",
    org: "Personal",
    email: "alex@gmail.com",
    tier: "Max 5×",
    avatarSeed: "AR",
  },
  {
    id: "claude-northwind",
    name: "Alex Rivera",
    org: "Northwind",
    email: "alex@northwind.io",
    tier: "Max 20×",
    avatarSeed: "AR",
  },
];

/** Mock API providers (the custom-endpoint half of the keyring). */
const SEED_PROVIDERS: Provider[] = [
  {
    id: "prov-zai",
    title: "GLM-4.6 · Z.ai",
    brand: "zai",
    baseUrl: "https://api.z.ai/api/anthropic",
    model: "glm-4.6",
  },
  {
    id: "prov-kimi",
    title: "Kimi K2 Turbo",
    brand: "kimi",
    baseUrl: "https://api.moonshot.cn/anthropic",
    model: "kimi-k2-turbo",
  },
  {
    id: "prov-aws",
    title: "AWS Bedrock",
    brand: "aws",
    baseUrl: "us-west-2 · Bedrock gateway",
    model: "claude-sonnet-4-5",
  },
  {
    id: "prov-deepseek",
    title: "DeepSeek V4",
    brand: "deepseek",
    baseUrl: "https://api.deepseek.com/anthropic",
    model: "deepseek-v4",
  },
];

export interface ShellState {
  // --- Navigation + overlays ---
  activeScreen: Screen;
  paletteOpen: boolean;
  switcherOpen: boolean;

  // --- Active config + seeded domain data ---
  activeConfigId: string;
  accounts: Account[];
  providers: Provider[];

  // --- Status / overview counters (mock now, real in S4) ---
  mcpEnabledCount: number;
  skillsEnabledCount: number;
  tokensToday: string;
  /** Model id reported for the active *account* (providers report their own). */
  model: string;

  // --- Actions ---
  go: (screen: Screen) => void;
  openPalette: () => void;
  closePalette: () => void;
  togglePalette: () => void;
  openSwitcher: () => void;
  closeSwitcher: () => void;
  toggleSwitcher: () => void;
  /** Make the account/provider with `id` the active config; closes the switcher. */
  switchTo: (id: string) => void;
}

export const useShellStore = create<ShellState>((set) => ({
  activeScreen: "overview",
  paletteOpen: false,
  switcherOpen: false,

  activeConfigId: "claude-personal",
  accounts: SEED_ACCOUNTS,
  providers: SEED_PROVIDERS,

  mcpEnabledCount: 5,
  skillsEnabledCount: 5,
  tokensToday: "246.1K",
  model: "claude-sonnet-4-5",

  go: (screen) => set({ activeScreen: screen }),
  openPalette: () => set({ paletteOpen: true }),
  closePalette: () => set({ paletteOpen: false }),
  togglePalette: () => set((s) => ({ paletteOpen: !s.paletteOpen })),
  openSwitcher: () => set({ switcherOpen: true }),
  closeSwitcher: () => set({ switcherOpen: false }),
  toggleSwitcher: () => set((s) => ({ switcherOpen: !s.switcherOpen })),
  switchTo: (id) => set({ activeConfigId: id, switcherOpen: false }),
}));

/** The active config, discriminated by kind. Falls back to the first account. */
export type ActiveConfig =
  | { kind: "account"; config: Account }
  | { kind: "provider"; config: Provider };

/** Resolve the active config (account or provider) from the store state. */
export function selectActiveConfig(state: ShellState): ActiveConfig {
  const account = state.accounts.find((a) => a.id === state.activeConfigId);
  if (account) return { kind: "account", config: account };
  const provider = state.providers.find((p) => p.id === state.activeConfigId);
  if (provider) return { kind: "provider", config: provider };
  return { kind: "account", config: state.accounts[0] };
}

/** Values the status bar renders, derived from the active config + counters. */
export interface StatusValues {
  /** Active config display name (account name or provider title). */
  name: string;
  /** Model id (account → store.model; provider → its own model). */
  model: string;
  mcpEnabledCount: number;
  skillsEnabledCount: number;
  tokensToday: string;
}

/** Derive the status-bar values from store state. */
export function selectStatus(state: ShellState): StatusValues {
  const active = selectActiveConfig(state);
  const name =
    active.kind === "account" ? active.config.name : active.config.title;
  const model =
    active.kind === "account" ? state.model : active.config.model;
  return {
    name,
    model,
    mcpEnabledCount: state.mcpEnabledCount,
    skillsEnabledCount: state.skillsEnabledCount,
    tokensToday: state.tokensToday,
  };
}
