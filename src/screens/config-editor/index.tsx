/**
 * Config Editor — the schema-driven editor for one API-provider config.
 *
 * Reached from Configurations (a provider's edit icon, or "Blank provider"); not
 * a sidebar destination, so Configurations stays highlighted and the header
 * carries a "‹ Configurations" back link. The whole form is driven by
 * {@link ./schema}: a sticky {@link SectionNav} on the left, a search box +
 * {@link FieldRow}s on the right. The form is seeded from
 * {@link useProvider}(editingProviderId) (a blank draft when there is no id);
 * Save validates (URL / number / UUID) then upserts via {@link useSaveProvider};
 * Delete confirms then removes via {@link useDeleteProvider}.
 *
 * SECRET CONTRACT: the auth token is never seeded or displayed. The secret field
 * starts empty, shows only a "set / not set" status (from `hasToken`), and a value
 * is sent to the backend ONLY when freshly typed; an empty field leaves the
 * vaulted key untouched. Save does not switch the active config.
 */
import { useState } from "react";
import { Button } from "@/ui/Button";
import { IconButton } from "@/ui/IconButton";
import { Input } from "@/ui/Input";
import { Popover } from "@/ui/Popover";
import { ChevronLeft, Trash } from "@/ui/icons";
import { useToast } from "@/ui/Toast";
import {
  useDeleteProvider,
  useProvider,
  useSaveProvider,
} from "@/lib/queries";
import { useShellStore } from "@/lib/store";
import type {
  ProviderConfigInput,
  ProviderConfigView,
  ProviderEnv,
  ProviderSettings,
} from "@/lib/types";
import { FieldRow } from "./FieldRow";
import { SectionNav, type SectionKey } from "./SectionNav";
import { ALL_FIELDS, SECTIONS, type FieldDef } from "./schema";

/** A blank, unsaved draft used when there is no provider id to load. */
const BLANK_VIEW: ProviderConfigView = {
  id: "",
  title: "New provider",
  brand: "anthropic",
  env: {
    baseUrl: "",
    model: "",
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
  hasToken: false,
};

/** Form keys (= schema field keys) for the env block, by ProviderEnv slot. */
const ENV_KEYS = {
  baseUrl: "ANTHROPIC_BASE_URL",
  model: "ANTHROPIC_MODEL",
  defaultSonnet: "ANTHROPIC_DEFAULT_SONNET_MODEL",
  defaultHaiku: "ANTHROPIC_DEFAULT_HAIKU_MODEL",
  maxThinkingTokens: "MAX_THINKING_TOKENS",
  maxOutputTokens: "CLAUDE_CODE_MAX_OUTPUT_TOKENS",
  httpsProxy: "HTTPS_PROXY",
  disableTelemetry: "DISABLE_TELEMETRY",
} as const;

/** The auth-token form key (the only secret; carried apart from any DTO). */
const TOKEN_KEY = "ANTHROPIC_AUTH_TOKEN";

/** URL-shaped fields (validated as http(s) URLs when non-empty). */
const URL_KEYS = new Set<string>([ENV_KEYS.baseUrl, ENV_KEYS.httpsProxy]);

const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/** Validate one field's raw string; `null` = valid. Empty = unset = valid. */
function validateField(field: FieldDef, raw: string): string | null {
  const v = raw.trim();
  if (v === "") return null;
  if (URL_KEYS.has(field.key) && !isHttpUrl(v)) {
    return "Enter a valid http(s) URL.";
  }
  if (field.control === "number" && !/^\d+$/.test(v)) {
    return "Enter a whole number.";
  }
  if (field.key === "forceLoginOrgUuid" && !UUID_RE.test(v)) {
    return "Enter a valid UUID (8-4-4-4-12).";
  }
  return null;
}

/** Seed every field's string value from the view (schema defaults for a draft). */
function seedValues(
  view: ProviderConfigView,
  isNew: boolean,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of ALL_FIELDS) {
    if (f.target.group === "token") {
      out[f.key] = "";
      continue;
    }
    if (isNew) {
      out[f.key] = f.default != null ? String(f.default) : "";
      continue;
    }
    const src =
      f.target.group === "env"
        ? view.env[f.target.key]
        : view.config[f.target.key];
    out[f.key] = src == null ? "" : String(src);
  }
  return out;
}

