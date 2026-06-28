/**
 * CreateProviderForm — the small dialog that turns a preset (or a typed-in
 * provider) into a saved, switchable configuration.
 *
 * Reuses {@link Modal} (~380px). Fields name / base URL / model are prefilled
 * from the chosen preset; the secret key is a masked {@link Input}. A key and a
 * base URL are required before submit. On submit the values go straight to
 * {@link useSaveProvider} (the upsert path: metadata + payload persisted to the
 * provider index, secret to the Rust vault — so the provider survives a
 * `list_providers` refresh); the secret is then wiped from component state — it
 * never lingers in React.
 */
import { useState } from "react";
import { Button } from "@/ui/Button";
import { Input } from "@/ui/Input";
import { Modal } from "@/ui/Modal";
import { useToast } from "@/ui/Toast";
import { useSaveProvider } from "@/lib/queries";
import type { ProviderConfigInput } from "@/lib/types";

/** A provider preset (or a blank seed) to prefill the form. */
export interface ProviderPreset {
  id: string;
  name: string;
  /** Brand key driving the chip + the persisted provider's `brand`. */
  brand: string;
  baseUrl: string;
  model: string;
}

export interface CreateProviderFormProps {
  /** The preset to prefill; the form is mounted only while one is selected. */
  preset: ProviderPreset;
  /** Close + unmount the form. */
  onClose: () => void;
}

/** One labelled field row. */
function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <label
      htmlFor={htmlFor}
      style={{ display: "flex", flexDirection: "column", gap: "var(--space-1_5)" }}
    >
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "var(--fs-mono-sm)",
          color: "var(--text-2)",
        }}
      >
        {label}
      </span>
      {children}
    </label>
  );
}

export function CreateProviderForm({ preset, onClose }: CreateProviderFormProps) {
  const { toast } = useToast();
  const saveProvider = useSaveProvider();

  const [name, setName] = useState(preset.name);
  const [baseUrl, setBaseUrl] = useState(preset.baseUrl);
  const [model, setModel] = useState(preset.model);
  const [key, setKey] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const keyInvalid = submitted && key.trim() === "";
  const baseUrlInvalid = submitted && baseUrl.trim() === "";

  function submit() {
    setSubmitted(true);
    if (key.trim() === "" || baseUrl.trim() === "") return;
    const input: ProviderConfigInput = {
      id: preset.id,
      title: name.trim() || preset.name,
      brand: preset.brand,
      env: {
        baseUrl: baseUrl.trim(),
        model: model.trim(),
        defaultSonnet: "",
        defaultHaiku: "",
        maxThinkingTokens: null,
        maxOutputTokens: null,
        httpsProxy: null,
        disableTelemetry: null,
      },
      config: {
        cleanupPeriodDays: null,
        includeCoAuthoredBy: null,
        outputStyle: null,
        forceLoginMethod: null,
        forceLoginOrgUuid: null,
        enableAllProjectMcpServers: null,
        enabledMcpServers: null,
      },
    };
    saveProvider.mutate(
      { input, token: key },
      {
        onSuccess: () => {
          // Wipe the secret from state the instant it has been handed off.
          setKey("");
          toast({
            title: "Provider added",
            description: name.trim() || preset.name,
            variant: "success",
          });
          onClose();
        },
        onError: (error) => {
          setKey("");
          toast({
            title: "Couldn't add provider",
            description: error.message,
            variant: "danger",
          });
        },
      },
    );
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Add provider"
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={saveProvider.isPending}>
            Add provider
          </Button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3_5)" }}>
        <Field label="Name" htmlFor="provider-name">
          <Input
            id="provider-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Provider name"
          />
        </Field>
        <Field label="ANTHROPIC_BASE_URL" htmlFor="provider-base-url">
          <Input
            id="provider-base-url"
            mono
            value={baseUrl}
            invalid={baseUrlInvalid}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://api.example.com/anthropic"
          />
        </Field>
        <Field label="ANTHROPIC_MODEL" htmlFor="provider-model">
          <Input
            id="provider-model"
            mono
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="model-id (optional)"
          />
        </Field>
        <Field label="ANTHROPIC_AUTH_TOKEN" htmlFor="provider-key">
          <Input
            id="provider-key"
            variant="secret"
            mono
            value={key}
            invalid={keyInvalid}
            onChange={(e) => setKey(e.target.value)}
          />
        </Field>
        {(keyInvalid || baseUrlInvalid) && (
          <div
            role="alert"
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: "var(--fs-body-sm)",
              color: "var(--danger)",
            }}
          >
            A base URL and an API key are both required.
          </div>
        )}
      </div>
    </Modal>
  );
}
