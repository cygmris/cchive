/**
 * CodexProviderRow — one saved Codex gateway in the Configurations "Codex
 * providers" list. Selecting it applies the gateway (writes `~/.codex/config.toml`)
 * via {@link useApplyCodexProvider}; the trash button forgets the profile + its
 * vaulted key via {@link useDeleteCodexProvider}. Applying/deleting never touches
 * `~/.codex/auth.json`.
 */
import { Badge } from "@/ui/Badge";
import { IconButton } from "@/ui/IconButton";
import { Radio } from "@/ui/Radio";
import { Trash } from "@/ui/icons";
import { useToast } from "@/ui/Toast";
import { AccountAvatar, initialsOf } from "@/app/AccountSwitcher";
import { useApplyCodexProvider, useDeleteCodexProvider } from "@/lib/queries";
import type { CodexProviderMeta } from "@/lib/types";

export interface CodexProviderRowProps {
  provider: CodexProviderMeta;
  active: boolean;
  index: number;
  divider: boolean;
}

export function CodexProviderRow({
  provider,
  active,
  index,
  divider,
}: CodexProviderRowProps) {
  const { toast } = useToast();
  const apply = useApplyCodexProvider();
  const remove = useDeleteCodexProvider();

  const name = provider.label;

  function select() {
    if (active || apply.isPending) return;
    apply.mutate(provider.id, {
      onSuccess: () =>
        toast({
          title: "Codex gateway applied",
          description: name,
          variant: "success",
        }),
      onError: (error) =>
        toast({
          title: "Couldn't apply gateway",
          description: error.message,
          variant: "danger",
        }),
    });
  }

  function del() {
    if (!window.confirm(`Delete the Codex gateway "${name}"? Its saved key is removed from your keyring.`))
      return;
    remove.mutate(provider.id, {
      onSuccess: () =>
        toast({ title: "Gateway removed", description: name, variant: "success" }),
      onError: (error) =>
        toast({
          title: "Couldn't remove gateway",
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
      <AccountAvatar seed={initialsOf(name)} index={index} size={34} fontSize={13} />
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
          {provider.model && <Badge variant="neutral">{provider.model}</Badge>}
          {active && (
            <Badge variant="accent" dot>
              Active
            </Badge>
          )}
        </div>
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
          {provider.baseUrl}
        </span>
      </div>
      <IconButton
        danger
        aria-label={`Delete ${name}`}
        icon={<Trash size={16} />}
        disabled={remove.isPending}
        onClick={(e) => {
          e.stopPropagation();
          del();
        }}
      />
    </div>
  );
}
