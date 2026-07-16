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
import { useState } from "react";
import { Card } from "@/ui/Card";
import { useTranslation } from "react-i18next";
import { Plus, UserPlus } from "@/ui/icons";
import { ScreenHeader } from "@/app/ScreenHeader";
import { useToast } from "@/ui/Toast";
import {
  accountIsActive,
  useAccounts,
  useActiveAccountCapture,
  useActiveCodexIdentity,
  useActiveIdentity,
  useAddCurrentCodexAccount,
  useClearCodexProvider,
  useCodexAccounts,
  useCodexProviders,
  useProviders,
} from "@/lib/queries";
import { useShellStore } from "@/lib/store";
import type {
  ActiveIdentity,
  CodexAccountMeta,
  CodexIdentity,
  CodexProviderMeta,
  ProviderMeta,
} from "@/lib/types";
import { AccountRow } from "./AccountRow";
import { CodexAccountRow } from "./CodexAccountRow";
import { CodexProviderForm } from "./CodexProviderForm";
import { CodexProviderRow } from "./CodexProviderRow";
import { EnvOverrideBanner } from "./EnvOverrideBanner";
import { NewProviderMenu } from "./NewProviderMenu";
import { ProviderRow } from "./ProviderRow";

/** Is `provider` the live active Codex gateway? Match on label, else base-url host. */
function codexProviderIsActive(
  provider: CodexProviderMeta,
  identity: CodexIdentity | undefined,
): boolean {
  if (!identity || identity.kind !== "provider") return false;
  if (identity.label === provider.label) return true;
  const host = provider.baseUrl.split("://").pop()?.split("/")[0] ?? "";
  return Boolean(identity.email && host && identity.email === host);
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

/** Is `account` the live active Codex account? Match on email, else label. */
function codexAccountIsActive(
  account: CodexAccountMeta,
  identity: CodexIdentity | undefined,
): boolean {
  if (!identity || identity.kind === "none") return false;
  if (identity.email && account.email) return identity.email === account.email;
  return identity.label === account.label;
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

/**
 * Centered empty state shown when no accounts are captured yet. When the live
 * active account is itself uncaptured, `signedInAs` carries the concrete copy
 * (it names the detected email) so the first capture is one click; otherwise the
 * generic invitation shows.
 */
function AccountsEmptyState({
  onAdd,
  signedInAs,
}: {
  onAdd: () => void;
  signedInAs: string | null;
}) {
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
      {signedInAs ? (
        <span
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: "var(--fs-body)",
            color: "var(--text-2)",
            maxWidth: 320,
          }}
        >
          {signedInAs}
        </span>
      ) : (
        <>
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
            Capture the account you are signed into in Claude Code to add it to
            your keyring.
          </span>
        </>
      )}
      <Button icon={<Plus size={16} />} onClick={onAdd}>
        Add current account
      </Button>
    </div>
  );
}

/**
 * The uncaptured-active banner — rendered as the first row of the accounts card
 * when the live active account isn't saved yet (and other accounts exist). An
 * accent-tinted left edge + {@link UserPlus} mark it as an invitation; the
 * capture button opens the same explicit {@link AddAccountModal} as everywhere
 * else (no silent write). `email` names the detected account when known.
 */
function CaptureActiveRow({
  email,
  onCapture,
}: {
  email: string | null;
  onCapture: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "var(--space-3)",
        padding: "12px 16px",
        background: "var(--accent-tint)",
        borderLeft: "2px solid var(--accent)",
      }}
    >
      <UserPlus size={18} active />
      <div
        style={{ display: "flex", flexDirection: "column", minWidth: 0, flex: 1 }}
      >
        <span
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: "var(--fs-body-sm)",
            fontWeight: "var(--weight-semibold)",
            color: "var(--text)",
          }}
        >
          {t("configs.capture.uncaptured")}
        </span>
        {email && (
          <span
            style={{
              marginTop: 2,
              fontFamily: "var(--font-mono)",
              fontSize: "var(--fs-mono-sm)",
              color: "var(--text-3)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {email}
          </span>
        )}
      </div>
      <Button size="sm" icon={<UserPlus size={15} />} onClick={onCapture}>
        {t("configs.capture.addToVault")}
      </Button>
    </div>
  );
}

/**
 * Empty state for the Codex section. When the live Codex login is itself
 * uncaptured, `signedInAs` names it so the first capture is one click.
 */
