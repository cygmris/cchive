/**
 * AccountSwitcher — the keyring switcher Popover anchored to the sidebar's
 * active-config card.
 *
 * The card (gradient initials disc + active-identity label + meta + chevron) is
 * the Popover trigger; it reads the thin `activeIdentity` cache the queries layer
 * hydrates. Opening reveals a panel that lists the real Claude accounts
 * (`useAccounts()`) and API providers (`useProviders()`) with a check on the live
 * active one (`useActiveIdentity()`); selecting a row performs the real switch
 * (`useSwitchAccount` / `useApplyProvider`) and closes on success, and the
 * "Sign in with Claude" row opens the add-account capture modal via
 * `openAddAccount`. Open state is controlled by the store (`switcherOpen`);
 * Esc / click-outside close it. Token-only styling.
 *
 * Outside Tauri the query layer serves a clearly-labelled DEMO seed, so the
 * panel still lists rows in `vite dev` / the gallery (switching no-ops with a
 * "desktop app only" toast).
 */
import { Popover } from "@/ui/Popover";
import { ProviderChip } from "@/ui/Badge";
import { Check, ChevronsUpDown, Plus } from "@/ui/icons";
import { useToast } from "@/ui/Toast";
import {
  useAccounts,
  useActiveIdentity,
  useApplyProvider,
  useProviders,
  useSwitchAccount,
} from "@/lib/queries";
import { useShellStore } from "@/lib/store";
import type { AccountMeta, ActiveIdentity, ProviderMeta } from "@/lib/types";
import { brandForProvider } from "@/screens/configurations/ProviderRow";

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

/** Uppercase eyebrow separating the accounts / providers groups in the panel. */
const sectionLabelStyle: React.CSSProperties = {
  fontFamily: "var(--font-sans)",
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "var(--text-3)",
  padding: "6px 9px 3px",
};

/** A thin hairline divider between panel groups. */
function PanelDivider() {
  return (
    <div
      aria-hidden
      style={{ height: 1, background: "var(--border)", margin: "5px 4px" }}
    />
  );
}

/* Active-row predicates — kept in parity with the Configurations screen
 * (`screens/configurations/index.tsx`); importing them there would form a cycle
 * (index → AccountRow → AccountSwitcher). */

/** Is `account` the live active session? Match on email, else display label. */
function accountIsActive(
  account: AccountMeta,
  identity: ActiveIdentity | undefined,
): boolean {
  if (!identity || identity.kind !== "account") return false;
  if (account.email && identity.email) return account.email === identity.email;
  return identity.label === account.label;
}

/** Is `provider` the live active configuration? Match on label, else model. */
function providerIsActive(
  provider: ProviderMeta,
  identity: ActiveIdentity | undefined,
): boolean {
  if (!identity || identity.kind !== "provider") return false;
  if (identity.label === provider.label) return true;
  return Boolean(provider.model && identity.model === provider.model);
}

/** The two-line name/sub text column shared by account + provider rows. */
function RowText({ name, sub }: { name: string; sub: string | null }) {
  return (
    <span
      style={{ display: "flex", flexDirection: "column", minWidth: 0, flex: 1 }}
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
        {name}
      </span>
      {sub && (
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
      )}
    </span>
  );
}

