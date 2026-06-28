/**
 * ProviderRow — one API-provider preset in the Configurations "API providers"
 * list.
 *
 * Layout (design §3): radio · brand chip · title + base URL (mono) · model meta
 * (mono) · "Active" badge · edit icon button. Selecting the row applies the
 * preset via {@link useApplyProvider} — only the non-secret `env` (base URL +
 * model) leaves React; the stored key stays in the Rust vault. Edit jumps to the
 * Config Editor. UI changes only on mutation success; failures toast.
 */
import { Badge, ProviderChip, type ProviderName } from "@/ui/Badge";
import { IconButton } from "@/ui/IconButton";
import { Radio } from "@/ui/Radio";
import { Pencil } from "@/ui/icons";
import { useToast } from "@/ui/Toast";
import { useApplyProvider } from "@/lib/queries";
import { useShellStore } from "@/lib/store";
import type { ProviderMeta } from "@/lib/types";

/** Best-effort brand for the chip, from the preset's id / label / base URL. */
export function brandForProvider(provider: ProviderMeta): ProviderName {
  const hay = `${provider.id} ${provider.label} ${provider.baseUrl ?? ""}`.toLowerCase();
  if (hay.includes("z.ai") || hay.includes("zai")) return "zai";
  if (hay.includes("moonshot") || hay.includes("kimi")) return "kimi";
  if (hay.includes("deepseek")) return "deepseek";
  if (hay.includes("bedrock") || hay.includes("amazonaws") || hay.includes("aws")) {
    return "aws";
  }
  return "anthropic";
}

export interface ProviderRowProps {
  provider: ProviderMeta;
  /** Whether this preset is the live active configuration. */
  active: boolean;
  /** Draw a hairline divider above the row (every row but the first). */
  divider: boolean;
}

export function ProviderRow({ provider, active, divider }: ProviderRowProps) {
  const { toast } = useToast();
  const applyProvider = useApplyProvider();
  const go = useShellStore((s) => s.go);

  function select() {
    if (active || applyProvider.isPending) return;
    const env: Record<string, string> = {};
    if (provider.baseUrl) env.ANTHROPIC_BASE_URL = provider.baseUrl;
    if (provider.model) env.ANTHROPIC_MODEL = provider.model;
    applyProvider.mutate(
      { meta: provider, env },
      {
        onSuccess: () =>
          toast({
            title: "Provider applied",
            description: provider.label,
            variant: "success",
          }),
        onError: (error) =>
          toast({
            title: "Couldn't apply provider",
            description: error.message,
            variant: "danger",
          }),
      },
    );
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
        aria-label={`Use ${provider.label}`}
        onClick={(e) => {
          e.stopPropagation();
          select();
        }}
      />
      <ProviderChip provider={brandForProvider(provider)} size={34} />
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
            {provider.label}
          </span>
          {active && <Badge variant="accent" dot>Active</Badge>}
        </div>
        {provider.baseUrl && (
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
        )}
      </div>
      {provider.model && (
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "var(--fs-mono-sm)",
            color: "var(--text-2)",
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}
        >
          {provider.model}
        </span>
      )}
      <IconButton
        aria-label={`Edit ${provider.label}`}
        icon={<Pencil size={15} />}
        onClick={(e) => {
          e.stopPropagation();
          go("editor");
        }}
      />
    </div>
  );
}
