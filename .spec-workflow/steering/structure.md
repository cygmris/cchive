# Project Structure

## Directory Organization

```
Clavis/                              # repo root (product name: Clavis)
├── src/                             # React + TS frontend (Vite root)
│   ├── main.tsx                     # entry; mounts App, i18n, query client, theme
│   ├── App.tsx                      # shell composition + router outlet
│   ├── app/                         # app-shell pieces (not feature screens)
│   │   ├── Window.tsx               # 1300×840 macOS window chrome + traffic lights
│   │   ├── Sidebar.tsx              # logo tile, search/launcher, nav groups, active-config card, theme switch
│   │   ├── StatusBar.tsx            # bottom status bar (active/model/MCP/Skills/tokens/Synced)
│   │   ├── CommandPalette.tsx       # ⌘K palette (real keyboard nav)
│   │   ├── AccountSwitcher.tsx      # sidebar switcher popover
│   │   └── router.ts               # 13-screen route map + active-screen state
│   ├── screens/                     # one folder per screen (feature UI)
│   │   ├── overview/  configurations/  config-editor/  projects/
│   │   ├── mcp/  agents/  commands/  skills/  memory/
│   │   ├── usage/  notifications/  experimental/  settings/
│   │   └── _collection/             # shared Card/Table/Master-detail collection used by mcp/agents/commands/skills
│   ├── ui/                          # the Clavis component library (design system)
│   │   ├── Button.tsx  Switch.tsx  Badge.tsx  Card.tsx  StatTile.tsx
│   │   ├── Input.tsx  Select.tsx  SegmentedControl.tsx  IconButton.tsx
│   │   ├── Tooltip.tsx  Popover.tsx  Modal.tsx  Toast.tsx  Radio.tsx
│   │   ├── icons.tsx                # Lucide re-exports + the C-Key logo SVG components
│   │   └── charts/                  # BarChart, ModelBars, Heatmap wrappers
│   ├── theme/                       # tokens → CSS vars, theme + accent + density providers
│   │   ├── tokens.css               # all design tokens (light :root + .dark), from .design-bundles/tokens
│   │   ├── theme.ts                 # ThemeProvider, useTheme, accent/density application
│   │   └── fonts.css                # @font-face for self-hosted Geist + Geist Mono
│   ├── lib/                         # frontend non-UI logic
│   │   ├── ipc.ts                   # typed wrappers over Tauri commands
│   │   ├── types.ts                 # shared TS types (Account, Provider, McpServer, …)
│   │   ├── queries.ts               # TanStack Query hooks
│   │   └── store.ts                 # Zustand UI store
│   ├── i18n/                        # i18next setup + locales/{en,zh-Hans,zh-Hant,ja,fr}.json
│   └── assets/fonts/                # Geist-Variable.woff2, GeistMono-Variable.woff2
├── src-tauri/                       # Rust backend
│   ├── src/
│   │   ├── main.rs                  # Tauri builder: plugins (single-instance FIRST), tray, commands
│   │   ├── commands/                # #[tauri::command] thin wrappers, grouped by domain
│   │   │   ├── accounts.rs  providers.rs  settings.rs  mcp.rs
│   │   │   ├── agents.rs  commands_cmds.rs  skills.rs  memory.rs
│   │   │   ├── projects.rs  usage.rs  notifications.rs  app_prefs.rs
│   │   ├── core/                    # privileged services (no Tauri types where avoidable; unit-tested)
│   │   │   ├── paths.rs             # claude dir resolution (CLAUDE_CONFIG_DIR, $HOME/.claude.json)
│   │   │   ├── atomic_fs.rs         # temp+fsync+rename, mode 0600, timestamped backup, rollback
│   │   │   ├── credentials.rs       # read/write active credential per OS (Keychain on mac)
│   │   │   ├── keyring_store.rs     # Clavis account vault via `keyring` crate
│   │   │   ├── claude_json.rs       # ~/.claude.json parse/mutate (oauthAccount, mcpServers, projects)
│   │   │   ├── settings.rs          # settings.json parse/mutate/shallow-merge env
│   │   │   ├── usage.rs             # jsonl streaming parse, dedup, per-day/model aggregation, cost
│   │   │   └── notify_hook.rs       # install/remove our notification hook in settings.json
│   │   ├── model.rs                 # serde structs/enums shared by core + commands
│   │   └── tray.rs                  # tray icon + dynamic account quick-switch menu
│   ├── capabilities/default.json    # narrow Tauri v2 ACL
│   ├── icons/                       # app icon set (C-Key tile) generated for all platforms
│   ├── Cargo.toml
│   └── tauri.conf.json              # bundle id app.clavis, productName "Clavis", window, updater
├── .spec-workflow/                  # specs, steering, templates (committed)
├── .design-bundles/                 # LOCAL-ONLY design reference (git-ignored)
├── docs/                            # per-module user/dev docs (synced at milestones)
├── package.json   pnpm-lock.yaml   vite.config.ts   tsconfig.json   biome.json
└── .gitignore   README.md
```

