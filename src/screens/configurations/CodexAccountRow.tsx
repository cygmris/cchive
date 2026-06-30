/**
 * CodexAccountRow — one saved Codex account in the Configurations "Codex accounts"
 * list. The Codex twin of {@link AccountRow}.
 *
 * Layout: radio · gradient avatar · name + email (mono) · plan badge · "Active"
 * badge (live one) · sign-out icon button. Selecting the row switches the active
 * Codex account via {@link useSwitchCodexAccount}; sign-out asks a confirm then
 * forgets the saved copy via {@link useRemoveCodexAccount} — the live
 * `~/.codex/auth.json` is untouched. The UI changes only on mutation success.
 */
import { Badge } from "@/ui/Badge";
import { IconButton } from "@/ui/IconButton";
import { Radio } from "@/ui/Radio";
import { LogOut } from "@/ui/icons";
import { useToast } from "@/ui/Toast";
import { AccountAvatar, initialsOf } from "@/app/AccountSwitcher";
import { useRemoveCodexAccount, useSwitchCodexAccount } from "@/lib/queries";
import type { CodexAccountMeta } from "@/lib/types";

export interface CodexAccountRowProps {
  account: CodexAccountMeta;
  /** Whether this is the live active Codex account. */
  active: boolean;
  /** Position in the list, for the avatar gradient + the divider. */
  index: number;
  /** Draw a hairline divider above the row (every row but the first). */
  divider: boolean;
}

export function CodexAccountRow({
  account,
  active,
  index,
  divider,
}: CodexAccountRowProps) {
  const { toast } = useToast();
  const switchAccount = useSwitchCodexAccount();
  const removeAccount = useRemoveCodexAccount();

  const name = account.label;
  const email = account.email;

  function select() {
    if (active || switchAccount.isPending) return;
    switchAccount.mutate(account.id, {
      onSuccess: () =>
        toast({
          title: "Codex account switched",
          description: name,
          variant: "success",
        }),
      onError: (error) =>
        toast({
          title: "Couldn't switch Codex account",
          description: error.message,
          variant: "danger",
        }),
    });
  }

  function signOut() {
    const message = active
      ? `Sign out ${name}? This is the active Codex account. cchive forgets only its saved copy — your live ~/.codex/auth.json is untouched.`
      : `Sign out ${name}? cchive forgets its saved copy — your live ~/.codex/auth.json is untouched.`;
    if (!window.confirm(message)) return;
    removeAccount.mutate(account.id, {
      onSuccess: () =>
        toast({
          title: "Codex account removed",
          description: name,
          variant: "success",
        }),
      onError: (error) =>
        toast({
          title: "Couldn't remove Codex account",
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
          {account.plan && <Badge variant="neutral">{account.plan}</Badge>}
          {active && (
            <Badge variant="accent" dot>
              Active
            </Badge>
          )}
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
