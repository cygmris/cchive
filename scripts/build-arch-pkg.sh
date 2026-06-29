#!/usr/bin/env bash
# Build a native Arch package (.pkg.tar.zst) for Clavis from the release binary.
#
#   bash scripts/build-arch-pkg.sh
#   sudo pacman -U packaging/arch/clavis-*.pkg.tar.zst
#
# Updates later = rebuild the new version + `pacman -U` the new package; pacman
# replaces it in place by the `clavis` name (one menu entry, never a "(1)").
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
bin="$root/src-tauri/target/release/clavis"

if [[ ! -f "$bin" ]]; then
  echo "Release binary missing — building it (pnpm tauri build)…"
  (cd "$root" && pnpm tauri build --bundles deb)
fi

echo "Running makepkg…"
( cd "$root/packaging/arch" && makepkg -f )

pkg="$(ls -t "$root"/packaging/arch/clavis-*.pkg.tar.zst 2>/dev/null | head -1)"
echo
echo "Built: $pkg"
echo "Install / update:  sudo pacman -U \"$pkg\""
