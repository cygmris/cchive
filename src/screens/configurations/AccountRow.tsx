/**
 * AccountRow — one saved Claude account in the Configurations "Claude accounts"
 * list.
 *
 * Layout (design §3): radio · gradient avatar · name + email (mono) · tier badge
 * · "Active" badge (live one) · sign-out icon button. Selecting the row (radio
 * or anywhere on it) switches the active account via {@link useSwitchAccount};
 * sign-out asks a confirm (warning copy when removing the active one) then forgets
 * the saved copy via {@link useRemoveAccount} — the live credential is untouched.
 *
 * The UI changes only on mutation success (the query cache is invalidated by the
 * hooks); failures raise a toast and leave the prior active config in place.
 */
import { Badge } from "@/ui/Badge";
import { IconButton } from "@/ui/IconButton";
import { Radio } from "@/ui/Radio";
import { LogOut } from "@/ui/icons";
import { useToast } from "@/ui/Toast";
import { AccountAvatar, initialsOf } from "@/app/AccountSwitcher";
import { useRemoveAccount, useSwitchAccount } from "@/lib/queries";
import type { AccountMeta, SwitchResult } from "@/lib/types";

export interface AccountRowProps {
  account: AccountMeta;
  /** Whether this is the live active account. */
  active: boolean;
  /** Position in the list, for the avatar gradient + the divider. */
  index: number;
  /** Draw a hairline divider above the row (every row but the first). */
  divider: boolean;
  /** The live plan tier for the ACTIVE account (from the current identity). The
   * stored `account.tier` is a capture-time snapshot that goes stale after a plan
   * upgrade; for the active row we show this live value instead. */
  liveTier?: string | null;
}

export function AccountRow({
  account,
  active,
  index,
  divider,
  liveTier,
}: AccountRowProps) {
  const { toast } = useToast();
  const switchAccount = useSwitchAccount();
  const removeAccount = useRemoveAccount();

  const name = account.label;
  const email = account.email;
  // The active account's badge follows the live identity (fresh after an upgrade);
  // other rows show their capture-time snapshot (their live tier is unknowable
  // without switching to them).
  const tier = active ? (liveTier ?? account.tier) : account.tier;

  function select() {
    if (active || switchAccount.isPending) return;
    switchAccount.mutate(account.id, {
      onSuccess: (result) =>
        toast({
          title: "Account switched",
          description: switchDescription(name, result),
          variant: "success",
        }),
      onError: (error) => toast({ ...switchError(name, error), variant: "danger" }),
    });
  }

  function signOut() {
    const message = active
      ? `Sign out ${name}? This is the active account. cchive forgets only its saved copy — your live Claude Code credential is untouched.`
      : `Sign out ${name}? cchive forgets its saved copy — your live Claude Code credential is untouched.`;
    if (!window.confirm(message)) return;
    removeAccount.mutate(account.id, {
      onSuccess: () =>
        toast({
          title: "Account removed",
          description: name,
          variant: "success",
        }),
      onError: (error) =>
        toast({
          title: "Couldn't remove account",
          description: error.message,
          variant: "danger",
        }),
    });
  }

  return (
    <div
      onClick={select}
      className={active ? undefined : "hover:bg-hover"}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "var(--space-3)",
        padding: "12px 16px",
        cursor: "default",
        borderTop: divider ? "1px solid var(--border)" : "none",
        ...(active ? { background: "var(--accent-tint)" } : null),
      }}
    >
      <Radio
        checked={active}
        aria-label={`Use ${name}`}
        onClick={(e) => {
          e.stopPropagation();
          select();
        }}
      />
      <AccountAvatar
        seed={initialsOf(name)}
        index={index}
        size={34}
        fontSize={13}
      />
      <div style={{ display: "flex", flexDirection: "column", minWidth: 0, flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
          <span
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: "var(--fs-body)",
              fontWeight: "var(--weight-semibold)",
              color: "var(--text)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {name}
          </span>
          {tier && <Badge variant="neutral">{tier}</Badge>}
          {active && <Badge variant="accent" dot>Active</Badge>}
        </div>
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
      <IconButton
        danger
        aria-label={`Sign out ${name}`}
        icon={<LogOut size={16} />}
        disabled={removeAccount.isPending}
        onClick={(e) => {
          e.stopPropagation();
          signOut();
        }}
      />
    </div>
  );
}

/**
 * What actually happened, in one line. A switch has four shapes and they are
 * not interchangeable: a refreshed token means the account is ready to use,
 * while a token we could not refresh may need Claude Code to retry on its own.
 * Running sessions are worth naming too — they hold the credential they already
 * read, so they stay on the previous account.
 */
export function switchDescription(name: string, result: SwitchResult): string {
  const parts = [name];
  switch (result.freshen.status) {
    case "refreshed":
      parts.push("token refreshed");
      break;
    case "skippedTransient":
      parts.push(
        `token not refreshed (${result.freshen.detail ?? "network"}) — Claude Code will retry`,
      );
      break;
    case "skippedActive":
    case "notNeeded":
      break;
  }
  if (result.liveSessions > 0) {
    parts.push(
      `${result.liveSessions} Claude Code ${result.liveSessions === 1 ? "session is" : "sessions are"} running and stay on the previous account`,
    );
  }
  return parts.join(" · ");
}

/**
 * Turn a failed switch into something the user can act on. Two failures have a
 * specific remedy and deserve to say so rather than repeat the backend string:
 * a credential the server has rejected needs a fresh sign-in and re-capture,
 * and a busy lock just needs another try once Claude Code finishes its own
 * refresh.
 */
export function switchError(
  name: string,
  error: Error & { code?: string },
): { title: string; description: string } {
  switch (error.code) {
    case "CREDENTIAL_DEAD":
      return {
        title: `${name} needs signing in again`,
        description:
          "Its saved credential was rejected. Sign in to this account in Claude Code, then capture it again.",
      };
    case "LOCK_BUSY":
      return {
        title: "Claude Code is busy",
        description:
          "It is refreshing its own token right now. Nothing was changed — try again in a moment.",
      };
    case "CORRUPT_FILE":
      return {
        title: `${name} can't be activated`,
        description: `${error.message} Nothing was changed.`,
      };
    default:
      return { title: "Couldn't switch account", description: error.message };
  }
}