export function AccountSwitcher() {
  const switcherOpen = useShellStore((s) => s.switcherOpen);
  const openSwitcher = useShellStore((s) => s.openSwitcher);
  const closeSwitcher = useShellStore((s) => s.closeSwitcher);
  const openAddAccount = useShellStore((s) => s.openAddAccount);
  const identity = useShellStore((s) => s.activeIdentity);

  const { toast } = useToast();
  const accounts = useAccounts();
  const providers = useProviders();
  const { data: active } = useActiveIdentity();
  const switchAccount = useSwitchAccount();
  const applyProvider = useApplyProvider();

  const accountList = accounts.data ?? [];
  const providerList = providers.data ?? [];

  const sub =
    identity.kind === "provider"
      ? identity.model ?? "Provider"
      : identity.tier
        ? `Claude · ${identity.tier}`
        : "Claude";

  /** Switch to a saved account; close the panel on success, toast either way. */
  function selectAccount(account: AccountMeta, close: () => void) {
    if (accountIsActive(account, active) || switchAccount.isPending) {
      close();
      return;
    }
    switchAccount.mutate(account.id, {
      onSuccess: () => {
        toast({
          title: "Account switched",
          description: account.label,
          variant: "success",
        });
        close();
      },
      onError: (error) =>
        toast({
          title: "Couldn't switch account",
          description: error.message,
          variant: "danger",
        }),
    });
  }

  /** Apply a provider preset (non-secret env only); close on success. */
  function selectProvider(provider: ProviderMeta, close: () => void) {
    if (providerIsActive(provider, active) || applyProvider.isPending) {
      close();
      return;
    }
    const env: Record<string, string> = {};
    if (provider.baseUrl) env.ANTHROPIC_BASE_URL = provider.baseUrl;
    if (provider.model) env.ANTHROPIC_MODEL = provider.model;
    applyProvider.mutate(
      { meta: provider, env },
      {
        onSuccess: () => {
          toast({
            title: "Provider applied",
            description: provider.label,
            variant: "success",
          });
          close();
        },
        onError: (error) =>
          toast({
            title: "Couldn't apply provider",
            description: error.message,
            variant: "danger",
          }),
      },
    );
  }

  // The active-config card — the Popover trigger.
  const card = (
    <button
      type="button"
      aria-haspopup="dialog"
      aria-expanded={switcherOpen}
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
      open={switcherOpen}
      onOpenChange={(next) => (next ? openSwitcher() : closeSwitcher())}
      placement="top-start"
      offsetPx={8}
      modal
      style={{ width: 248, padding: 6 }}
    >
      {({ close }) => (
        <div role="menu" style={{ display: "flex", flexDirection: "column" }}>
          {accountList.length > 0 && (
            <>
              <div style={sectionLabelStyle}>Claude accounts</div>
              {accountList.map((account, i) => {
                const isActive = accountIsActive(account, active);
                return (
                  <button
                    key={account.id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={isActive}
                    onClick={() => selectAccount(account, close)}
                    className="hover:bg-hover"
                    style={rowStyle}
                  >
                    <AccountAvatar
                      seed={initialsOf(account.label)}
                      index={i}
                      size={26}
                      fontSize={10.5}
                    />
                    <RowText
                      name={account.label}
                      sub={account.tier ? `Claude · ${account.tier}` : "Claude"}
                    />
                    {isActive && (
                      <Check
                        size={15}
                        color="var(--accent)"
                        style={{ flexShrink: 0 }}
                        aria-hidden
                      />
                    )}
                  </button>
                );
              })}
              <PanelDivider />
            </>
          )}

          {providerList.length > 0 && (
            <>
              <div style={sectionLabelStyle}>API providers</div>
              {providerList.map((provider) => {
                const isActive = providerIsActive(provider, active);
                return (
                  <button
                    key={provider.id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={isActive}
                    onClick={() => selectProvider(provider, close)}
                    className="hover:bg-hover"
                    style={rowStyle}
                  >
                    <ProviderChip
                      provider={brandForProvider(provider)}
                      size={26}
                    />
                    <RowText
                      name={provider.label}
                      sub={provider.model ?? provider.baseUrl}
                    />
                    {isActive && (
                      <Check
                        size={15}
                        color="var(--accent)"
                        style={{ flexShrink: 0 }}
                        aria-hidden
                      />
                    )}
                  </button>
                );
              })}
              <PanelDivider />
            </>
          )}

          <button
            type="button"
            onClick={() => {
              close();
              openAddAccount();
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
        </div>
      )}
    </Popover>
  );
}