/** Compose the upsert input from the string form values + the loaded view. */
function buildInput(
  view: ProviderConfigView,
  isNew: boolean,
  values: Record<string, string>,
): ProviderConfigInput {
  const num = (k: string): number | null => {
    const v = (values[k] ?? "").trim();
    return v === "" ? null : Number(v);
  };
  const optText = (k: string): string | null => {
    const v = (values[k] ?? "").trim();
    return v === "" ? null : v;
  };
  const reqText = (k: string): string => (values[k] ?? "").trim();
  const bool = (k: string): boolean | null => {
    const v = values[k] ?? "";
    return v === "" ? null : v === "true";
  };

  const env: ProviderEnv = {
    baseUrl: reqText(ENV_KEYS.baseUrl),
    model: reqText(ENV_KEYS.model),
    defaultSonnet: reqText(ENV_KEYS.defaultSonnet),
    defaultHaiku: reqText(ENV_KEYS.defaultHaiku),
    maxThinkingTokens: num(ENV_KEYS.maxThinkingTokens),
    maxOutputTokens: num(ENV_KEYS.maxOutputTokens),
    httpsProxy: optText(ENV_KEYS.httpsProxy),
    disableTelemetry: bool(ENV_KEYS.disableTelemetry),
  };
  const config: ProviderSettings = {
    cleanupPeriodDays: num("cleanupPeriodDays"),
    includeCoAuthoredBy: bool("includeCoAuthoredBy"),
    outputStyle: optText("outputStyle"),
    forceLoginMethod: optText("forceLoginMethod"),
    forceLoginOrgUuid: optText("forceLoginOrgUuid"),
    enableAllProjectMcpServers: bool("enableAllProjectMcpServers"),
    enabledMcpServers: optText("enabledMcpServers"),
  };

  return {
    ...(isNew ? {} : { id: view.id }),
    title: view.title,
    brand: view.brand,
    env,
    config,
  };
}

/** Shared full-height column wrapper for the editor + its loading/empty states. */
function EditorShell({
  onBack,
  children,
}: {
  onBack: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <BackLink onBack={onBack} />
      {children}
    </div>
  );
}

/** The "‹ Configurations" back link (matches ScreenHeader's affordance). */
function BackLink({ onBack }: { onBack: () => void }) {
  return (
    <button
      type="button"
      onClick={onBack}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "var(--space-1)",
        height: 22,
        margin: "var(--space-6) var(--gutter) 0",
        padding: 0,
        border: "none",
        background: "transparent",
        color: "var(--text-2)",
        fontFamily: "var(--font-sans)",
        fontSize: "var(--fs-body-sm)",
        fontWeight: "var(--weight-medium)",
        cursor: "pointer",
        width: "max-content",
      }}
    >
      <ChevronLeft size={14} />
      Configurations
    </button>
  );
}

/** Centered muted note (loading / not-found bodies). */
function CenteredNote({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        flex: 1,
        display: "grid",
        placeItems: "center",
        color: "var(--text-3)",
        fontFamily: "var(--font-sans)",
        fontSize: "var(--fs-body)",
      }}
    >
      {children}
    </div>
  );
}

