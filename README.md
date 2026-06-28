# Clavis

Clavis is a local, offline-first desktop manager for your Claude Code configuration and
accounts. It runs as a native [Tauri](https://tauri.app) app (Rust shell + React UI) and
keeps everything on your machine: switch between provider accounts, edit Claude Code config,
and review usage without anything leaving your device.

The application identity is `app.clavis`.

## Stack

- **Shell:** Tauri v2 (Rust 2021), `tauri-plugin-store`, `tauri-plugin-single-instance`
- **UI:** React 19 + TypeScript, built with Vite 7
- **Styling:** Tailwind v4 with a CSS-variable design-token layer (light/dark, accent presets, density), self-hosted Geist / Geist Mono fonts
- **Tests:** Vitest + Testing Library (jsdom)

This repository currently contains the **design-system foundation (S1)**: the token layer,
theme engine, the core UI component library under `src/ui/`, and a developer-only gallery.

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

# Build the native app
pnpm tauri build
```

## Test & verify

```bash
pnpm exec tsc --noEmit        # type-check (zero errors)
pnpm test                     # unit tests (Vitest)
pnpm exec vite build          # frontend production bundle
cd src-tauri && cargo build   # native shell
```

## Project layout

```
src/
  theme/      design tokens, fonts, ThemeProvider + theme engine
  ui/         core components (Button, Badge, Card, Input, Modal, …)
  lib/        cn(), typed prefs store, shared types
  screens/    _gallery/ dev-only component showcase
src-tauri/    Rust Tauri shell, capabilities, config
```
