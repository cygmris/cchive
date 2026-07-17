#!/usr/bin/env bash
# Build a native Arch package (.pkg.tar.zst) for cchive from the release binary.
#
#   bash scripts/build-arch-pkg.sh
#   sudo pacman -U packaging/arch/cchive-*.pkg.tar.zst
#
# Updates later = rebuild the new version + `pacman -U` the new package; pacman
# replaces it in place by the `cchive` name (one menu entry, never a "(1)").
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
bin="$root/src-tauri/target/release/cchive"

# ALWAYS rebuild — never trust an existing binary. It is a snapshot of whatever
# was last built: an older commit, or the leftover of a build that then failed.
# Packaging that yields a package whose VERSION is new and whose CODE is old —
# on install, indistinguishable from "the fix didn't work". The build is
# incremental (seconds when nothing changed), and `set -e` stops here on failure
# so a failed build can no longer reach makepkg.
echo "Building the release (incremental)…"
( cd "$root" && pnpm tauri build --bundles deb )

echo "Running makepkg…"
( cd "$root/packaging/arch" && makepkg -f )

pkg="$(ls -t "$root"/packaging/arch/cchive-*.pkg.tar.zst 2>/dev/null | head -1)"
[[ -f "$pkg" ]] || { echo "ERROR: makepkg produced no package" >&2; exit 1; }

# Prove the package carries the binary just built — the only check that catches
# a stale-snapshot package before it reaches pacman.
built_sum="$(sha256sum "$bin" | cut -d' ' -f1)"
pkg_sum="$(tar -xOf "$pkg" usr/bin/cchive | sha256sum | cut -d' ' -f1)"
if [[ "$built_sum" != "$pkg_sum" ]]; then
  echo "ERROR: $pkg does not carry the binary just built — refusing to vouch for it" >&2
  echo "  built:  $built_sum" >&2
  echo "  in pkg: $pkg_sum" >&2
  exit 1
fi

echo
echo "Built: $pkg"
echo "  binary sha256: $built_sum (matches this build)"
echo "Install / update:  sudo pacman -U \"$pkg\""
echo "Then FULLY quit and relaunch cchive — an open window keeps running the old binary."
