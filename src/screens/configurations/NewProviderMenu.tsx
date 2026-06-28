/**
 * NewProviderMenu — the "New provider" split button (design §3).
 *
 * A {@link Popover} anchored to a secondary button offering:
 *  - "Blank provider" → navigate to the Config Editor to author one from scratch.
 *  - three presets (Z.ai, Kimi K2, DeepSeek) → open {@link CreateProviderForm}
 *    prefilled with that provider's base URL + model, ready for a pasted key.
 *
 * The preset definitions are the only place the base URLs / default models live.
 */
import { useState } from "react";
import { Button } from "@/ui/Button";
import { Popover } from "@/ui/Popover";
import { ProviderChip, type ProviderName } from "@/ui/Badge";
import { Plus } from "@/ui/icons";
import { useShellStore } from "@/lib/store";
import { CreateProviderForm, type ProviderPreset } from "./CreateProviderForm";

interface PresetDef extends ProviderPreset {
  brand: ProviderName;
}

const PRESETS: PresetDef[] = [
  {
    id: "zai",
    name: "Z.ai",
    brand: "zai",
    baseUrl: "https://api.z.ai/api/anthropic",
    model: "glm-4.6",
  },
  {
    id: "kimi-k2",
    name: "Kimi K2",
    brand: "kimi",
    baseUrl: "https://api.moonshot.cn/anthropic",
    model: "kimi-k2-turbo",
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    brand: "deepseek",
    baseUrl: "https://api.deepseek.com/anthropic",
    model: "deepseek-v4",
  },
];

const menuItemStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--space-2_5)",
  width: "100%",
  padding: "8px 9px",
  border: "none",
  background: "transparent",
  borderRadius: "var(--radius-md)",
  cursor: "default",
  textAlign: "left",
};

function ItemTitle({ title, sub }: { title: string; sub: string }) {
  return (
    <span style={{ display: "flex", flexDirection: "column", minWidth: 0, flex: 1 }}>
      <span
        style={{
          fontFamily: "var(--font-sans)",
          fontSize: "var(--fs-body)",
          fontWeight: "var(--weight-medium)",
          color: "var(--text)",
        }}
      >
        {title}
      </span>
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "var(--fs-mono-sm)",
          color: "var(--text-3)",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {sub}
      </span>
    </span>
  );
}

export function NewProviderMenu() {
  const go = useShellStore((s) => s.go);
  const [open, setOpen] = useState(false);
  const [preset, setPreset] = useState<ProviderPreset | null>(null);

  return (
    <>
      <Popover
        open={open}
        onOpenChange={setOpen}
        placement="bottom-end"
        style={{ width: 248, padding: 6 }}
        trigger={
          <Button variant="secondary" size="sm" icon={<Plus size={15} />}>
            New provider
          </Button>
        }
      >
        {({ close }) => (
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <button
              type="button"
              className="hover:bg-hover"
              style={menuItemStyle}
              onClick={() => {
                close();
                go("editor");
              }}
            >
              <span
                aria-hidden
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  width: 24,
                  height: 24,
                  borderRadius: "var(--radius-sm)",
                  border: "1px dashed var(--border-strong)",
                  color: "var(--text-3)",
                }}
              >
                <Plus size={14} />
              </span>
              <ItemTitle title="Blank provider" sub="Start from scratch" />
            </button>

            <div
              style={{
                margin: "4px 9px 2px",
                fontFamily: "var(--font-sans)",
                fontSize: "var(--fs-label)",
                fontWeight: "var(--weight-semibold)",
                letterSpacing: "var(--ls-label)",
                textTransform: "uppercase",
                color: "var(--text-3)",
              }}
            >
              From a provider
            </div>

            {PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                className="hover:bg-hover"
                style={menuItemStyle}
                onClick={() => {
                  close();
                  setPreset({
                    id: p.id,
                    name: p.name,
                    baseUrl: p.baseUrl,
                    model: p.model,
                  });
                }}
              >
                <ProviderChip provider={p.brand} size={24} />
                <ItemTitle title={p.name} sub={p.model} />
              </button>
            ))}
          </div>
        )}
      </Popover>

      {preset && (
        <CreateProviderForm preset={preset} onClose={() => setPreset(null)} />
      )}
    </>
  );
}
