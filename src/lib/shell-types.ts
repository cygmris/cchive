/**
 * Shell-level domain types for the Clavis app shell.
 *
 * These shapes mirror the real domain so S3/S4 can swap the mock seed in
 * `lib/store.ts` for Rust-backed data without touching shell components.
 */

/**
 * Every screen the router can mount via `activeScreen`. There are 13: the 12
 * sidebar destinations plus `editor` (the Config Editor), which is reached from
 * actions rather than the nav.
 */
export const SCREENS = [
  "overview",
  "configs",
  "editor",
  "projects",
  "mcp",
  "agents",
  "commands",
  "skills",
  "memory",
  "usage",
  "notifications",
  "experimental",
  "settings",
] as const;

export type Screen = (typeof SCREENS)[number];

/** The three sidebar nav groups (`editor` belongs to none). */
export type NavGroup = "main" | "customize" | "system";

/** Claude subscription tier shown on accounts. */
export type AccountTier = "Max 5×" | "Max 20×" | "Pro" | "Free";

/** Provider brand — drives the brand chip letter + color. */
export type ProviderBrand = "anthropic" | "zai" | "kimi" | "aws" | "deepseek";

/** A signed-in Claude account (one entry in the "keyring"). */
export interface Account {
  id: string;
  name: string;
  org: string;
  email: string;
  tier: AccountTier;
  /** Initials/seed used to render the gradient avatar. */
  avatarSeed: string;
}

/** A custom API provider configuration. */
export interface Provider {
  id: string;
  title: string;
  brand: ProviderBrand;
  /** Base URL or region/gateway description (mono, may be truncated). */
  baseUrl: string;
  model: string;
}
