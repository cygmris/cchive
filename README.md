# cchive

**A calm desktop hub for Claude Code — switch accounts and configurations the moment one runs out.**

cchive (cc + hive) is a local, offline-first desktop app that gathers everything about your
Claude Code setup in one place: switch between subscription accounts and API providers, manage
MCP servers, agents, commands, skills and memory, and read your local usage — all on your
machine, nothing leaving your device. It runs as a native [Tauri](https://tauri.app) app
(Rust shell + React UI) and stores secrets in your OS keyring.

## What it does

- **Account switching** — capture the account you're signed into in Claude Code and switch
  between saved accounts. Switches are atomic and reversible (capture → backup → write →
  verify → rollback on failure) and preserve your per-MCP OAuth tokens (`mcpOAuth`).
- **Provider switching** — apply a saved provider profile (the `env` block in `settings.json`)
  for Anthropic-compatible endpoints, via a shallow merge that leaves your other settings
  untouched; a built-in **latency test** helps you pick the fastest endpoint.
- **Config management** — view and edit MCP servers, agents, commands, skills, and project /
  global memory (`CLAUDE.md`), with a CodeMirror editor.
- **Usage analytics** — daily output-token chart + tokens-by-model breakdown and a cost
  estimate, parsed from your local usage logs.
- **System tray quick-switch** — a tray menu lists your accounts and providers (active one
  checked); selecting one runs the **same** safe switch core as the in-app UI, fires a desktop
  notification, and refreshes the window. Left-click toggles the window; single-instance
  focuses the existing window on relaunch.
- **Notifications, import/export, backups** — opt-in desktop notifications via a surgical
  `settings.json` hook; secret-free export/import of your provider list + preferences; rotating
  backups of the Claude files with one-click restore (auto-snapshotted before every switch).
- **Personalization** — light/dark, swappable accent + density, and five UI languages
  (English / 中文 / 繁體中文 / 日本語 / Français); launch-at-login.

## Security model

- **Secrets live only in your OS keyring** (Secret Service / Keychain / Credential Manager) and
  **never cross the IPC boundary to the WebView** — Rust commands return labels and metadata
  only (enforced by tests + a repo-wide leak audit).
- **Export never contains secrets** — it writes your provider list and preferences without any
  key or token (a unit test asserts this).
- **Every write is atomic, backed up, and preserves unknown keys** — your hand-edited settings
  and `mcpOAuth` are never clobbered.
- No telemetry; narrow OS capabilities (notification, dialog, autostart self-launch, an opener
  scoped to the project's issue page).

## Stack

- **Shell:** Tauri v2 (Rust 2021), `tauri-plugin-store`, `tauri-plugin-single-instance`,
  `tauri-plugin-autostart`, `tauri-plugin-notification`, OS keyring (`keyring`) for the
  account vault
- **UI:** React 19 + TypeScript, built with Vite 7
- **Styling:** Tailwind v4 with a CSS-variable design-token layer (light/dark, accent presets,
  density), self-hosted Geist / Geist Mono fonts
- **Data:** TanStack Query v5 for server state
- **Tests:** Vitest + Testing Library (jsdom) on the frontend, `cargo test` on the Rust shell

## Prerequisites

- Node.js 20+ and [pnpm](https://pnpm.io)
- Rust toolchain (1.77.2+) and the platform's Tauri build dependencies

## Install

```bash
pnpm install
```

## Run

```bash
# Frontend dev server only (browser):
pnpm dev

# Full desktop app (opens the Tauri window):
pnpm tauri dev
```

The developer-only component gallery is reachable at the `#/gallery` hash; it is not part of
the shipped user navigation.

## Build

```bash
# Type-check + bundle the frontend
pnpm build

# Build the native app + installers
pnpm tauri build
```

Locally, `pnpm tauri build` produces installers for the host OS only. Linux is
the verified target (`.deb` + `.AppImage`). macOS (`.dmg`) and Windows (`.nsis`)
are built on their native runners by the **Release** CI workflow
(`.github/workflows/release.yml`), which runs the bundle matrix on a `v*` tag and
attaches the installers to a draft GitHub Release. The **CI** workflow
(`.github/workflows/ci.yml`) runs the type-check, both test suites, and the
builds on every push.

### Building the AppImage on Linux

```bash
# The .AppImage is the most portable Linux artifact (runs on any distro).
APPIMAGE_EXTRACT_AND_RUN=1 NO_STRIP=true pnpm tauri build --bundles appimage
# -> src-tauri/target/release/bundle/appimage/cchive_<ver>_amd64.AppImage
```

`APPIMAGE_EXTRACT_AND_RUN=1` lets `linuxdeploy` (itself an AppImage) run on hosts
where the `fuse` kernel module isn't loaded — common in containers/CI and on some
desktops. Two distro notes:

- **Arch Linux:** modern `gdk-pixbuf2` ships no modular loaders, so the loader
  directory `linuxdeploy-plugin-gtk` expects is absent and the bundle step fails
  with `cp: cannot stat '/usr/lib/gdk-pixbuf-2.0/2.10.0'`. Create the standard
  (empty) loader dir + cache once — exactly what `pkg-config` already advertises:
  ```bash
  sudo mkdir -p /usr/lib/gdk-pixbuf-2.0/2.10.0/loaders
  sudo sh -c 'gdk-pixbuf-query-loaders > /usr/lib/gdk-pixbuf-2.0/2.10.0/loaders.cache'
  ```
- **FUSE:** to *run* an AppImage on a host without the `fuse` module, either
  `sudo modprobe fuse` once, or launch it with `--appimage-extract-and-run`.

### Arch Linux — native package (recommended for clean updates)

An AppImage is a portable single file: the desktop integration keys its menu
entry on the AppImage's **path**, so a new build at a new path/name adds a second
"cchive (1)" entry instead of updating — there is no in‑place update. On Arch,
install the native package instead, which `pacman` updates in place by the
`cchive` package name (one menu entry, never a `(1)`):

```bash
bash scripts/build-arch-pkg.sh          # builds the release if needed, then makepkg
sudo pacman -U packaging/arch/cchive-*.pkg.tar.zst
```

To **update** later: build the new version and `pacman -U` the new package — it
replaces the old in place. (If you prefer the AppImage, overwrite the *same*
file at the *same* path so its integration entry updates rather than duplicating.)

## Code signing & notarization

The installers build **unsigned** by default — fine for local use and testing,
but unsigned apps trip macOS Gatekeeper and Windows SmartScreen, so signing is
required for public distribution. Like the updater, signing is left as a
release-time step so each maintainer controls their own identity; **no
certificates or keys are committed**. To sign:

- **macOS** — add a Developer ID Application certificate and notarization
  credentials as repo secrets (`APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`,
  `APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID`). The
  Release workflow already wires these into `tauri-action`; with them set the
  `.dmg`/`.app` is signed and notarized (stapled) automatically.
- **Windows** — sign the `.nsis`/`.msi` with an Authenticode certificate (an EV
  cert avoids SmartScreen reputation warnings). Configure `tauri.conf.json`
  `bundle.windows.certificateThumbprint` (or a signing-command) and provide the
  cert to the runner.
- **Linux** — `.deb`/`.AppImage` are conventionally distributed unsigned;
  optionally GPG-sign the repository metadata.

## Test & verify

```bash
pnpm exec tsc --noEmit        # type-check (zero errors)
pnpm test                     # frontend unit tests (Vitest)
pnpm exec vite build          # frontend production bundle
cd src-tauri && cargo test    # Rust unit tests
cd src-tauri && cargo build   # native shell
```

## Project layout

```
src/
  theme/      design tokens, fonts, ThemeProvider + theme engine
  ui/         core components (Button, Badge, Card, Input, Modal, …)
  lib/        cn(), typed prefs store, IPC bindings, query hooks, shared types
  screens/    accounts/providers, config editor, MCP, agents, usage, settings, …
src-tauri/
  src/core/   account/provider switch core (capture/atomic/rollback/keyring)
  src/tray.rs system tray icon + quick-switch menu (reuses the switch core)
  icons/      app icon set generated from the C-Key mark
  capabilities/ Tauri v2 ACL
  tauri.conf.json
```

## Enabling updates

cchive is built to support signed in-app updates via `tauri-plugin-updater`, but **no signing
key or update endpoint is committed to this repository** — those are supplied at release time
so each maintainer controls their own signing identity and hosting. To enable updates for your
own builds:

1. **Generate a minisign keypair** with the Tauri CLI:
   ```bash
   pnpm tauri signer generate -w ~/.tauri/cchive-updater.key
   ```
   Keep the **private** key secret (store it in your CI secrets, e.g.
   `TAURI_SIGNING_PRIVATE_KEY` + its password); the command also prints the matching **public**
   key.

2. **Add the updater plugin** to the desktop dependencies (`src-tauri/Cargo.toml`,
   desktop-only target) and register it in the builder, then add the updater config to
   `tauri.conf.json`:
   ```jsonc
   // plugins.updater — values shown as placeholders; fill in at release time
   "plugins": {
     "updater": {
       "pubkey": "<YOUR_MINISIGN_PUBLIC_KEY>",
       "endpoints": ["https://<your-host>/cchive/latest.json"]
     }
   }
   ```
   Also set `"createUpdaterArtifacts": true` under `bundle` so the build emits signed
   artifacts.

3. **Host a `latest.json`** describing the newest release (version, notes, per-platform signed
   artifact URLs + signatures). The build/CI signs each artifact with the private key; the app
   verifies the download against the embedded public key before installing.

Until you complete those steps, the app simply ships without an update channel — there are no
placeholder keys or endpoints baked into the source.

## License

[MIT](LICENSE) © 2026 Chris.

## Colophon

cchive was designed and built end-to-end with [Claude Code](https://claude.com/claude-code) —
spec-driven, screen by screen, with the safe-switch core and security model verified by tests.
