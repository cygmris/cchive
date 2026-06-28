/**
 * AccountSwitcher — the keyring switcher Popover anchored to the sidebar's
 * active-config card.
 *
 * The card (avatar/brand-chip + name + meta + chevron) is the Popover trigger;
 * clicking it opens an upward panel listing the Claude accounts and API
 * providers, each selectable (a check marks the active one → `switchTo`), plus
 * a "Sign in with Claude" accent row (stubbed to a toast in S2). Open state is
 * controlled by the store (`switcherOpen`); Esc / click-outside close it.
 * Token-only styling.
 */
import { Popover } from "@/ui/Popover";
import { Badge, ProviderChip } from "@/ui/Badge";
import { Check, ChevronsUpDown, Plus } from "@/ui/icons";
import { useToast } from "@/ui/Toast";
import type { Account } from "@/lib/shell-types";
import { selectActiveConfig, useShellStore } from "@/lib/store";

/* ----------------------------------------------------------------------------
 * AccountAvatar — the gradient initials disc for a Claude account.
 * Gradient is picked from a token-only palette by the account's position, so
 * accounts stay visually distinct without any hardcoded hex.
 * ------------------------------------------------------------------------- */
const AVATAR_GRADIENTS = [
  "linear-gradient(135deg, var(--clay-300), var(--clay-700))",
  "linear-gradient(135deg, var(--accent-violet), var(--accent-blue))",
  "linear-gradient(135deg, var(--success), var(--accent-green))",
];

export function AccountAvatar({
  account,
  index,
  size,
  fontSize,
}: {
  account: Account;
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
      {account.avatarSeed}
    </span>
  );
}

/* ----------------------------------------------------------------------------
 * Shared row chrome.
 * ------------------------------------------------------------------------- */
const rowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 9,
  width: "100%",
  padding: "7px 9px",
  borderRadius: "var(--radius-md)",
  border: "none",
  background: "transparent",
  cursor: "default",
  textAlign: "left",
};

const eyebrowStyle: React.CSSProperties = {
  fontFamily: "var(--font-sans)",
  fontSize: 9.5,
  fontWeight: 600,
  letterSpacing: "0.09em",
  textTransform: "uppercase",
  color: "var(--text-3)",
  padding: "5px 9px 6px",
};

/** Either a check (active) or an 18px spacer so rows stay aligned. */
function CheckSlot({ active }: { active: boolean }) {
  return active ? (
    <Check size={16} active aria-label="Active" />
  ) : (
    <span aria-hidden style={{ width: 18, flexShrink: 0 }} />
  );
}

function Divider() {
  return (
    <div
      aria-hidden
      style={{ height: 1, background: "var(--border)", margin: "6px 4px" }}
    />
  );
}

export function AccountSwitcher() {
  const state = useShellStore();
  const { accounts, providers, activeConfigId, switchTo } = state;
  const active = selectActiveConfig(state);
  const { toast } = useToast();

  const activeAccountIndex = accounts.findIndex((a) => a.id === activeConfigId);

  // The active-config card — the Popover trigger.
  const card = (
    <button
      type="button"
      aria-haspopup="dialog"
      aria-expanded={state.switcherOpen}
      aria-label="Switch active configuration"
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
      {active.kind === "account" ? (
        <AccountAvatar
          account={active.config}
          index={activeAccountIndex < 0 ? 0 : activeAccountIndex}
          size={28}
          fontSize={11}
        />
      ) : (
        <ProviderChip provider={active.config.brand} size={28} />
      )}
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
          {active.kind === "account" ? active.config.name : active.config.title}
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
          {active.kind === "account"
            ? `Claude · ${active.config.tier}`
            : active.config.model}
        </span>
      </span>
      <ChevronsUpDown
        size={15}
        color="var(--text-3)"
        style={{ flexShrink: 0 }}
        aria-hidden
      />
    </button>
  );

  return (
    <Popover
      trigger={card}
      open={state.switcherOpen}
      onOpenChange={(next) =>
        next ? state.openSwitcher() : state.closeSwitcher()
      }
      placement="top-start"
      offsetPx={8}
      modal
      style={{ width: 220, padding: 6 }}
    >
      {({ close }) => (
        <>
          <div style={eyebrowStyle}>Claude accounts</div>
          {accounts.map((a, i) => {
            const isActive = a.id === activeConfigId;
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => switchTo(a.id)}
                className="hover:bg-hover"
                style={rowStyle}
              >
                <AccountAvatar account={a} index={i} size={26} fontSize={10.5} />
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
                      fontSize: 12,
                      fontWeight: 600,
                      color: "var(--text)",
                    }}
                  >
                    {a.name}
                  </span>
                  <span
                    style={{
                      fontFamily: "var(--font-sans)",
                      fontSize: 10,
                      fontWeight: 450,
                      color: "var(--text-3)",
                    }}
                  >
                    {a.org}
                  </span>
                </span>
                <Badge variant="accent">{a.tier}</Badge>
                <CheckSlot active={isActive} />
              </button>
            );
          })}

          <Divider />

          <div style={eyebrowStyle}>API providers</div>
          {providers.map((p) => {
            const isActive = p.id === activeConfigId;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => switchTo(p.id)}
                className="hover:bg-hover"
                style={rowStyle}
              >
                <ProviderChip provider={p.brand} size={26} />
                <span
                  style={{
                    flex: 1,
                    minWidth: 0,
                    fontFamily: "var(--font-sans)",
                    fontSize: 12,
                    fontWeight: 500,
                    color: "var(--text)",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {p.title}
                </span>
                <CheckSlot active={isActive} />
              </button>
            );
          })}

          <Divider />

          <button
            type="button"
            onClick={() => {
              close();
              toast({ description: "OAuth coming soon", variant: "info" });
            }}
            className="hover:bg-hover"
            style={rowStyle}
          >
            <span
              aria-hidden
              style={{
                width: 26,
                height: 26,
                borderRadius: "var(--radius-sm)",
                flexShrink: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "var(--accent)",
                color: "var(--on-accent)",
              }}
            >
              <Plus size={15} color="var(--on-accent)" />
            </span>
            <span
              style={{
                fontFamily: "var(--font-sans)",
                fontSize: 12,
                fontWeight: 600,
                color: "var(--text)",
              }}
            >
              Sign in with Claude
            </span>
          </button>
        </>
      )}
    </Popover>
  );
}
