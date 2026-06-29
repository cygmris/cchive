/**
 * cchive badges — small uppercase status pills, provider brand chips, and the
 * categorical model / source tags.
 *
 * Everything is token-driven (no hardcoded hex):
 *  - {@link Badge}        semantic pills (neutral/accent/success/warning/danger/info),
 *                         optional leading status dot. `accent` is the "Active" badge.
 *  - {@link ProviderChip} a square brand chip — single brand letter/glyph on the
 *                         provider's brand colour (Anthropic ✳ clay, Z.ai Z, Kimi K,
 *                         Bedrock aws, DeepSeek DS).
 *  - {@link ModelBadge}   model-family tag — sonnet=clay, opus=violet, haiku=green.
 *  - {@link SourceBadge}  config-source tag — Personal=clay, Project=blue, Plugin=violet.
 *
 * The model/source hues are *categorical* (fixed clay/violet/green/blue) rather than
 * the swappable `--accent`, so the tags stay distinguishable when the accent is retinted.
 */
import type * as React from "react";
import { cn } from "@/lib/cn";

/* ----------------------------------------------------------------------------
 * Shared base — mirrors the design-bundle Badge (Geist 9.5px / 600, uppercase,
 * 0.05em tracking, 2px 7px padding, radius-xs).
 * ------------------------------------------------------------------------- */
// Weight (`--weight-semibold` = 600) is applied via the `font-semibold` utility
// because csstype's `fontWeight` type rejects a raw `var()` string.
const BADGE_FONT = "font-semibold";

const badgeBase: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  fontFamily: "var(--font-sans)",
  fontSize: 9.5,
  letterSpacing: "0.05em",
  textTransform: "uppercase",
  lineHeight: 1.4,
  whiteSpace: "nowrap",
  padding: "2px 7px",
  borderRadius: "var(--radius-xs)",
};

function dotStyle(color: string): React.CSSProperties {
  return {
    width: 5,
    height: 5,
    flexShrink: 0,
    borderRadius: "var(--radius-pill)",
    background: color,
  };
}

/* ----------------------------------------------------------------------------
 * Badge — semantic pills.
 * ------------------------------------------------------------------------- */
export type BadgeVariant =
  | "neutral"
  | "accent"
  | "success"
  | "warning"
  | "danger"
  | "info";

/** Foreground colour per variant (also the dot colour). */
const VARIANT_COLOR: Record<BadgeVariant, string> = {
  neutral: "var(--text-3)",
  accent: "var(--accent)",
  success: "var(--success)",
  warning: "var(--warning)",
  danger: "var(--danger)",
  info: "var(--info)",
};

/** Tint background per variant. */
const VARIANT_BG: Record<BadgeVariant, string> = {
  neutral: "transparent",
  accent: "var(--accent-tint)",
  success: "color-mix(in srgb, var(--success) 14%, transparent)",
  warning: "color-mix(in srgb, var(--warning) 16%, transparent)",
  danger: "color-mix(in srgb, var(--danger) 14%, transparent)",
  info: "color-mix(in srgb, var(--info) 14%, transparent)",
};

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** @default 'neutral' */
  variant?: BadgeVariant;
  /** Show a leading status dot in the variant colour. @default false */
  dot?: boolean;
}

/** A small uppercase status / meta pill. `accent` marks the active item. */
export function Badge({
  variant = "neutral",
  dot = false,
  className,
  style,
  children,
  ...rest
}: BadgeProps) {
  const color = VARIANT_COLOR[variant];
  return (
    <span
      className={cn(BADGE_FONT, className)}
      style={{
        ...badgeBase,
        color,
        background: VARIANT_BG[variant],
        border: variant === "neutral" ? "1px solid var(--border)" : "none",
        ...style,
      }}
      {...rest}
    >
      {dot && <span aria-hidden style={dotStyle(color)} />}
      {children}
    </span>
  );
}

/* ----------------------------------------------------------------------------
 * ProviderChip — square brand chip (single letter/glyph on the brand colour).
 * ------------------------------------------------------------------------- */
