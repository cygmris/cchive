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
import type { AccountMeta } from "@/lib/types";

export interface AccountRowProps {
  account: AccountMeta;
  /** Whether this is the live active account. */
  active: boolean;
  /** Position in the list, for the avatar gradient + the divider. */
  index: number;
  /** Draw a hairline divider above the row (every row but the first). */
  divider: boolean;
}

export function AccountRow({ account, active, index, divider }: AccountRowProps) {
  const { toast } = useToast();
  const switchAccount = useSwitchAccount();
  const removeAccount = useRemoveAccount();

  const name = account.label;
  const email = account.email;

  function select() {
    if (active || switchAccount.isPending) return;
    switchAccount.mutate(account.id, {
      onSuccess: () =>
        toast({
          title: "Account switched",
          description: name,
          variant: "success",
        }),
      onError: (error) =>
        toast({
          title: "Couldn't switch account",
          description: error.message,
          variant: "danger",
        }),
    });
  }

  function signOut() {
    const message = active
      ? `Sign out ${name}? This is the active account. Clavis forgets only its saved copy — your live Claude Code credential is untouched.`
      : `Sign out ${name}? Clavis forgets its saved copy — your live Claude Code credential is untouched.`;
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
          {account.tier && <Badge variant="neutral">{account.tier}</Badge>}
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
