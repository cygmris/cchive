# Tasks Document — arch-pacman-package (S20)

> Arch-native package so installs/updates are clean (one menu entry, in-place `pacman -U`, no AppImage `(1)`). Packages the PREBUILT release binary + icons + a .desktop. No app code change. Identity Clavis/app.clavis; no predecessor strings. Each task: set `[-]`, implement, `log-implementation`, then `[x]`.

- [x] 1. PKGBUILD + clavis.desktop + build script + README
  - Files: `packaging/arch/PKGBUILD` (new), `packaging/arch/clavis.desktop` (new), `scripts/build-arch-pkg.sh` (new), `README.md` (modify)
  - Purpose: the packaging recipe
  - _Leverage: src-tauri/target/release/clavis + src-tauri/icons, S14 packaging README_
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 3.1_
  - _Prompt: (implemented directly by the orchestrator) Author packaging/arch/PKGBUILD: pkgname=clavis, pkgver=0.1.0, pkgrel=1, arch=(x86_64), license=(MIT), a url + calm pkgdesc, depends=(webkit2gtk-4.1 gtk3 libayatana-appindicator), options=(!strip), source=() empty; package() installs the prebuilt binary src-tauri/target/release/clavis -> usr/bin/clavis (0755), the hicolor icons (32x32, 128x128, 128x128@2, 256/icon.png) -> usr/share/icons/hicolor/SIZE/apps/clavis.png (guard each size), and clavis.desktop -> usr/share/applications/clavis.desktop; error clearly if the release binary is missing. Author packaging/arch/clavis.desktop (Name=Clavis, Exec=clavis, Icon=clavis, Categories=Development;Utility;, StartupWMClass=Clavis). Author scripts/build-arch-pkg.sh (build release if the binary is missing, then cd packaging/arch && makepkg -f, print the pkg path + the pacman -U hint; no sudo in the script). Add a README "Arch Linux" subsection (build-arch-pkg then pacman -U; updates = rebuild + pacman -U in place; contrast vs the AppImage path-hash (1) behavior). | Restrictions: no predecessor strings; standard FHS paths; package the prebuilt binary (no rebuild in makepkg). | Success: PKGBUILD parses; files authored; fingerprint grep zero._

- [x] 2. Build + install + verify in-place update
  - Files: (verify) the produced package + the live system
  - Purpose: prove it installs cleanly and updates in place (no duplicate)
  - _Leverage: makepkg, pacman_
  - _Requirements: 2.1, 2.2, 2.3_
  - _Prompt: (implemented directly by the orchestrator, needs sudo) Run scripts/build-arch-pkg.sh (or makepkg -f) -> clavis-0.1.0-1-x86_64.pkg.tar.zst. sudo pacman -U --noconfirm it. Verify: pacman -Q clavis reports it; pacman -Ql clavis lists /usr/bin/clavis + the .desktop + icons; exactly one /usr/share/applications/clavis.desktop; /usr/bin/clavis launches the app (screenshot). Demonstrate in-place update: bump pkgrel to 2, makepkg -f, sudo pacman -U the new one, confirm pacman still shows ONE clavis (no second entry). Report each result. | Restrictions: only the explicit pacman -U needs sudo; leave the package installed (the user wanted it) unless it fails. | Success: installed, one entry, launches, in-place update proven._