export type ProviderName = "anthropic" | "zai" | "kimi" | "aws" | "deepseek";

interface ProviderMeta {
  glyph: string;
  color: string;
  label: string;
  /** Glyph font-size as a fraction of the chip size (calibrated at 42px). */
  fontRatio: number;
}

const PROVIDERS: Record<ProviderName, ProviderMeta> = {
  anthropic: { glyph: "✳", color: "var(--prov-anthropic)", label: "Anthropic", fontRatio: 14 / 42 },
  zai: { glyph: "Z", color: "var(--prov-zai)", label: "Z.ai", fontRatio: 14 / 42 },
  kimi: { glyph: "K", color: "var(--prov-kimi)", label: "Kimi", fontRatio: 14 / 42 },
  aws: { glyph: "aws", color: "var(--prov-aws)", label: "Bedrock", fontRatio: 10 / 42 },
  deepseek: { glyph: "DS", color: "var(--prov-deepseek)", label: "DeepSeek", fontRatio: 12 / 42 },
};

export interface ProviderChipProps extends React.HTMLAttributes<HTMLSpanElement> {
  provider: ProviderName;
  /** Square size in px. @default 42 */
  size?: number;
}

/** A brand chip — white brand mark on the provider's brand colour. */
export function ProviderChip({
  provider,
  size = 42,
  className,
  style,
  ...rest
}: ProviderChipProps) {
  const meta = PROVIDERS[provider];
  return (
    <span
      role="img"
      aria-label={meta.label}
      className={cn(BADGE_FONT, className)}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        width: size,
        height: size,
        // 11px corner at the 42px reference size; scales proportionally.
        borderRadius: Math.round((size * 11) / 42),
        background: meta.color,
        color: "var(--on-accent)",
        fontFamily: "var(--font-sans)",
        fontSize: Math.round(size * meta.fontRatio),
        lineHeight: 1,
        userSelect: "none",
        ...style,
      }}
      {...rest}
    >
      {meta.glyph}
    </span>
  );
}

/* ----------------------------------------------------------------------------
 * ModelBadge / SourceBadge — categorical tinted pills.
 * Hues are fixed (not the swappable --accent) so categories stay distinct.
 * ------------------------------------------------------------------------- */
function tintedPillStyle(color: string): React.CSSProperties {
  return {
    ...badgeBase,
    color,
    background: `color-mix(in srgb, ${color} 14%, transparent)`,
    border: "none",
  };
}

export type ModelName = "sonnet" | "opus" | "haiku";

const MODEL_COLOR: Record<ModelName, string> = {
  sonnet: "var(--clay-500)", // clay
  opus: "var(--accent-violet)", // #7c6cf0
  haiku: "var(--success)", // green
};

export interface ModelBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  model: ModelName;
}

/** Model-family tag: sonnet=clay, opus=violet, haiku=green. */
export function ModelBadge({
  model,
  className,
  style,
  children,
  ...rest
}: ModelBadgeProps) {
  return (
    <span
      className={cn(BADGE_FONT, className)}
      style={{ ...tintedPillStyle(MODEL_COLOR[model]), ...style }}
      {...rest}
    >
      {children ?? model}
    </span>
  );
}

export type SourceName = "personal" | "project" | "plugin";

const SOURCE_COLOR: Record<SourceName, string> = {
  personal: "var(--clay-500)", // clay
  project: "var(--info)", // #5b8def (blue)
  plugin: "var(--accent-violet)", // #7c6cf0 (violet)
};

export interface SourceBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  source: SourceName;
}

/** Config-source tag: Personal=clay, Project=blue, Plugin=violet. */
export function SourceBadge({
  source,
  className,
  style,
  children,
  ...rest
}: SourceBadgeProps) {
  return (
    <span
      className={cn(BADGE_FONT, className)}
      style={{ ...tintedPillStyle(SOURCE_COLOR[source]), ...style }}
      {...rest}
    >
      {children ?? source}
    </span>
  );
}
