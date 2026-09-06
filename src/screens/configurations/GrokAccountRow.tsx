/**
 * GrokAccountRow — one saved Grok account in the Configurations "Grok accounts"
 * list. The Grok twin of {@link CodexAccountRow}.
 *
 * Selecting the row switches via {@link useSwitchGrokAccount}; sign-out forgets
 * the saved copy via {@link useRemoveGrokAccount} — the live `~/.grok/auth.json`
 * is untouched.
 */
import { Badge } from "@/ui/Badge";
import { IconButton } from "@/ui/IconButton";
import { Radio } from "@/ui/Radio";
import { LogOut } from "@/ui/icons";
import { useToast } from "@/ui/Toast";
import { AccountAvatar, initialsOf } from "@/app/AccountSwitcher";
import { useRemoveGrokAccount, useSwitchGrokAccount } from "@/lib/queries";
import type { GrokAccountMeta } from "@/lib/types";

export interface GrokAccountRowProps {
  account: GrokAccountMeta;
  active: boolean;
  index: number;
  divider: boolean;
}

export function GrokAccountRow({
  account,
  active,
  index,
  divider,
}: GrokAccountRowProps) {
  const { toast } = useToast();
  const switchAccount = useSwitchGrokAccount();
  const removeAccount = useRemoveGrokAccount();

  const name = account.label;
  const email = account.email;

  function select() {
    if (active || switchAccount.isPending) return;
    switchAccount.mutate(account.id, {
      onSuccess: () =>
        toast({
          title: "Grok account switched",
          description: name,
          variant: "success",
        }),
      onError: (error) =>
        toast({
          title: "Couldn't switch Grok account",
          description: error.message,
          variant: "danger",
        }),
    });
  }

  function signOut() {
    const message = active
      ? `Sign out ${name}? This is the active Grok account. cchive forgets only its saved copy — your live ~/.grok/auth.json is untouched.`
      : `Sign out ${name}? cchive forgets its saved copy — your live ~/.grok/auth.json is untouched.`;
    if (!window.confirm(message)) return;
    removeAccount.mutate(account.id, {
      onSuccess: () =>
        toast({
          title: "Grok account removed",
          description: name,
          variant: "success",
        }),
      onError: (error) =>
        toast({
          title: "Couldn't remove Grok account",
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
