/**
 * Experimental — the real screen (replaces the S2 placeholder).
 *
 * A warning banner (warning tint + dot) over an "Agent Teams" Card: a title +
 * description with a Switch bound to the Clavis-local `experimental.agentTeams`
 * pref; when on it reveals a "Teammate display mode" sub-row with a Select bound
 * to `experimental.teammateMode`. Both persist on change.
 *
 * These are Clavis app preferences only — NO Claude Code files are touched. The
 * flags hydrate from {@link getExperimentalPrefs} (corrupt/missing → defaults,
 * so this never throws and renders in `vite dev` / the gallery). All labels come
 * from i18n via {@link useTranslation}; styling is tokens-only.
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Card } from "@/ui/Card";
import { Select } from "@/ui/Select";
import { Switch } from "@/ui/Switch";
import { ScreenHeader } from "@/app/ScreenHeader";
import {
  getExperimentalPrefs,
  setExperimentalPref,
  DEFAULT_EXPERIMENTAL_PREFS,
  type TeammateMode,
} from "@/lib/prefs";

export function ExperimentalScreen() {
  const { t } = useTranslation();

  const [agentTeams, setAgentTeams] = useState(
    DEFAULT_EXPERIMENTAL_PREFS.agentTeams,
  );
  const [teammateMode, setTeammateMode] = useState<TeammateMode>(
    DEFAULT_EXPERIMENTAL_PREFS.teammateMode,
  );

  // Hydrate from persisted prefs once. Corrupt/missing prefs resolve to defaults
  // inside getExperimentalPrefs, so this never throws.
  useEffect(() => {
    let cancelled = false;
    void getExperimentalPrefs().then((prefs) => {
      if (cancelled) return;
      setAgentTeams(prefs.agentTeams);
      setTeammateMode(prefs.teammateMode);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function toggleAgentTeams(next: boolean) {
    setAgentTeams(next);
    void setExperimentalPref("agentTeams", next);
  }

  function changeTeammateMode(next: TeammateMode) {
    setTeammateMode(next);
    void setExperimentalPref("teammateMode", next);
  }

  const teammateModeOptions = [
    { label: t("experimental.teammateMode.auto"), value: "auto" },
    { label: t("experimental.teammateMode.inProcess"), value: "inProcess" },
    { label: t("experimental.teammateMode.splitPanes"), value: "splitPanes" },
  ];

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
        title={t("experimental.title")}
        description={t("experimental.description")}
      />

      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-3)",
          padding: "0 var(--gutter) var(--space-8)",
        }}
      >
        {/* Warning banner — warning tint + leading dot. */}
        <div
          role="alert"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--space-2_5)",
            padding: "12px 14px",
            background: "color-mix(in srgb, var(--warning) 14%, transparent)",
            border:
              "1px solid color-mix(in srgb, var(--warning) 32%, transparent)",
            borderRadius: "var(--radius-xl)",
          }}
        >
          <span
            aria-hidden
            style={{
              width: 7,
              height: 7,
              flexShrink: 0,
              borderRadius: "var(--radius-pill)",
              background: "var(--warning)",
            }}
          />
          <span
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: "var(--fs-body-sm)",
              lineHeight: "var(--lh-body-sm)",
              color: "var(--text)",
            }}
          >
            {t("experimental.warning")}
          </span>
        </div>

        {/* Agent Teams card. */}
        <Card>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--space-4)",
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
                {t("experimental.agentTeams.title")}
              </span>
              <span
                style={{
                  fontFamily: "var(--font-sans)",
                  fontSize: "var(--fs-body-sm)",
                  color: "var(--text-2)",
                }}
              >
                {t("experimental.agentTeams.description")}
              </span>
            </div>

            <Switch
              checked={agentTeams}
              aria-label={t("experimental.agentTeams.title")}
              onChange={toggleAgentTeams}
            />
          </div>

          {agentTeams && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--space-4)",
                marginTop: "16px",
                paddingTop: "16px",
                borderTop: "1px solid var(--border)",
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
                    fontWeight: "var(--weight-medium)",
                    color: "var(--text)",
                  }}
                >
                  {t("experimental.teammateMode.label")}
                </span>
                <span
                  style={{
                    fontFamily: "var(--font-sans)",
                    fontSize: "var(--fs-body-sm)",
                    color: "var(--text-2)",
                  }}
                >
                  {t("experimental.teammateMode.description")}
                </span>
              </div>

              <Select
                aria-label={t("experimental.teammateMode.label")}
                options={teammateModeOptions}
                value={teammateMode}
                onChange={(e) =>
                  changeTeammateMode(e.target.value as TeammateMode)
                }
                style={{ width: 220 }}
              />
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
