/**
 * EnvOverrideBanner — a non-blocking warning shown when an environment variable
 * overrides cchive's file/keychain switching.
 *
 * When {@link useEnvOverrides} reports `CLAUDE_CODE_OAUTH_TOKEN` is set, that
 * token takes precedence over whatever cchive writes to the credential file /
 * keychain, so switching accounts silently has no effect. We surface a
 * warning-semantic banner (token-only tint) telling the user to unset it. It is
 * non-blocking and dismissible for the session (a plain `useState`, so it
 * reappears next launch while the override persists).
 */
import { useState } from "react";
import { IconButton } from "@/ui/IconButton";
import { Warning, X } from "@/ui/icons";
import { useEnvOverrides } from "@/lib/queries";

export function EnvOverrideBanner() {
  const { data } = useEnvOverrides();
  const [dismissed, setDismissed] = useState(false);

  if (dismissed || !data?.oauthTokenSet) return null;

  return (
    <div
      role="alert"
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: "var(--space-2_5)",
        padding: "12px 14px",
        background: "color-mix(in srgb, var(--warning) 14%, transparent)",
        border: "1px solid color-mix(in srgb, var(--warning) 32%, transparent)",
        borderRadius: "var(--radius-xl)",
      }}
    >
      <Warning
        size={17}
        aria-hidden
        style={{ color: "var(--warning)", flexShrink: 0, marginTop: 1 }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: "var(--fs-body-sm)",
            fontWeight: "var(--weight-semibold)",
            color: "var(--text)",
          }}
        >
          Switching is overridden by an environment variable
        </div>
        <div
          style={{
            marginTop: 2,
            fontFamily: "var(--font-sans)",
            fontSize: "var(--fs-body-sm)",
            lineHeight: "var(--lh-body-sm)",
            color: "var(--text-2)",
          }}
        >
          <code
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "var(--fs-mono-sm)",
              color: "var(--text)",
            }}
          >
            CLAUDE_CODE_OAUTH_TOKEN
          </code>{" "}
          is set, so it takes precedence over the credential file and keychain.
          Switching accounts here has no effect until you unset it.
        </div>
      </div>
      <IconButton
        size="sm"
        aria-label="Dismiss warning"
        icon={<X size={15} />}
        onClick={() => setDismissed(true)}
      />
    </div>
  );
}
