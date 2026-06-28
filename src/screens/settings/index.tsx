/**
 * Settings — the real screen (replaces the S2 placeholder).
 *
 * Card 1 collects the app-level preferences: the UI Language (an i18n
 * `setLanguage` that switches + persists), Appearance (light/dark via the S1
 * `useTheme`), an Accent picker (5 token swatches → `setAccent`), a Density
 * toggle (`setDensity`), and a Version row showing "Clavis v{version}" with a
 * status chip and a guarded "Check for updates" button. Card 2 is Contact &
 * support with a "Report an issue" link.
 *
 * Appearance/accent/density flow entirely through the S1 theme engine (live +
 * persisted); the language flows through the i18n layer. The update check is
 * guarded — there is no updater channel until S14, so it reports a state instead
 * of crashing. The issue link opens via the Tauri opener with a `window.open`
 * fallback off-Tauri. All labels come from i18n; styling is tokens-only.
 */
import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { getVersion } from "@tauri-apps/api/app";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Badge } from "@/ui/Badge";
import { Button } from "@/ui/Button";
import { Card } from "@/ui/Card";
import { SegmentedControl } from "@/ui/SegmentedControl";
import { Select } from "@/ui/Select";
import { Check, ExternalLink, Moon, Sun } from "@/ui/icons";
import { ScreenHeader } from "@/app/ScreenHeader";
import { useTheme } from "@/theme/ThemeProvider";
import { SUPPORTED_LANGUAGES, setLanguage, type Language } from "@/i18n";
import type { AccentName, Density, Theme } from "@/lib/types";

/** Where the "Report an issue" button sends the user (github.com per capability). */
const ISSUE_URL = "https://github.com/clavis-app/clavis/issues/new";

/** Shown when `@tauri-apps/api/app` getVersion is unavailable (off-Tauri / gallery). */
const FALLBACK_VERSION = "1.0.0";

/** Native language names for the picker (never translated). */
const LANGUAGE_OPTIONS: { value: Language; label: string }[] = [
  { value: "en", label: "English" },
  { value: "zh-Hans", label: "中文" },
  { value: "zh-Hant", label: "繁體中文" },
  { value: "fr", label: "Français" },
  { value: "ja", label: "日本語" },
];

/** The five swatches, each filled from its accent token (no hardcoded hex). */
const ACCENT_SWATCHES: { name: AccentName; token: string }[] = [
  { name: "clay", token: "var(--accent-clay)" },
  { name: "blue", token: "var(--accent-blue)" },
  { name: "green", token: "var(--accent-green)" },
  { name: "violet", token: "var(--accent-violet)" },
  { name: "ember", token: "var(--accent-ember)" },
];

/** The guarded update-check outcome. Real updater wiring lands in S14. */
type UpdateStatus = "upToDate" | "notConfigured";