## Naming Conventions

### Files
- **React components / screens**: `PascalCase.tsx` (e.g. `Sidebar.tsx`, `ConfigEditor.tsx`); screen folders are `kebab-case`.
- **Frontend non-component modules**: `camelCase.ts` (e.g. `ipc.ts`, `queries.ts`).
- **Rust modules/files**: `snake_case.rs`.
- **Tests**: frontend `*.test.ts(x)` (Vitest); Rust inline `#[cfg(test)] mod tests`.
- **Locale files**: `i18n/locales/<lang>.json`.

### Code
- **TS types/interfaces/components**: `PascalCase`. **Functions/vars**: `camelCase`. **Constants**: `UPPER_SNAKE_CASE`.
- **Rust types/traits/enums**: `PascalCase`. **Functions/vars/modules**: `snake_case`. **Consts/statics**: `UPPER_SNAKE_CASE`.
- **Tauri commands**: `snake_case` names exposed to JS as the same string (e.g. `switch_account`, `read_usage`).

## Import Patterns

### Import Order (frontend)
1. External deps (react, @tanstack, zustand, recharts, lucide-react).
2. Internal absolute imports from `@/` (alias to `src/`): `ui/`, `lib/`, `theme/`, `screens/`.
3. Relative imports within the same feature folder.
4. Style imports last.

### Module organization
- Frontend uses an `@/*` path alias (tsconfig + vite). UI components import only from `@/ui`, `@/theme`, `@/lib` — **never** from a screen. Screens compose `@/ui` + call `@/lib/ipc`.
- Rust: `commands/*` depend on `core/*`; `core/*` depend on nothing in `commands/*` (one-way). `model.rs` is shared and depends on neither.

## Code Structure Patterns

### Rust service module (core/*)
1. Imports + `use`.
2. Types/structs for this service.
3. Public functions (the privileged operation: validate → capture → write atomically → verify).
4. Private helpers.
5. `#[cfg(test)] mod tests` — especially switch/atomic/rollback coverage over a temp `$HOME` fixture.

### React component
1. Imports.
2. Types/props.
3. Component (hooks first: query/zustand/i18n; then derived; then handlers; then JSX).
4. Small local subcomponents below or co-located.

### File Organization Principles
- One screen per folder; one component per file (small helpers may co-locate).
- The privileged/dangerous code is concentrated in `src-tauri/src/core/` and is the most heavily tested.
- Design tokens live in exactly one place (`theme/tokens.css`); components reference CSS vars, never hardcoded hex.

## Code Organization Principles
1. **Single Responsibility** — each module has one clear purpose; `core/*` services are independently testable.
2. **Secrets stay in Rust** — tokens never cross the IPC boundary into the WebView; only labels/metadata do.
3. **Source-of-truth discipline** — the file system is the truth for Claude config; the OS keyring is the truth for secrets; tokens are the truth for styling. Don't duplicate.
4. **Consistency** — follow the design system and the established service/command shape.

## Module Boundaries
- **Privileged vs unprivileged**: `src-tauri/src/core` (FS + secrets) ↔ `src` (React) communicate only through the typed `commands/*` + `lib/ipc.ts` boundary. The WebView never touches the FS or keychain directly.
- **Design system vs features**: `src/ui` + `src/theme` are a self-contained library; `src/screens` consume it. UI never imports a screen.
- **Cross-platform isolation**: OS-specific credential logic (Keychain vs file) is isolated in `core/credentials.rs` behind one interface.
- **Stable vs experimental**: experimental flags are surfaced only on the Experimental screen and clearly labelled.
- **Dependency direction**: `commands → core → model`; UI: `screens → ui/theme/lib`. No cycles.

## Code Size Guidelines
- **File size**: aim ≤ ~300 lines; split larger screens into subcomponents.
- **Function size**: aim ≤ ~60 lines; privileged FS operations may be longer but stay linear and well-commented.
- **Nesting**: ≤ 3–4 levels; prefer early returns (Rust `?`, guard clauses).

## Documentation Standards
- Every Tauri command documents its on-disk effect (what it reads/writes) in a doc comment.
- The data-loss-critical `core/*` functions carry comments explaining the capture→write→rollback contract.
- `docs/<module>.md` per milestone (feature, file contract, key flows); a living roadmap at `.spec-workflow/steering/roadmap.md`.
- README documents build/run/release and the (de-fingerprinted) project identity.
