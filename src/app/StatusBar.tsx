/**
 * StatusBar — the 30px machine-readout line spanning the bottom of the window.
 *
 * Reads entirely from the shell store via `selectStatus`: a green "live" pulse
 * dot + the active config name, then the model id, a flex spacer, the MCP /
 * Skills enabled counts, today's token total and a success-green "Synced". All
 * values update reactively when the active config or counters change. Mono 11px
 * throughout (machine text), token-only styling.
 */
import { useTranslation } from "react-i18next";
import { selectStatus, useShellStore } from "@/lib/store";

/** A 13px vertical hairline separating status groups. */
function Divider() {
  return (
    <span
      aria-hidden
      style={{
        width: 1,
        height: 13,
        background: "var(--border)",
        margin: "0 12px",
      }}
    />
  );
}

export function StatusBar() {
  const { t } = useTranslation();
  const status = selectStatus(useShellStore());

  return (
    <div
      style={{
        height: 30,
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        padding: "0 12px",
        background: "var(--sidebar-bg)",
        borderTop: "1px solid var(--border)",
        fontFamily: "var(--font-mono)",
        fontSize: "var(--fs-mono-sm)",
        fontWeight: 450,
        color: "var(--text-3)",
      }}
    >
      <style>
        {"@keyframes cchive-status-pulse{0%,100%{opacity:1}50%{opacity:.45}}"}
      </style>

      {/* Live indicator + active config name */}
      <span
        style={{
          display: "flex",
          alignItems: "center",
          gap: 7,
          color: "var(--text-2)",
        }}
      >
        <span
          aria-hidden
          style={{
            width: 7,
            height: 7,
            borderRadius: "var(--radius-pill)",
            background: "var(--success-strong)",
            boxShadow: "var(--ring-success)",
            animation: "cchive-status-pulse 2.4s ease-in-out infinite",
          }}
        />
        {status.name}
      </span>

      <Divider />
      <span>{status.model}</span>

      <span style={{ flex: 1 }} />

      <span>
        {t("status.mcp")}&nbsp;
        <span style={{ color: "var(--text-2)" }}>{status.mcpEnabledCount}</span>
      </span>
      <Divider />
      <span>
        {t("status.skills")}&nbsp;
        <span style={{ color: "var(--text-2)" }}>
          {status.skillsEnabledCount}
        </span>
      </span>
      <Divider />
      <span>
        <span style={{ color: "var(--text-2)" }}>{status.tokensToday}</span>
        &nbsp;{t("status.tokToday")}
      </span>
      <Divider />
      <span style={{ color: "var(--success)" }}>{t("status.synced")}</span>
    </div>
  );
}
