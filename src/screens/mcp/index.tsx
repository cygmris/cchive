/**
 * McpScreen — the MCP manager (design §6). Renders this machine's global Model
 * Context Protocol servers (read from `~/.claude.json` `mcpServers`, plus any
 * toggled-off ones parked in the Clavis stash) through the generic, domain-
 * agnostic {@link Collection}: this screen only supplies a {@link CollectionConfig}
 * — the icon (by transport), a transport Badge, the tools hint, an enable/disable
 * Switch, the detail properties (Type / Tools / Scope / Status) and a read-only
 * `.mcp.json` preview of the definition. "Add server" and the per-row / per-detail
 * Edit / Remove actions drive {@link McpServerForm} + the MCP mutations; the
 * status-bar count re-derives from {@link useMcpServers} on every change.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/ui/Badge";
import { IconButton } from "@/ui/IconButton";
import { useToast } from "@/ui/Toast";
import { Activity, Globe, Pencil, Terminal, Trash } from "@/ui/icons";
import {
  useDeleteMcpServer,
  useMcpServers,
  useToggleMcpServer,
} from "@/lib/queries";
import type { McpServer } from "@/lib/types";
import { Collection } from "@/screens/_collection/Collection";
import type {
  CollectionConfig,
  CollectionView,
} from "@/screens/_collection/types";
import { McpServerForm } from "./McpServerForm";

/** Leading glyph for a server, chosen by its transport. */
function transportIcon(transport: string) {
  if (transport === "http") return <Globe size={16} />;
  if (transport === "sse") return <Activity size={16} />;
  return <Terminal size={16} />;
}

/** A one-line description: the stdio command line, or the http/sse endpoint. */
function describe(server: McpServer): string {
  if (server.transport === "stdio") {
    const line = [server.command, ...(server.args ?? [])]
      .filter((part): part is string => part != null && part.length > 0)
      .join(" ");
    return line.length > 0 ? line : "local stdio server";
  }
  return server.url ?? "remote endpoint";
}

/**
 * A `.mcp.json`-shaped, read-only preview of the definition. Env values are
 * **masked** (`•••`) — they are never displayed back outside the edit form.
 */
function definitionJson(server: McpServer): string {
  let def: Record<string, unknown>;
  if (server.transport === "stdio") {
    def = { type: "stdio" };
    if (server.command) def.command = server.command;
    if (server.args && server.args.length > 0) def.args = server.args;
    if (server.env && Object.keys(server.env).length > 0) {
      def.env = Object.fromEntries(
        Object.keys(server.env).map((key) => [key, "•••"]),
      );
    }
  } else {
    def = { type: server.transport, url: server.url ?? "" };
  }
  return JSON.stringify({ mcpServers: { [server.name]: def } }, null, 2);
}

export function McpScreen() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const servers = useMcpServers();
  const toggle = useToggleMcpServer();
  const remove = useDeleteMcpServer();

  const [view, setView] = useState<CollectionView>("card");
  const [query, setQuery] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<McpServer | null>(null);

  const items = servers.data ?? [];

  function openAdd() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(server: McpServer) {
    setEditing(server);
    setFormOpen(true);
  }

  function confirmRemove(server: McpServer) {
    if (
      !window.confirm(
        `Remove “${server.name}”? Its definition is deleted from ~/.claude.json.`,
      )
    )
      return;
    remove.mutate(server.name, {
      onSuccess: () =>
        toast({
          title: "Server removed",
          description: server.name,
          variant: "success",
        }),
      onError: (error) =>
        toast({
          title: "Couldn't remove server",
          description: error.message,
          variant: "danger",
        }),
    });
  }

  function setEnabled(server: McpServer, on: boolean) {
    toggle.mutate(
      { name: server.name, on },
      {
        onError: (error) =>
          toast({
            title: "Couldn't update server",
            description: error.message,
            variant: "danger",
          }),
      },
    );
  }

  /** Edit + Remove affordances, shared by the table row and the detail pane. */
  function actions(server: McpServer) {
    return (
      <div style={{ display: "flex", gap: 2, justifyContent: "flex-end" }}>
        <IconButton
          size="sm"
          icon={<Pencil size={15} />}
          aria-label={`Edit ${server.name}`}
          onClick={() => openEdit(server)}
        />
        <IconButton
          size="sm"
          danger
          icon={<Trash size={15} />}
          aria-label={`Remove ${server.name}`}
          disabled={remove.isPending}
          onClick={() => confirmRemove(server)}
        />
      </div>
    );
  }

  const config: CollectionConfig<McpServer> = {
    icon: (server) => transportIcon(server.transport),
    name: (server) => server.name,
    description: describe,
    tag: (server) => <Badge variant="info">{server.transport}</Badge>,
    meta: (server) => server.toolsHint ?? "",
    toggle: (server) => ({
      on: server.enabled,
      onChange: (next) => setEnabled(server, next),
    }),
    columns: [
      {
        label: "Name",
        render: (server) => (
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 13,
              fontWeight: "var(--weight-semibold)",
              color: "var(--text)",
            }}
          >
            {server.name}
          </span>
        ),
      },
      {
        label: "Description",
        render: (server) => (
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 12,
              color: "var(--text-2)",
            }}
          >
            {describe(server)}
          </span>
        ),
      },
      {
        label: "Type",
        render: (server) => <Badge variant="info">{server.transport}</Badge>,
      },
      {
        label: "Tools",
        render: (server) => (
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 12,
              color: "var(--text-3)",
            }}
          >
            {server.toolsHint ?? "—"}
          </span>
        ),
      },
      { label: "", render: (server) => actions(server) },
    ],
    detail: (server) => ({
      props: [
        { label: "Type", value: server.transport },
        { label: "Tools", value: server.toolsHint ?? "—" },
        { label: "Scope", value: server.scope },
        { label: "Status", value: server.enabled ? "Enabled" : "Disabled" },
        { label: "Manage", value: actions(server) },
      ],
      preview: { name: ".mcp.json", body: definitionJson(server) },
    }),
    addLabel: "Add server",
  };

  return (
    <>
      <Collection
        title={t("header.mcp.title")}
        description={t("header.mcp.description")}
        items={items}
        config={config}
        view={view}
        onViewChange={setView}
        query={query}
        onQueryChange={setQuery}
        onAdd={openAdd}
      />
      {formOpen && (
        <McpServerForm
          key={editing?.name ?? "__add__"}
          server={editing}
          servers={items}
          onClose={() => setFormOpen(false)}
        />
      )}
    </>
  );
}
