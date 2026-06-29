/**
 * AccountSwitcher — the sidebar footer's active-config card.
 *
 * A display-forward button: it shows the active identity (gradient initials disc
 * + label + meta) read from the thin `activeIdentity` cache the queries layer
 * hydrates, with a muted right chevron as a navigation affordance. Clicking it
 * navigates to Configurations (`go("configs")`), where accounts/providers are
 * switched and the honest add-account capture modal lives — the footer itself no
 * longer opens an inline switch popover. Token-only styling.
 *
 * Outside Tauri the query layer serves a clearly-labelled DEMO seed, so the card
 * still shows an identity in `vite dev` / the gallery.
 */
import { ChevronRight } from "@/ui/icons";
import { useShellStore } from "@/lib/store";

/* ----------------------------------------------------------------------------
 * AccountAvatar — the gradient initials disc for a Claude account/identity.
 * Gradient is picked from a token-only palette by position, so identities stay
 * visually distinct without any hardcoded hex.
 * ------------------------------------------------------------------------- */
const AVATAR_GRADIENTS = [
  "linear-gradient(135deg, var(--clay-300), var(--clay-700))",
  "linear-gradient(135deg, var(--accent-violet), var(--accent-blue))",
  "linear-gradient(135deg, var(--success), var(--accent-green))",
];

export function AccountAvatar({
  seed,
  index,
  size,
  fontSize,
}: {
  /** The initials/letters to show. */
  seed: string;
  index: number;
  size: number;
  fontSize: number;
}) {
  return (
    <span
      aria-hidden
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: "var(--radius-pill)",
        background: AVATAR_GRADIENTS[index % AVATAR_GRADIENTS.length],
        color: "var(--on-accent)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "var(--font-sans)",
        fontSize,
        fontWeight: 600,
        letterSpacing: "0.01em",
      }}
    >
      {seed}
    </span>
  );
}

/** Up-to-two-letter initials from a display label. */
export function initialsOf(label: string): string {
  const parts = label.trim().split(/\s+/).filter((p) => /[a-z0-9]/i.test(p));
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function AccountSwitcher() {
  const identity = useShellStore((s) => s.activeIdentity);
  const go = useShellStore((s) => s.go);

  const sub =
    identity.kind === "provider"
      ? identity.model ?? "Provider"
      : identity.tier
        ? `Claude · ${identity.tier}`
        : "Claude";

  // The active-config card — navigates to Configurations.
  return (
    <button
      type="button"
      onClick={() => go("configs")}
      aria-label="View accounts in Configurations"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 9,
        width: "100%",
        padding: "7px 9px",
        borderRadius: 10,
        border: "1px solid var(--border)",
        background: "var(--surface)",
        cursor: "default",
        textAlign: "left",
      }}
    >
      <AccountAvatar seed={initialsOf(identity.label)} index={0} size={28} fontSize={11} />
      <span
        style={{
          display: "flex",
          flexDirection: "column",
          minWidth: 0,
          flex: 1,
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: 12.5,
            fontWeight: 600,
            color: "var(--text)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {identity.label}
        </span>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10.5,
            fontWeight: 450,
            color: "var(--text-3)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {sub}
        </span>
      </span>
      <ChevronRight
        size={15}
        color="var(--text-3)"
        style={{ flexShrink: 0 }}
        aria-hidden
      />
    </button>
  );
}
