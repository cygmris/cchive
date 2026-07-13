/**
 * CodexProviderForm — add/edit a Codex gateway (label + base URL + optional model
 * + protocol + API key). Saving upserts via {@link useSaveCodexProvider}: the key
 * goes straight to the keyring (never held in query state), the rest into the
 * provider index. This does NOT apply the gateway — the user selects the row to
 * apply. Mirrors {@link CreateProviderForm} for the Claude side.
 */
import { useState } from "react";
import { Button } from "@/ui/Button";
import { Input } from "@/ui/Input";
import { Select } from "@/ui/Select";
import { useToast } from "@/ui/Toast";
import { useSaveCodexProvider } from "@/lib/queries";
import type { CodexProviderInput } from "@/lib/types";

/** One labelled field row. */
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
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
      {children}
    </label>
  );
}

export function CodexProviderForm({ onClose }: { onClose: () => void }) {
  const { toast } = useToast();
  const save = useSaveCodexProvider();
  const [label, setLabel] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  const [wireApi, setWireApi] = useState("chat");
  const [key, setKey] = useState("");

  const canSave = label.trim() !== "" && baseUrl.trim() !== "";

  function submit() {
    if (!canSave) return;
    const input: CodexProviderInput = {
      label: label.trim(),
      baseUrl: baseUrl.trim(),
      wireApi,
      model: model.trim() ? model.trim() : null,
    };
    save.mutate(
      { input, token: key.trim() ? key.trim() : undefined },
      {
        onSuccess: () => {
          toast({ title: "Gateway saved", description: input.label, variant: "success" });
          onClose();
        },
        onError: (e) =>
          toast({
            title: "Couldn't save gateway",
            description: e.message,
            variant: "danger",
          }),
      },
    );
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-4)",
        padding: "var(--space-4)",
      }}
    >
      <Field label="Label">
        <Input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Pixie Gateway"
        />
      </Field>
      <Field label="Base URL">
        <Input
          mono
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder="https://your-gateway/v1"
        />
      </Field>
      <div style={{ display: "flex", gap: "var(--space-4)" }}>
        <div style={{ flex: 1 }}>
          <Field label="Model (optional)">
            <Input
              mono
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="gpt-5.5"
            />
          </Field>
        </div>
        <div style={{ width: 180 }}>
          <Field label="Protocol">
            <Select
              value={wireApi}
              onChange={(e) => setWireApi(e.target.value)}
              options={[
                { value: "chat", label: "chat · /v1/chat" },
                { value: "responses", label: "responses" },
              ]}
            />
          </Field>
        </div>
      </div>
      <Field label="API key">
        <Input
          variant="secret"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="sk-…"
        />
      </Field>
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          gap: "var(--space-2)",
        }}
      >
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={submit} disabled={!canSave} loading={save.isPending}>
          Save gateway
        </Button>
      </div>
    </div>
  );
}
