/**
 * Developer-only component gallery (NOT part of the shipped user navigation).
 *
 * Reachable at `#/gallery` (see App.tsx) so contributors can eyeball every
 * component × variant against the design in both themes, all five accents, and
 * both densities. The top control bar flips theme / accent / density through
 * `useTheme`, so the whole token layer retints live. Everything below is pure
 * token-driven styling — no hardcoded colors — exactly like the shipped UI.
 */
import { useState, type CSSProperties, type ReactNode } from "react";
import { useTheme } from "@/theme/ThemeProvider";
import type { AccentName, Density, Theme } from "@/lib/types";
import { Button } from "@/ui/Button";
import { IconButton } from "@/ui/IconButton";
import { Switch } from "@/ui/Switch";
import { Radio } from "@/ui/Radio";
import { SegmentedControl } from "@/ui/SegmentedControl";
import {
  Badge,
  ProviderChip,
  ModelBadge,
  SourceBadge,
  type ProviderName,
} from "@/ui/Badge";
import { Card } from "@/ui/Card";
import { StatTile } from "@/ui/StatTile";
import { Input } from "@/ui/Input";
import { Select } from "@/ui/Select";
import { Tooltip } from "@/ui/Tooltip";
import { Popover } from "@/ui/Popover";
import { Modal } from "@/ui/Modal";
import { ToastProvider, useToast } from "@/ui/Toast";
import { LogoMark, LogoTile } from "@/ui/Logo";
import {
  Activity,
  Bell,
  Bot,
  LogOut,
  Pencil,
  Plus,
  Server,
  Settings,
  Trash,
  Zap,
} from "@/ui/icons";

/* ------------------------------------------------------------------ layout */

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={{ marginBottom: 36 }}>
      <h2
        style={{
          margin: "0 0 14px",
          fontFamily: "var(--font-sans)",
          fontSize: "var(--fs-label)",
          letterSpacing: "var(--ls-label)",
          lineHeight: "var(--lh-label)",
          textTransform: "uppercase",
          color: "var(--text-3)",
        }}
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

const ROW: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: 14,
};

const COL: CSSProperties = { display: "flex", flexDirection: "column", gap: 14 };

function Label({ children }: { children: ReactNode }) {
  return (
    <span
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: "var(--fs-mono-sm)",
        color: "var(--text-3)",
      }}
    >
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------ swatch */

function Swatch({ token }: { token: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <div
        style={{
          width: 84,
          height: 48,
          borderRadius: "var(--radius-md)",
          background: `var(${token})`,
          border: "1px solid var(--border)",
          boxShadow: "var(--shadow-card)",
        }}
      />
      <Label>{token}</Label>
    </div>
  );
}

const NEUTRAL_TOKENS = [
  "--app-bg",
  "--surface",
  "--surface-2",
  "--sidebar-bg",
  "--border",
  "--border-strong",
  "--backdrop",
  "--text",
  "--text-2",
  "--text-3",
];
const SEMANTIC_TOKENS = ["--success", "--warning", "--danger", "--info"];
const ACCENT_TOKENS = [
  "--accent-clay",
  "--accent-blue",
  "--accent-green",
  "--accent-violet",
  "--accent-ember",
];

const THEME_OPTIONS = [
  { value: "light" as Theme, label: "Light" },
  { value: "dark" as Theme, label: "Dark" },
];
const ACCENT_OPTIONS: { value: AccentName; label: string }[] = [
  { value: "clay", label: "Clay" },
  { value: "blue", label: "Blue" },
  { value: "green", label: "Green" },
  { value: "violet", label: "Violet" },
  { value: "ember", label: "Ember" },
];
const DENSITY_OPTIONS = [
  { value: "comfortable" as Density, label: "Comfortable" },
  { value: "compact" as Density, label: "Compact" },
];

const PROVIDERS: ProviderName[] = ["anthropic", "zai", "kimi", "aws", "deepseek"];
const LOGO_SIZES = [16, 24, 32, 48];

/* ------------------------------------------------------------------ screen */

