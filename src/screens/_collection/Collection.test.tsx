/**
 * Collection tests — the generic, domain-agnostic library surface. Driven by a
 * plain test `config` over a throwaway `Thing` type (NO MCP/agent knowledge), it
 * must render all three bodies (Card / Table / Master-detail), switch between
 * them from the header toggle, filter by the search field, fire a toggle's
 * callback, and render cleanly when the config omits a toggle.
 */
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { Collection } from "./Collection";
import type { CollectionConfig, CollectionView } from "./types";

interface Thing {
  id: string;
  title: string;
  blurb: string;
  kind: string;
  on: boolean;
}

const THINGS: Thing[] = [
  { id: "1", title: "alpha", blurb: "first thing", kind: "stdio", on: true },
  { id: "2", title: "bravo", blurb: "second thing", kind: "http", on: false },
];

/** A generic render contract; `over` lets a test add a toggle / swap a field. */
function makeConfig(
  over: Partial<CollectionConfig<Thing>> = {},
): CollectionConfig<Thing> {
  return {
    icon: () => <span aria-hidden>·</span>,
    name: (t) => t.title,
    description: (t) => t.blurb,
    tag: (t) => <span>{t.kind} tag</span>,
    meta: (t) => `${t.kind} meta`,
    columns: [
      { label: "Name", render: (t) => <span>{t.title}</span> },
      { label: "Kind", render: (t) => <span>{t.kind}</span> },
    ],
    detail: (t) => ({
      props: [
        { label: "Kind", value: t.kind },
        { label: "Status", value: t.on ? "Enabled" : "Disabled" },
      ],
      preview: { name: `${t.title}.json`, body: `name=${t.title}` },
    }),
    addLabel: "Add thing",
    ...over,
  };
}

/** Wraps Collection in the controlled view/query state a real screen owns. */
function Harness({
  config,
  items = THINGS,
  initialView = "card",
}: {
  config: CollectionConfig<Thing>;
  items?: Thing[];
  initialView?: CollectionView;
}) {
  const [view, setView] = useState<CollectionView>(initialView);
  const [query, setQuery] = useState("");
  return (
    <Collection
      title="Things"
      description="A generic library."
      items={items}
      config={config}
      view={view}
      onViewChange={setView}
      query={query}
      onQueryChange={setQuery}
    />
  );
}

describe("Collection", () => {
  it("renders the Card view from a generic config", () => {
    render(<Harness config={makeConfig()} initialView="card" />);

    expect(screen.getByText("alpha")).toBeInTheDocument();
    expect(screen.getByText("bravo")).toBeInTheDocument();
    expect(screen.getByText("first thing")).toBeInTheDocument();
    expect(screen.getByText("second thing")).toBeInTheDocument();
  });

  it("renders the Table view from a generic config", () => {
    render(<Harness config={makeConfig()} initialView="table" />);

    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: "Name" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: "Kind" }),
    ).toBeInTheDocument();
    // Cell renderers from `config.columns` ran for each row.
    expect(screen.getByText("stdio")).toBeInTheDocument();
    expect(screen.getByText("http")).toBeInTheDocument();
  });

  it("renders the Master-detail view from a generic config", () => {
    render(<Harness config={makeConfig()} initialView="detail" />);

    // Selectable left list + a right pane describing the first item.
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    expect(screen.getAllByRole("option")).toHaveLength(2);
    // The detail properties + the read-only preview for the selected item.
    expect(screen.getByText("stdio")).toBeInTheDocument();
    expect(screen.getByText("alpha.json")).toBeInTheDocument();
    expect(screen.getByText("name=alpha")).toBeInTheDocument();
  });

  it("switches the body when the view toggle changes", async () => {
    const user = userEvent.setup();
    render(<Harness config={makeConfig()} initialView="card" />);

    // Card: neither a table nor the master-detail list is present.
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: "Table view" }));
    expect(screen.getByRole("table")).toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: "Master-detail view" }));
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("filters items by the search query", async () => {
    const user = userEvent.setup();
    render(<Harness config={makeConfig()} initialView="card" />);

    await user.type(screen.getByRole("textbox"), "alpha");

    expect(screen.getByText("alpha")).toBeInTheDocument();
    expect(screen.queryByText("bravo")).not.toBeInTheDocument();
    expect(screen.queryByText("second thing")).not.toBeInTheDocument();
  });

  it("invokes the toggle callback when a switch is flipped", async () => {
    const onToggle = vi.fn();
    const config = makeConfig({
      toggle: (t) => ({ on: t.on, onChange: (next) => onToggle(t.id, next) }),
    });
    const user = userEvent.setup();
    render(<Harness config={config} initialView="card" />);

    // alpha is on → flipping it should call back with `false`.
    await user.click(screen.getByRole("switch", { name: "Toggle alpha" }));

    expect(onToggle).toHaveBeenCalledWith("1", false);
  });

  it("renders without a toggle column when the config omits one", () => {
    // makeConfig() has no `toggle`, so no Switch column should appear.
    render(<Harness config={makeConfig()} initialView="table" />);

    expect(screen.queryAllByRole("switch")).toHaveLength(0);
    expect(screen.getByText("alpha")).toBeInTheDocument();
    expect(screen.getByText("bravo")).toBeInTheDocument();
  });
});
