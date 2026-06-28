/**
 * McpServerForm — the add/edit dialog for a global MCP server (design §6).
 *
 * A small {@link Modal} (~380px) with a name, a transport {@link Select}
 * (stdio / http / sse) and the fields that transport needs: a stdio server takes
 * a command + args (one per line) + env (`KEY=value`, one per line); an http/sse
 * server takes a single URL. Submit hands the assembled {@link McpServerInput}
 * to {@link useSaveMcpServer} (the upsert path — always writes an *enabled*
 * server, preserving every other `~/.claude.json` key). When editing, the fields
 * prefill and the name is locked (the name is the server's key, so a rename would
 * orphan the old entry); a freshly-typed name must be unique. Command/url/args/env
 * render in `--font-mono`; the env a user types lives only in this form.
 */
import { useState } from "react";
import type * as React from "react";
import { Button } from "@/ui/Button";
import { Input } from "@/ui/Input";
import { Modal } from "@/ui/Modal";
import { Select } from "@/ui/Select";
import { useToast } from "@/ui/Toast";
import { useSaveMcpServer } from "@/lib/queries";
import type { McpServer, McpServerInput } from "@/lib/types";

const TRANSPORT_OPTIONS = [
  { label: "stdio — local command", value: "stdio" },
  { label: "http — remote URL", value: "http" },
  { label: "sse — server-sent events", value: "sse" },
];

const textareaStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-md)",
  color: "var(--text)",
  fontFamily: "var(--font-mono)",
  fontSize: "var(--fs-mono)",
  lineHeight: 1.5,
  resize: "vertical",
  outline: "none",
};

/** One labelled field row (mirrors the provider form), with an optional hint. */
function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label
      htmlFor={htmlFor}
      style={{ display: "flex", flexDirection: "column", gap: "var(--space-1_5)" }}
    >
      <span style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "var(--fs-mono-sm)",
            color: "var(--text-2)",
          }}
        >
          {label}
        </span>
        {hint != null && (
          <span
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: "var(--fs-body-sm)",
              color: "var(--text-3)",
            }}
          >
            {hint}
          </span>
        )}
      </span>
      {children}
    </label>
  );
}

/** Parse a newline-separated args block into a trimmed string list (null if empty). */
function parseArgs(text: string): string[] | null {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  return lines.length > 0 ? lines : null;
}

/** Parse `KEY=value` lines into an env map (null if empty); the first `=` splits. */
function parseEnv(text: string): Record<string, string> | null {
  const env: Record<string, string> = {};
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (line.length === 0) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    if (key.length === 0) continue;
    env[key] = line.slice(eq + 1).trim();
  }
  return Object.keys(env).length > 0 ? env : null;
}

export interface McpServerFormProps {
  /** The server to edit (fields prefill, name locked), or `null` to add a new one. */
  server: McpServer | null;
  /** Existing servers, for the add-mode unique-name check. */
  servers: McpServer[];
  /** Close + unmount the form. */
  onClose: () => void;
}

export function McpServerForm({ server, servers, onClose }: McpServerFormProps) {
  const { toast } = useToast();
  const save = useSaveMcpServer();
  const editing = server != null;

  const [name, setName] = useState(server?.name ?? "");
  const [transport, setTransport] = useState(server?.transport ?? "stdio");
  const [command, setCommand] = useState(server?.command ?? "");
  const [argsText, setArgsText] = useState((server?.args ?? []).join("\n"));
  const [envText, setEnvText] = useState(
    server?.env != null
      ? Object.entries(server.env)
          .map(([key, value]) => `${key}=${value}`)
          .join("\n")
      : "",
  );
  const [url, setUrl] = useState(server?.url ?? "");
  const [submitted, setSubmitted] = useState(false);

  const isStdio = transport === "stdio";
  const trimmedName = name.trim();
  const nameTaken = !editing && servers.some((s) => s.name === trimmedName);
  const nameInvalid = submitted && (trimmedName.length === 0 || nameTaken);
  const commandInvalid = submitted && isStdio && command.trim().length === 0;
  const urlInvalid = submitted && !isStdio && url.trim().length === 0;

  function submit() {
    setSubmitted(true);
    if (trimmedName.length === 0 || nameTaken) return;
    if (isStdio ? command.trim().length === 0 : url.trim().length === 0) return;

    const input: McpServerInput = isStdio
      ? {
          name: trimmedName,
          transport: "stdio",
          command: command.trim(),
          args: parseArgs(argsText),
          env: parseEnv(envText),
          url: null,
          scope: "user",
        }
      : {
          name: trimmedName,
          transport,
          command: null,
          args: null,
          env: null,
          url: url.trim(),
          scope: "user",
        };

    save.mutate(input, {
      onSuccess: () => {
        toast({
          title: editing ? "Server updated" : "Server added",
          description: trimmedName,
          variant: "success",
        });
        onClose();
      },
      onError: (error) =>
        toast({
          title: editing ? "Couldn't update server" : "Couldn't add server",
          description: error.message,
          variant: "danger",
        }),
    });
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={editing ? "Edit server" : "Add server"}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={save.isPending}>
            {editing ? "Save changes" : "Add server"}
          </Button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3_5)" }}>
        <Field label="Name" htmlFor="mcp-name">
          <Input
            id="mcp-name"
            mono
            value={name}
            disabled={editing}
            invalid={nameInvalid}
            onChange={(e) => setName(e.target.value)}
            placeholder="server-name"
          />
        </Field>
        <Field label="Transport" htmlFor="mcp-transport">
          <Select
            id="mcp-transport"
            options={TRANSPORT_OPTIONS}
            value={transport}
            onChange={(e) => setTransport(e.target.value)}
          />
        </Field>

        {isStdio ? (
          <>
            <Field label="Command" htmlFor="mcp-command">
              <Input
                id="mcp-command"
                mono
                value={command}
                invalid={commandInvalid}
                onChange={(e) => setCommand(e.target.value)}
                placeholder="npx"
              />
            </Field>
            <Field label="Args" htmlFor="mcp-args" hint="one per line">
              <textarea
                id="mcp-args"
                rows={3}
                value={argsText}
                onChange={(e) => setArgsText(e.target.value)}
                placeholder={"-y\n@scope/package"}
                style={textareaStyle}
              />
            </Field>
            <Field label="Env" htmlFor="mcp-env" hint="KEY=value, one per line">
              <textarea
                id="mcp-env"
                rows={2}
                value={envText}
                onChange={(e) => setEnvText(e.target.value)}
                placeholder={"API_KEY=…"}
                style={textareaStyle}
              />
            </Field>
          </>
        ) : (
          <Field label="URL" htmlFor="mcp-url">
            <Input
              id="mcp-url"
              mono
              value={url}
              invalid={urlInvalid}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://mcp.example.com/sse"
            />
          </Field>
        )}

        {(nameInvalid || commandInvalid || urlInvalid) && (
          <div
            role="alert"
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: "var(--fs-body-sm)",
              color: "var(--danger)",
            }}
          >
            {nameTaken
              ? "A server with that name already exists."
              : isStdio
                ? "A name and a command are required."
                : "A name and a URL are required."}
          </div>
        )}
      </div>
    </Modal>
  );
}