/** Dev gallery entry point — provides Toast context for the demos within. */
export function Gallery() {
  return (
    <ToastProvider>
      <GalleryBody />
    </ToastProvider>
  );
}

function GalleryBody() {
  const { theme, accent, density, setTheme, setAccent, setDensity } = useTheme();
  const { toast } = useToast();

  const [sw1, setSw1] = useState(true);
  const [sw2, setSw2] = useState(false);
  const [radio, setRadio] = useState("a");
  const [view, setView] = useState("list");
  const [range, setRange] = useState("30d");
  const [select, setSelect] = useState("");
  const [smOpen, setSmOpen] = useState(false);
  const [mdOpen, setMdOpen] = useState(false);

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "var(--app-bg)",
        color: "var(--text)",
        fontFamily: "var(--font-sans)",
        padding: "var(--gutter)",
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          marginBottom: 28,
        }}
      >
        <LogoTile size={36} />
        <div>
          <h1
            style={{
              margin: 0,
              fontSize: "var(--fs-title)",
              lineHeight: "var(--lh-title)",
              letterSpacing: "var(--ls-title)",
              fontWeight: 600,
            }}
          >
            cchive Component Gallery
          </h1>
          <p style={{ margin: "2px 0 0", color: "var(--text-2)", fontSize: "var(--fs-body-sm)" }}>
            Developer-only · #/gallery
          </p>
        </div>
      </header>

      {/* Theme / accent / density controls */}
      <Card
        style={{
          position: "sticky",
          top: 0,
          zIndex: 5,
          display: "flex",
          flexWrap: "wrap",
          gap: 24,
          marginBottom: 32,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <Label>theme</Label>
          <SegmentedControl
            aria-label="Theme"
            options={THEME_OPTIONS}
            value={theme}
            onChange={setTheme}
          />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <Label>accent</Label>
          <SegmentedControl
            aria-label="Accent"
            options={ACCENT_OPTIONS}
            value={accent}
            onChange={setAccent}
          />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <Label>density</Label>
          <SegmentedControl
            aria-label="Density"
            options={DENSITY_OPTIONS}
            value={density}
            onChange={setDensity}
          />
        </div>
      </Card>

      {/* Tokens */}
      <Section title="Token swatches — neutrals">
        <div style={ROW}>
          {NEUTRAL_TOKENS.map((t) => (
            <Swatch key={t} token={t} />
          ))}
        </div>
      </Section>
      <Section title="Token swatches — semantic">
        <div style={ROW}>
          {SEMANTIC_TOKENS.map((t) => (
            <Swatch key={t} token={t} />
          ))}
        </div>
      </Section>
      <Section title="Token swatches — accents">
        <div style={ROW}>
          {ACCENT_TOKENS.map((t) => (
            <Swatch key={t} token={t} />
          ))}
        </div>
      </Section>

      {/* Logo */}
      <Section title="Logo">
        <div style={ROW}>
          {LOGO_SIZES.map((s) => (
            <LogoMark key={`mark-${s}`} size={s} style={{ color: "var(--accent)" }} />
          ))}
          {LOGO_SIZES.map((s) => (
            <LogoMark key={`ink-${s}`} size={s} style={{ color: "var(--text)" }} />
          ))}
          {LOGO_SIZES.map((s) => (
            <LogoTile key={`tile-${s}`} size={s} />
          ))}
        </div>
      </Section>

      {/* Buttons */}
      <Section title="Button">
        <div style={COL}>
          <div style={ROW}>
            <Button variant="primary">Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="danger">Danger</Button>
          </div>
          <div style={ROW}>
            <Button variant="primary" icon={<Plus size={16} />}>
              With icon
            </Button>
            <Button variant="secondary" icon={<Settings size={16} />}>
              Settings
            </Button>
            <Button variant="primary" loading>
              Loading
            </Button>
            <Button variant="primary" disabled>
              Disabled
            </Button>
          </div>
          <div style={ROW}>
            <Button size="sm" variant="primary">
              Small
            </Button>
            <Button size="sm" variant="secondary">
              Small
            </Button>
            <Button size="sm" variant="ghost">
              Small
            </Button>
            <Button size="sm" variant="danger">
              Small
            </Button>
          </div>
        </div>
      </Section>

      {/* IconButton */}
      <Section title="IconButton">
        <div style={ROW}>
          <IconButton aria-label="Edit" icon={<Pencil size={16} />} />
          <IconButton aria-label="Settings" icon={<Settings size={16} />} />
          <IconButton aria-label="Delete" danger icon={<Trash size={16} />} />
          <IconButton aria-label="Sign out" danger icon={<LogOut size={16} />} />
          <IconButton aria-label="Small" size="sm" icon={<Plus size={15} />} />
          <IconButton aria-label="Disabled" disabled icon={<Settings size={16} />} />
        </div>
      </Section>

      {/* Switch / Radio / Segmented */}
      <Section title="Switch · Radio · SegmentedControl">
        <div style={COL}>
          <div style={ROW}>
            <Switch checked={sw1} onChange={setSw1} />
            <Switch checked={sw2} onChange={setSw2} />
            <Switch checked size="sm" onChange={() => {}} />
            <Switch checked disabled onChange={() => {}} />
            <Label>on / off / sm / disabled</Label>
          </div>
          <div style={ROW}>
            <Radio checked={radio === "a"} onChange={() => setRadio("a")} aria-label="A" />
            <Radio checked={radio === "b"} onChange={() => setRadio("b")} aria-label="B" />
            <Radio checked={radio === "c"} onChange={() => setRadio("c")} aria-label="C" />
            <Radio checked disabled aria-label="Disabled" onChange={() => {}} />
            <Label>radio group + disabled</Label>
          </div>
          <div style={ROW}>
            <SegmentedControl
              aria-label="View mode"
              options={[
                { value: "list", label: "List" },
                { value: "grid", label: "Grid" },
                { value: "board", label: "Board" },
              ]}
              value={view}
              onChange={setView}
            />
            <SegmentedControl
              aria-label="Range"
              size="sm"
              options={[
                { value: "30d", label: "30d" },
                { value: "7d", label: "7d" },
              ]}
              value={range}
              onChange={setRange}
            />
          </div>
        </div>
      </Section>

      {/* Badges */}
      <Section title="Badge — semantic">
        <div style={ROW}>
          <Badge variant="neutral" dot>
            Neutral
          </Badge>
          <Badge variant="accent">Active</Badge>
          <Badge variant="success" dot>
            Success
          </Badge>
          <Badge variant="warning" dot>
            Warning
          </Badge>
          <Badge variant="danger" dot>
            Danger
          </Badge>
          <Badge variant="info" dot>
            Info
          </Badge>
        </div>
      </Section>
      <Section title="Badge — provider chips">
        <div style={ROW}>
          {PROVIDERS.map((p) => (
            <ProviderChip key={p} provider={p} />
          ))}
        </div>
      </Section>
      <Section title="Badge — model / source">
        <div style={ROW}>
          <ModelBadge model="sonnet" />
          <ModelBadge model="opus" />
          <ModelBadge model="haiku" />
          <span style={{ width: 12 }} />
          <SourceBadge source="personal" />
          <SourceBadge source="project" />
          <SourceBadge source="plugin" />
        </div>
      </Section>

      {/* Cards */}
      <Section title="Card">
        <div style={{ ...ROW, alignItems: "stretch" }}>
          <Card style={{ width: 260 }}>
            <strong style={{ fontSize: "var(--fs-heading)" }}>Base card</strong>
            <p style={{ margin: "6px 0 0", color: "var(--text-2)", fontSize: "var(--fs-body)" }}>
              Hairline border on surface with a near-flat warm shadow.
            </p>
          </Card>
          <Card accentBar style={{ width: 260 }}>
            <strong style={{ fontSize: "var(--fs-heading)" }}>Accent bar</strong>
            <p style={{ margin: "6px 0 0", color: "var(--text-2)", fontSize: "var(--fs-body)" }}>
              The active-configuration banner.
            </p>
          </Card>
          <Card hero style={{ width: 260 }}>
            <strong style={{ fontSize: "var(--fs-heading)" }}>Hero card</strong>
            <p style={{ margin: "6px 0 0", color: "var(--text-2)", fontSize: "var(--fs-body)" }}>
              Raised feature card — one per screen.
            </p>
          </Card>
        </div>
      </Section>

      {/* StatTiles */}
      <Section title="StatTile">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, minmax(160px, 1fr))",
            gap: "var(--card-gap)",
            maxWidth: 760,
          }}
        >
          <StatTile label="Tokens today" value="246.1K" icon={<Zap size={14} />} onClick={() => {}} />
          <StatTile label="Requests" value="1,204" icon={<Activity size={14} />} onClick={() => {}} />
          <StatTile label="MCP servers" value="7" icon={<Server size={14} />} onClick={() => {}} />
          <StatTile label="Agents" value="12" icon={<Bot size={14} />} />
        </div>
      </Section>

      {/* Inputs / Select */}
      <Section title="Input · Select">
        <div style={{ ...COL, maxWidth: 360 }}>
          <Input placeholder="Plain text field" />
          <Input variant="search" placeholder="Search…" />
          <Input variant="secret" />
          <Input mono placeholder="https://api.anthropic.com/v1" defaultValue="sk-ant-•••" />
          <Input invalid placeholder="Invalid field" defaultValue="oops" />
          <Input disabled placeholder="Disabled" />
          <Select
            options={[
              { label: "Claude Sonnet", value: "sonnet" },
              { label: "Claude Opus", value: "opus" },
              { label: "Claude Haiku", value: "haiku" },
            ]}
            placeholder="Choose a model"
            value={select}
            onChange={(e) => setSelect(e.target.value)}
          />
        </div>
      </Section>

      {/* Overlays */}
      <Section title="Tooltip · Popover · Modal · Toast">
        <div style={ROW}>
          <Tooltip label="A small delayed label">
            <Button variant="secondary">Hover for tooltip</Button>
          </Tooltip>
          <Tooltip mono label="claude-opus-4">
            <Button variant="ghost">Mono tooltip</Button>
          </Tooltip>

          <Popover
            trigger={<Button variant="secondary" icon={<Plus size={16} />}>New provider</Button>}
          >
            {({ close }) => (
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {PROVIDERS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={close}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "7px 8px",
                      border: "none",
                      background: "transparent",
                      borderRadius: "var(--radius-md)",
                      color: "var(--text)",
                      fontSize: "var(--fs-body)",
                      textAlign: "left",
                      cursor: "pointer",
                    }}
                  >
                    <ProviderChip provider={p} size={20} />
                    <span style={{ textTransform: "capitalize" }}>{p}</span>
                  </button>
                ))}
              </div>
            )}
          </Popover>

          <Button variant="secondary" onClick={() => setSmOpen(true)}>
            Open modal (sm)
          </Button>
          <Button variant="secondary" onClick={() => setMdOpen(true)}>
            Open modal (md)
          </Button>

          <Button icon={<Bell size={16} />} onClick={() => toast({ title: "Saved", variant: "success", description: "Configuration applied." })}>
            Toast: success
          </Button>
          <Button
            variant="secondary"
            onClick={() => toast({ title: "Heads up", variant: "warning", description: "Token expires soon." })}
          >
            Toast: warning
          </Button>
          <Button
            variant="danger"
            onClick={() => toast({ title: "Failed", variant: "danger", description: "Could not reach the endpoint." })}
          >
            Toast: danger
          </Button>
        </div>
      </Section>

      <Modal
        open={smOpen}
        onClose={() => setSmOpen(false)}
        title="Connect account"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setSmOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => setSmOpen(false)}>Authorize</Button>
          </>
        }
      >
        A compact OAuth-style card (~380px). Closes on Esc, backdrop press, or the
        close button.
      </Modal>

      <Modal
        open={mdOpen}
        onClose={() => setMdOpen(false)}
        title="Command palette"
        size="md"
      >
        A wider panel (~540px) for the command palette host.
      </Modal>
    </main>
  );
}