/** The editor form body — mounted only once the view (or a draft) is ready. */
function EditorBody({
  view,
  isNew,
  onBack,
}: {
  view: ProviderConfigView;
  isNew: boolean;
  onBack: () => void;
}) {
  const { toast } = useToast();
  const setEditingProvider = useShellStore((s) => s.setEditingProvider);
  const saveProvider = useSaveProvider();
  const deleteProvider = useDeleteProvider();

  const [values, setValues] = useState<Record<string, string>>(() =>
    seedValues(view, isNew),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [section, setSection] = useState<SectionKey>("all");
  const [search, setSearch] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  function setValue(key: string, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  function handleSave() {
    const nextErrors: Record<string, string> = {};
    for (const f of ALL_FIELDS) {
      if (f.target.group === "token") continue;
      const err = validateField(f, values[f.key] ?? "");
      if (err) nextErrors[f.key] = err;
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      // Surface every errored field regardless of the current filter.
      setSection("all");
      setSearch("");
      toast({
        title: "Check the highlighted fields",
        description: "Some values aren't valid yet.",
        variant: "danger",
      });
      return;
    }

    const input = buildInput(view, isNew, values);
    const tokenRaw = values[TOKEN_KEY] ?? "";
    const token = tokenRaw.trim() !== "" ? tokenRaw : undefined;

    saveProvider.mutate(
      { input, token },
      {
        onSuccess: (saved) => {
          setValues((prev) => ({ ...prev, [TOKEN_KEY]: "" }));
          toast({
            title: "Configuration saved",
            description: saved.title,
            variant: "success",
          });
          if (isNew) setEditingProvider(saved.id);
        },
        onError: (error) =>
          toast({
            title: "Couldn't save configuration",
            description: error.message,
            variant: "danger",
          }),
      },
    );
  }

  function handleDelete() {
    setConfirmDelete(false);
    if (isNew) {
      // An unsaved draft: nothing to remove — just discard and go back.
      onBack();
      return;
    }
    deleteProvider.mutate(view.id, {
      onSuccess: () => {
        toast({
          title: "Configuration deleted",
          description: view.title,
          variant: "success",
        });
        onBack();
      },
      onError: (error) =>
        toast({
          title: "Couldn't delete configuration",
          description: error.message,
          variant: "danger",
        }),
    });
  }

  const q = search.trim().toLowerCase();
  const visibleSections = SECTIONS.map((s) => ({
    id: s.id,
    label: s.label,
    fields: s.fields.filter(
      (f) =>
        (section === "all" || section === s.id) &&
        (q === "" ||
          f.label.toLowerCase().includes(q) ||
          f.description.toLowerCase().includes(q)),
    ),
  })).filter((s) => s.fields.length > 0);

  return (
    <>
      {/* Header: title + Delete / Save actions ------------------------------ */}
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "var(--space-3)",
          padding: "var(--space-1) var(--gutter) var(--space-3_5)",
        }}
      >
        <div
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: "var(--fs-title)",
            fontWeight: "var(--weight-semibold)",
            letterSpacing: "var(--ls-title)",
            color: "var(--text)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {view.title}
        </div>
        <div
          style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}
        >
          <Popover
            open={confirmDelete}
            onOpenChange={setConfirmDelete}
            placement="bottom-end"
            style={{ width: 248, padding: "var(--space-3)" }}
            trigger={
              <IconButton
                danger
                aria-label="Delete configuration"
                icon={<Trash size={16} />}
              />
            }
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "var(--space-3)",
              }}
            >
              <p
                style={{
                  margin: 0,
                  fontFamily: "var(--font-sans)",
                  fontSize: "var(--fs-body-sm)",
                  lineHeight: "var(--lh-body-sm)",
                  color: "var(--text-2)",
                }}
              >
                {isNew
                  ? "Discard this new provider? Nothing has been saved yet."
                  : "Delete this provider and remove its key from the vault? Live settings.json is left unchanged."}
              </p>
              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: "var(--space-2)",
                }}
              >
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmDelete(false)}
                >
                  Cancel
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  loading={deleteProvider.isPending}
                  onClick={handleDelete}
                >
                  {isNew ? "Discard" : "Delete"}
                </Button>
              </div>
            </div>
          </Popover>
          <Button
            size="sm"
            loading={saveProvider.isPending}
            onClick={handleSave}
          >
            Save
          </Button>
        </div>
      </header>

      {/* Two-column body: section nav | field area -------------------------- */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          gap: "var(--space-6)",
          padding: "0 var(--gutter)",
          overflow: "hidden",
        }}
      >
        <SectionNav active={section} onSelect={setSection} />

        <div
          style={{
            flex: 1,
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            overflow: "auto",
            paddingBottom: "var(--space-8)",
          }}
        >
          <div style={{ paddingBottom: "var(--space-2)" }}>
            <Input
              variant="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search settings…"
              aria-label="Search settings"
              style={{ maxWidth: 340 }}
            />
          </div>

          {isNew && (
            <div
              style={{
                margin: "var(--space-2) 0",
                padding: "var(--space-3) var(--space-3_5)",
                borderRadius: "var(--radius-lg)",
                background: "var(--accent-tint)",
                fontFamily: "var(--font-sans)",
                fontSize: "var(--fs-body-sm)",
                lineHeight: "var(--lh-body-sm)",
                color: "var(--text-2)",
              }}
            >
              This provider isn't configured yet — fill in its settings and Save.
            </div>
          )}

          {visibleSections.length === 0 ? (
            <CenteredNote>No settings match "{search}".</CenteredNote>
          ) : (
            visibleSections.map((s) => (
              <section key={s.id} style={{ marginTop: "var(--space-4)" }}>
                <h2
                  style={{
                    margin: "0 0 var(--space-1)",
                    fontFamily: "var(--font-sans)",
                    fontSize: "var(--fs-label)",
                    fontWeight: "var(--weight-semibold)",
                    letterSpacing: "var(--ls-label)",
                    textTransform: "uppercase",
                    color: "var(--text-3)",
                  }}
                >
                  {s.label}
                </h2>
                {s.fields.map((f, i) => (
                  <FieldRow
                    key={f.key}
                    field={f}
                    value={values[f.key] ?? ""}
                    onChange={(v) => setValue(f.key, v)}
                    error={errors[f.key]}
                    hasToken={view.hasToken}
                    divider={i > 0}
                  />
                ))}
              </section>
            ))
          )}
        </div>
      </div>
    </>
  );
}

/**
 * Config Editor screen. Resolves the provider to edit from the shell store's
 * `editingProviderId` (a blank draft when null), handling the loading / not-found
 * states before mounting the form. The form is keyed by the id so it re-seeds
 * cleanly when the edited provider changes.
 */
export function ConfigEditorScreen() {
  const go = useShellStore((s) => s.go);
  const editingId = useShellStore((s) => s.editingProviderId);
  const isNew = editingId == null;
  const provider = useProvider(editingId);
  const onBack = () => go("configs");

  if (!isNew) {
    if (provider.isError) {
      return (
        <EditorShell onBack={onBack}>
          <CenteredNote>
            This configuration could not be found.
          </CenteredNote>
        </EditorShell>
      );
    }
    if (!provider.data) {
      return (
        <EditorShell onBack={onBack}>
          <CenteredNote>Loading configuration…</CenteredNote>
        </EditorShell>
      );
    }
  }

  const view = isNew ? BLANK_VIEW : (provider.data as ProviderConfigView);

  return (
    <EditorShell onBack={onBack}>
      <EditorBody
        key={editingId ?? "new"}
        view={view}
        isNew={isNew}
        onBack={onBack}
      />
    </EditorShell>
  );
}
