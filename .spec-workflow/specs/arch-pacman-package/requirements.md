# Requirements Document — arch-pacman-package (S20)

## Introduction

On Arch, the AppImage integrates by hashing its file **path**, so a new build at
a new path/name registers a *second* menu entry ("Clavis (1)") instead of
updating — there is no in‑place update for a portable AppImage. The Arch‑native
fix is a real package: a `.pkg.tar.zst` installed with `pacman -U`, keyed by the
package name `clavis`, which updates in place and never duplicates. Tauri's
bundler doesn't emit pacman packages, so S20 adds a PKGBUILD that packages the
already‑built release binary + icons + a `.desktop` entry, plus a small build
script.

## Alignment with Product Vision

Completes "installable, cross‑platform" for the user's actual distro (Arch) with
clean install/update semantics — the same goal the deb/AppImage targets serve for
other platforms.

## Requirements

### Requirement 1 — A PKGBUILD that packages the release build

**User Story:** As an Arch user, I want a native package so installs/updates are
clean.

#### Acceptance Criteria
1. `packaging/arch/PKGBUILD` SHALL produce `clavis-<ver>-<rel>-x86_64.pkg.tar.zst`
   with `pkgname=clavis`, the correct version, license, url, and a short
   description — no predecessor strings; identity stays `app.clavis`/Clavis.
2. It SHALL install: the release binary → `/usr/bin/clavis`; the app icons (from
   the generated set) → `/usr/share/icons/hicolor/<size>/apps/clavis.png`; a
   `.desktop` entry → `/usr/share/applications/clavis.desktop` (Name=Clavis,
   Exec=clavis, Icon=clavis, a Development/Utility category).
3. It SHALL declare the runtime `depends` (webkit2gtk‑4.1, gtk3, the tray's
   appindicator) so `pacman` pulls them.
4. It SHALL package the **pre‑built** `src-tauri/target/release/clavis` (no rebuild
   inside makepkg) so packaging is fast and uses the verified binary.

### Requirement 2 — Build + install + verify

**User Story:** As the user, I want it actually built and installed, and proven to
update in place.

#### Acceptance Criteria
1. `makepkg` SHALL produce the package from the PKGBUILD without error.
2. `sudo pacman -U` SHALL install it; `pacman -Q clavis` SHALL report it;
   `/usr/bin/clavis` SHALL exist and launch the app; the menu SHALL show one
   "Clavis" entry (no AppImage‑style `(1)`).
3. Re‑installing the same/newer package with `pacman -U` SHALL update **in place**
   (same package name) — demonstrably no second entry. (A pkgver bump simulates an
   update.)

### Requirement 3 — Documented

**User Story:** As a maintainer, I want the Arch path documented.

#### Acceptance Criteria
1. The README SHALL document the Arch install: build the release, then
   `makepkg`/`pacman -U` (and that updates are `pacman -U` the new package). It
   SHALL contrast with the AppImage (portable, no in‑place update → the `(1)`
   behavior) so the choice is clear.

## Non-Functional Requirements

### Code Architecture and Modularity
- `packaging/arch/PKGBUILD` + `packaging/arch/clavis.desktop` + a thin
  `scripts/build-arch-pkg.sh` that builds the release (if needed) then runs
  makepkg. No app code change. No secrets/fingerprints.

### Security / Reliability
- Packages only the project's own binary + assets; standard FHS paths; declares
  real deps so it won't be a broken install. makepkg runs unprivileged; only the
  final `pacman -U` needs sudo (explicit, user‑consented).

### Usability
- One menu entry, in‑place `pacman` updates, correct Clavis icon — the clean Arch
  experience, no `(1)` duplicates.
