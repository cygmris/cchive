/**
 * Configurations — the real keyring screen (replaces the S2 placeholder).
 *
 * Two sections over the TanStack Query data layer: "Claude accounts"
 * ({@link useAccounts} rendered as {@link AccountRow}s, with "Add current
 * account" opening {@link AddAccountModal}) and "API providers"
 * ({@link useProviders} rendered as {@link ProviderRow}s, with the
 * {@link NewProviderMenu} split button). The {@link EnvOverrideBanner} slots in
 * at the top; a verbatim footer note explains the on-disk side effect. The live
 * active row (from {@link useActiveIdentity}) carries the accent wash + "Active"
 * badge. An empty state invites the first capture when no accounts exist.
 *
 * Outside Tauri the query layer serves a clearly-labelled DEMO seed, so the
 * screen still renders in `vite dev` / the gallery.
 */
import { Button } from "@/ui/Button";
import { Card } from "@/ui/Card";
import { Plus } from "@/ui/icons";
import { ScreenHeader } from "@/app/ScreenHeader";
import {
  useAccounts,
  useActiveIdentity,
  useProviders,
} from "@/lib/queries";
import { useShellStore } from "@/lib/store";
import type { AccountMeta, ActiveIdentity, ProviderMeta } from "@/lib/types";
import { AccountRow } from "./AccountRow";
import { EnvOverrideBanner } from "./EnvOverrideBanner";
import { NewProviderMenu } from "./NewProviderMenu";
import { ProviderRow } from "./ProviderRow";

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

/** Uppercase section eyebrow + a trailing action, e.g. a primary button. */
function SectionHeader({
  label,
  action,
}: {
  label: string;
  action: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "var(--space-3)",
        marginBottom: "var(--space-3)",
      }}
    >
      <span
        style={{
          fontFamily: "var(--font-sans)",
          fontSize: "var(--fs-label)",
          fontWeight: "var(--weight-semibold)",
          letterSpacing: "var(--ls-label)",
          textTransform: "uppercase",
          color: "var(--text-3)",
        }}
      >
        {label}
      </span>
      {action}
    </div>
  );
}

/** Centered empty state shown when no accounts are captured yet. */
function AccountsEmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "var(--space-3)",
        padding: "var(--space-8) var(--space-6)",
        textAlign: "center",
      }}
    >
      <span
        style={{
          fontFamily: "var(--font-sans)",
          fontSize: "var(--fs-body)",
          color: "var(--text-2)",
        }}
      >
        No Claude accounts captured yet.
      </span>
      <span
        style={{
          fontFamily: "var(--font-sans)",
          fontSize: "var(--fs-body-sm)",
          color: "var(--text-3)",
          maxWidth: 320,
        }}
      >
        Capture the account you are signed into in Claude Code to add it to your
        keyring.
      </span>
      <Button icon={<Plus size={16} />} onClick={onAdd}>
        Add current account
      </Button>
    </div>
  );
}

/** A muted single-line message inside a section card (loading / empty providers). */
function CardNote({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: "var(--space-5) var(--space-4)",
        fontFamily: "var(--font-sans)",
        fontSize: "var(--fs-body-sm)",
        color: "var(--text-3)",
        textAlign: "center",
      }}
    >
      {children}
    </div>
  );
}

export function ConfigurationsScreen() {
  const openAddAccount = useShellStore((s) => s.openAddAccount);
  const accounts = useAccounts();
  const providers = useProviders();
  const { data: identity } = useActiveIdentity();

  const accountList = accounts.data ?? [];
  const providerList = providers.data ?? [];

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
        title="Configurations"
        description="Your keyring — Claude accounts and custom API providers in one place. Switch instantly."
      />

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-6)",
          padding: "0 var(--gutter) var(--space-8)",
        }}
      >
        <EnvOverrideBanner />

        {/* Claude accounts ------------------------------------------------ */}
        <section>
          <SectionHeader
            label="Claude accounts"
            action={
              <Button
                size="sm"
                icon={<Plus size={15} />}
                onClick={openAddAccount}
              >
                Add current account
              </Button>
            }
          />
          <Card pad={0} style={{ overflow: "hidden" }}>
            {accounts.isLoading ? (
              <CardNote>Loading accounts…</CardNote>
            ) : accountList.length === 0 ? (
              <AccountsEmptyState onAdd={openAddAccount} />
            ) : (
              accountList.map((account, i) => (
                <AccountRow
                  key={account.id}
                  account={account}
                  index={i}
                  divider={i > 0}
                  active={accountIsActive(account, identity)}
                />
              ))
            )}
          </Card>
        </section>

        {/* API providers -------------------------------------------------- */}
        <section>
          <SectionHeader label="API providers" action={<NewProviderMenu />} />
          <Card pad={0} style={{ overflow: "hidden" }}>
            {providers.isLoading ? (
              <CardNote>Loading providers…</CardNote>
            ) : providerList.length === 0 ? (
              <CardNote>No API providers yet. Add one with “New provider”.</CardNote>
            ) : (
              providerList.map((provider, i) => (
                <ProviderRow
                  key={provider.id}
                  provider={provider}
                  divider={i > 0}
                  active={providerIsActive(provider, identity)}
                />
              ))
            )}
          </Card>
        </section>

        <p
          style={{
            margin: 0,
            fontFamily: "var(--font-mono)",
            fontSize: "var(--fs-mono-sm)",
            lineHeight: "var(--lh-mono-sm)",
            color: "var(--text-3)",
          }}
        >
          Switching writes ~/.claude/settings.json — restart your Claude Code
          session to apply.
        </p>
      </div>
    </div>
  );
}