export function SettingsScreen() {
  const { t, i18n } = useTranslation();
  const { theme, accent, density, setTheme, setAccent, setDensity } = useTheme();

  const currentLanguage = SUPPORTED_LANGUAGES.includes(
    i18n.resolvedLanguage as Language,
  )
    ? (i18n.resolvedLanguage as Language)
    : "en";

  const [appVersion, setAppVersion] = useState(FALLBACK_VERSION);
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>("upToDate");
  const [checking, setChecking] = useState(false);

  // Resolve the real app version under Tauri; off-Tauri getVersion rejects and we
  // keep the fallback, so this never throws.
  useEffect(() => {
    let cancelled = false;
    void getVersion()
      .then((v) => {
        if (!cancelled && v) setAppVersion(v);
      })
      .catch(() => {
        /* keep FALLBACK_VERSION */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Guarded update check. There is no updater channel until S14, so we report
  // "updates not configured yet" rather than pretending to check (never crashes).
  async function checkForUpdates() {
    setChecking(true);
    try {
      setUpdateStatus("notConfigured");
    } finally {
      setChecking(false);
    }
  }

  // Open the issue tracker via the Tauri opener; fall back to window.open in a
  // plain browser (the component gallery / vite dev).
  async function reportIssue() {
    try {
      await openUrl(ISSUE_URL);
    } catch {
      if (typeof window !== "undefined") {
        window.open(ISSUE_URL, "_blank", "noopener,noreferrer");
      }
    }
  }

  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        overflow: "auto",
      }}
    >
      <ScreenHeader
        title={t("settings.title")}
        description={t("settings.description")}
      />

      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          gap: "var(--card-gap)",
          padding: "0 var(--gutter) var(--space-8)",
        }}
      >
        {/* Card 1 — preferences. */}
        <Card>
          {/* Language. */}
          <SettingRow
            title={t("settings.language.label")}
            description={t("settings.language.description")}
          >
            <Select
              aria-label={t("settings.language.label")}
              options={LANGUAGE_OPTIONS}
              value={currentLanguage}
              onChange={(e) => void setLanguage(e.target.value as Language)}
              style={{ width: 220 }}
            />
          </SettingRow>

          {/* Appearance (light/dark). */}
          <SettingRow
            divider
            title={t("settings.appearance.label")}
            description={t("settings.appearance.description")}
          >
            <SegmentedControl<Theme>
              aria-label={t("settings.appearance.label")}
              value={theme}
              onChange={setTheme}
              options={[
                {
                  value: "light",
                  label: t("settings.appearance.light"),
                  icon: <Sun size={15} aria-hidden />,
                },
                {
                  value: "dark",
                  label: t("settings.appearance.dark"),
                  icon: <Moon size={15} aria-hidden />,
                },
              ]}
            />
          </SettingRow>

          {/* Accent picker — 5 token swatches. */}
          <SettingRow
            divider
            title={t("settings.appearance.accent.label")}
            description={t("settings.appearance.accent.description")}
          >
            <div
              role="radiogroup"
              aria-label={t("settings.appearance.accent.label")}
              style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}
            >
              {ACCENT_SWATCHES.map(({ name, token }) => {
                const active = name === accent;
                return (
                  <button
                    key={name}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    aria-label={t(`settings.appearance.accent.${name}`)}
                    onClick={() => setAccent(name)}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: 24,
                      height: 24,
                      padding: 0,
                      border: "none",
                      borderRadius: "var(--radius-pill)",
                      background: token,
                      cursor: "pointer",
                      // The active swatch gets a surface gap + accent ring; since
                      // --accent IS the active swatch, the ring matches its colour.
                      boxShadow: active
                        ? "0 0 0 2px var(--surface), 0 0 0 4px var(--accent)"
                        : "none",
                      transition: "box-shadow .15s ease",
                    }}
                  >
                    {active && (
                      <Check size={14} color="var(--on-accent)" aria-hidden />
                    )}
                  </button>
                );
              })}
            </div>
          </SettingRow>

          {/* Density. */}
          <SettingRow
            divider
            title={t("settings.appearance.density.label")}
            description={t("settings.appearance.density.description")}
          >
            <SegmentedControl<Density>
              aria-label={t("settings.appearance.density.label")}
              value={density}
              onChange={setDensity}
              options={[
                {
                  value: "comfortable",
                  label: t("settings.appearance.density.comfortable"),
                },
                {
                  value: "compact",
                  label: t("settings.appearance.density.compact"),
                },
              ]}
            />
          </SettingRow>

          {/* Version + guarded update check. */}
          <SettingRow
            divider
            title={t("settings.version.label")}
            description={t("settings.version.value", { version: appVersion })}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--space-3)",
              }}
            >
              <Badge
                variant={updateStatus === "upToDate" ? "success" : "neutral"}
                dot
              >
                {updateStatus === "upToDate"
                  ? t("settings.version.upToDate")
                  : t("settings.version.notConfigured")}
              </Badge>
              <Button
                variant="secondary"
                size="sm"
                loading={checking}
                onClick={() => void checkForUpdates()}
              >
                {t("settings.version.checkForUpdates")}
              </Button>
            </div>
          </SettingRow>
        </Card>

        {/* Card 2 — contact & support. */}
        <Card>
          <SettingRow
            title={t("settings.support.title")}
            description={t("settings.support.description")}
          >
            <Button
              variant="secondary"
              size="sm"
              icon={<ExternalLink size={15} aria-hidden />}
              onClick={() => void reportIssue()}
            >
              {t("settings.support.reportIssue")}
            </Button>
          </SettingRow>
        </Card>
      </div>
    </div>
  );
}

/**
 * One settings row: a title + description block on the left, a control on the
 * right. `divider` adds the hairline top rule used between rows in a Card.
 */
function SettingRow({
  title,
  description,
  divider = false,
  children,
}: {
  title: string;
  description?: string;
  divider?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "var(--space-4)",
        ...(divider
          ? {
              marginTop: 16,
              paddingTop: 16,
              borderTop: "1px solid var(--border)",
            }
          : {}),
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 2,
          minWidth: 0,
          flex: 1,
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: "var(--fs-body)",
            fontWeight: "var(--weight-semibold)",
            color: "var(--text)",
          }}
        >
          {title}
        </span>
        {description != null && (
          <span
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: "var(--fs-body-sm)",
              color: "var(--text-2)",
            }}
          >
            {description}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}