function CodexEmptyState({
  onAdd,
  signedInAs,
}: {
  onAdd: () => void;
  signedInAs: string | null;
}) {
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
      {signedInAs ? (
        <span
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: "var(--fs-body)",
            color: "var(--text-2)",
            maxWidth: 320,
          }}
        >
          {signedInAs}
        </span>
      ) : (
        <>
          <span
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: "var(--fs-body)",
              color: "var(--text-2)",
            }}
          >
            No Codex accounts captured yet.
          </span>
          <span
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: "var(--fs-body-sm)",
              color: "var(--text-3)",
              maxWidth: 320,
            }}
          >
            Capture the account you are signed into in Codex to add it to your
            keyring.
          </span>
        </>
      )}
      <Button icon={<Plus size={16} />} onClick={onAdd}>
        Add current Codex account
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
  const { t } = useTranslation();
  const openAddAccount = useShellStore((s) => s.openAddAccount);
  const accounts = useAccounts();
  const providers = useProviders();
  const { data: identity } = useActiveIdentity();
  const { needsCapture, email } = useActiveAccountCapture();
  const { toast } = useToast();
  const codexAccounts = useCodexAccounts();
  const { data: codexIdentity } = useActiveCodexIdentity();
  const addCodex = useAddCurrentCodexAccount();
  const codexProviders = useCodexProviders();
  const clearCodexProvider = useClearCodexProvider();
  const [addingGateway, setAddingGateway] = useState(false);

  const accountList = accounts.data ?? [];
  const providerList = providers.data ?? [];
  const codexList = codexAccounts.data ?? [];
  const codexProviderList = codexProviders.data ?? [];
  const codexProviderActive = codexIdentity?.kind === "provider";

  function captureCodex() {
    addCodex.mutate(undefined, {
      onSuccess: (m) =>
        toast({
          title: "Codex account added",
          description: m.label,
          variant: "success",
        }),
      onError: (e) =>
        toast({
          title: "Couldn't add Codex account",
          description: e.message,
          variant: "danger",
        }),
    });
  }

  // Name the live Codex login when it isn't captured yet (one-click first add).
  const codexCaptured = codexIdentity
    ? codexList.some((a) => codexAccountIsActive(a, codexIdentity))
    : true;
  const codexSignedInAs =
    codexIdentity && codexIdentity.kind !== "none" && !codexCaptured
      ? `You're signed into Codex as ${
          codexIdentity.email ?? codexIdentity.label
        } — add it to your keyring.`
      : null;

  // Concrete empty-state copy that names the detected account; null falls back
  // to the generic invitation (no email, or already captured).
  const signedInAs =
    needsCapture && email ? t("configs.capture.signedInAs", { email }) : null;
  // The uncaptured-active banner only joins a non-empty list (the empty list
  // already names the account via `signedInAs`).
  const showCapture = needsCapture && accountList.length > 0;

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
        title={t("header.configs.title")}
        description={t("header.configs.description")}
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
              <AccountsEmptyState
                onAdd={openAddAccount}
                signedInAs={signedInAs}
              />
            ) : (
              <>
                {showCapture && (
                  <CaptureActiveRow email={email} onCapture={openAddAccount} />
                )}
                {accountList.map((account, i) => (
                  <AccountRow
                    key={account.id}
                    account={account}
                    index={i}
                    divider={showCapture || i > 0}
                    active={accountIsActive(account, identity)}
                    liveTier={identity?.tier}
                  />
                ))}
              </>
            )}
          </Card>
        </section>

        {/* Codex accounts ------------------------------------------------- */}
        <section>
          <SectionHeader
            label="Codex accounts"
            action={
              <Button
                size="sm"
                icon={<Plus size={15} />}
                onClick={captureCodex}
                disabled={addCodex.isPending}
              >
                Add current Codex account
              </Button>
            }
          />
          <Card pad={0} style={{ overflow: "hidden" }}>
            {codexAccounts.isLoading ? (
              <CardNote>Loading Codex accounts…</CardNote>
            ) : codexList.length === 0 ? (
              <CodexEmptyState onAdd={captureCodex} signedInAs={codexSignedInAs} />
            ) : (
              codexList.map((account, i) => (
                <CodexAccountRow
                  key={account.id}
                  account={account}
                  index={i}
                  divider={i > 0}
                  active={codexAccountIsActive(account, codexIdentity)}
                />
              ))
            )}
          </Card>
        </section>

        {/* Codex providers (gateways) ------------------------------------- */}
        <section>
          <SectionHeader
            label="Codex providers"
            action={
              <div style={{ display: "flex", gap: "var(--space-2)" }}>
                {codexProviderActive && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={clearCodexProvider.isPending}
                    onClick={() =>
                      clearCodexProvider.mutate(undefined, {
                        onSuccess: () =>
                          toast({
                            title: "Back to your Codex account",
                            variant: "success",
                          }),
                        onError: (e) =>
                          toast({
                            title: "Couldn't clear gateway",
                            description: e.message,
                            variant: "danger",
                          }),
                      })
                    }
                  >
                    Use my account
                  </Button>
                )}
                <Button
                  size="sm"
                  icon={<Plus size={15} />}
                  onClick={() => setAddingGateway((v) => !v)}
                >
                  Add gateway
                </Button>
              </div>
            }
          />
          <Card pad={0} style={{ overflow: "hidden" }}>
            {addingGateway && (
              <CodexProviderForm onClose={() => setAddingGateway(false)} />
            )}
            {codexProviders.isLoading ? (
              <CardNote>Loading Codex providers…</CardNote>
            ) : codexProviderList.length === 0 ? (
              !addingGateway && (
                <CardNote>
                  No Codex gateways yet. Add one to point Codex at an
                  OpenAI-compatible endpoint (e.g. your own LLM gateway).
                </CardNote>
              )
            ) : (
              codexProviderList.map((provider, i) => (
                <CodexProviderRow
                  key={provider.id}
                  provider={provider}
                  index={i}
                  divider={addingGateway || i > 0}
                  active={codexProviderIsActive(provider, codexIdentity)}
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
