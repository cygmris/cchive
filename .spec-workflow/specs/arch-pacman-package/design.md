# Design Document — arch-pacman-package (S20)

## Overview

A `packaging/arch/PKGBUILD` that packages the already‑built release binary +
generated icons + a `.desktop` entry into `clavis-<ver>-<rel>-x86_64.pkg.tar.zst`,
a `packaging/arch/clavis.desktop`, and `scripts/build-arch-pkg.sh` (build release
if missing, then makepkg). Installed via `pacman -U`, it gives one menu entry and
in‑place updates by the `clavis` package name — no AppImage `(1)` duplicates. No
app code changes.

## Steering Document Alignment

### Technical Standards (tech.md)
- Standard Arch packaging (`makepkg`/`pacman`), FHS paths, real runtime `depends`.
  Reuses the verified `src-tauri/target/release/clavis` + `src-tauri/icons/`. No
  predecessor strings; identity `app.clavis`/Clavis.

### Project Structure (structure.md)
- New `packaging/arch/{PKGBUILD,clavis.desktop}` + `scripts/build-arch-pkg.sh` +
  a README "Arch Linux" section. Nothing under `src/` changes.

## Code Reuse Analysis

### Existing Components to Leverage
- The release binary + the C‑Key icon set (regenerated in S14). The same product
  identity (Clavis, `app.clavis`).

### Integration Points
- The build script → `pnpm tauri build` (or just the binary) → makepkg → a
  `.pkg.tar.zst`. `pacman -U` installs/updates.

## Architecture

```mermaid
graph TD
    REL[src-tauri/target/release/clavis + icons] --> PKG[packaging/arch/PKGBUILD package()]
    DESK[packaging/arch/clavis.desktop] --> PKG
    PKG --> MK[makepkg -> clavis-ver-x86_64.pkg.tar.zst]
    MK --> PAC[sudo pacman -U -> /usr/bin/clavis + menu entry]
    PAC -->|next version: pacman -U| PAC2[in-place update, one entry]
```

### Modular Design Principles
- Packaging is configuration/scripts only — no app logic. The PKGBUILD packages a
  prebuilt binary (fast, uses the tested artifact).

## Components and Interfaces

### packaging/arch/PKGBUILD
- `pkgname=clavis`, `pkgver=0.1.0`, `pkgrel=1`, `arch=('x86_64')`,
  `url`/`license=('MIT')`/`pkgdesc` (calm Claude Code config/account manager),
  `depends=('webkit2gtk-4.1' 'gtk3' 'libayatana-appindicator')`,
  `options=('!strip')` (binary already stripped/large), `source=()` (prebuilt).
- `package()` installs from the repo (paths via `$startdir/../..`): the binary →
  `usr/bin/clavis` (0755); icons `32x32`,`128x128`,`128x128@2`,`icon.png(256)` →
  `usr/share/icons/hicolor/<size>/apps/clavis.png`; `clavis.desktop` →
  `usr/share/applications/clavis.desktop`. A missing release binary SHALL error
  with a clear "run the build first" message.

### packaging/arch/clavis.desktop
- `[Desktop Entry]` Type=Application, Name=Clavis,
  Comment=Switch Claude Code accounts and configurations, Exec=clavis,
  Icon=clavis, Categories=Development;Utility;, Terminal=false, StartupWMClass=Clavis.

### scripts/build-arch-pkg.sh
- Resolve repo root; if `src-tauri/target/release/clavis` is missing run
  `pnpm tauri build` (or instruct to); `cd packaging/arch && makepkg -f`; print the
  resulting `.pkg.tar.zst` path + the `pacman -U` install hint. Unprivileged (no
  sudo in the script; install is the user's explicit step).

### README
- An "Arch Linux" subsection: `bash scripts/build-arch-pkg.sh` then
  `sudo pacman -U packaging/arch/clavis-*.pkg.tar.zst`; updates = build the new
  version + `pacman -U` again (in place, no duplicate). Contrast: the AppImage is
  portable and integrates by file path, so a new file makes a second menu entry —
  use the package (or overwrite the same AppImage path) to avoid `(1)`.

## Data Models
- None.

## Error Handling
1. **Release binary missing:** `package()`/the script errors with "build the
   release first" — no broken package.
2. **Re‑install / version bump:** `pacman -U` replaces by name (one entry); the
   pacman db is the source of truth.
3. **Missing icon size:** install only the sizes that exist (guard each).

## Testing Strategy

### Manual / scripted (the gate)
- `makepkg -f` builds the package with no error; `namcap` (if present) shows no
  critical errors. `sudo pacman -U` installs; `pacman -Q clavis` reports it;
  `/usr/bin/clavis` runs; `pacman -Ql clavis` lists the binary + desktop + icons;
  exactly one `clavis.desktop` in `/usr/share/applications`. A `pkgrel` bump +
  `pacman -U` updates in place (no second entry) — then optionally
  `pacman -R clavis` cleans up.

### Fingerprint
- Grep PKGBUILD/.desktop/README for predecessor strings → zero.
