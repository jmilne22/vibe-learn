# Desktop packaging

Use Node 24+, npm, Go and native build prerequisites for better-sqlite3 (Python and C/C++ tooling). Linux/macOS ZIP packaging also needs the `zip` command (included in `shell.nix`). Build on the target operating system and architecture.

`npm run package:desktop` compiles the catalog, Electron main/preload/renderer and static website, prepares the current Go toolchain, then runs Electron Forge. `npm run make:desktop` produces Windows Squirrel, macOS DMG/ZIP, or Linux ZIP artifacts. Output is in `out/`.

The ASAR contains only application bundles and production dependencies; better-sqlite3's native module is unpacked. `resources/learning` contains the catalog and Go toolchain (including its license). No user database, workspace, run artifact, old daemon or sync worker is bundled. Go caches and run artifacts live in the writable profile, never application resources. The bundling step makes copied toolchain files writable in its staging area, including toolchains sourced from read-only package stores.

The app uses native window chrome. The default profile is `Vibe Learn 2`, development uses `Vibe Learn 2 Dev`, and `VIBE_USER_DATA_DIR` is available for tests. Both profiles are separate from the previous application. No local HTTP port is used in production.

Basic standard-library Go exercises can execute offline. Third-party modules need cached/vendored assets or an online dependency download. Race tests require a supported C compiler. Rust/Cargo, Java, Maelstrom, Graphviz, gnuplot, containers, Kubernetes and Helm are not bundled. Missing dependencies are reported rather than installed.

Run `npm run verify` before packaging, then `npm run smoke:desktop -- --packaged`. On headless Linux, prefix the smoke command with `xvfb-run -a`. The smoke test removes host tools from PATH and disables module downloads to prove that packaged Go works on a clean fixture.

The manual/release-tag workflow packages and smoke-tests on Linux, macOS and Windows. Ordinary PRs run one Linux verification job; see [CI and releases](ci.md). The checked-in workflow produces **unsigned** installers.

For signed macOS builds, install a Developer ID Application identity in the build machine’s keychain, set `APPLE_SIGNING_ENABLED=1`, and provide `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, and `APPLE_TEAM_ID` to the packaging process for notarization. For Windows, provide `WINDOWS_CERTIFICATE_FILE` (a real certificate file on the build machine) and `WINDOWS_CERTIFICATE_PASSWORD`. These variables are read by `forge.config.js`; adding repository secrets alone does not import certificates or pass them to CI. That signing setup is not included or tested here. See Forge’s [macOS](https://www.electronforge.io/guides/code-signing/code-signing-macos) and [Windows](https://www.electronforge.io/guides/code-signing/code-signing-windows) instructions.

Local successful packaging is not evidence that another OS build or signing succeeded.

On NixOS, generic downloaded Electron binaries need an FHS runtime or adjusted ELF loader/library paths. Local smoke tests can use `ELECTRON_PATH` for development; testing a packaged app must launch that package's executable. Such host-specific adjustments must not be included in a general Linux release artifact. Prefer the Ubuntu CI artifact for general distribution.

`ELECTRON_PATH` selects the development smoke runtime only. Packaged smoke resolves the executable inside `out/` and asserts that Electron is running a packaged app; `VIBE_PACKAGED_EXECUTABLE` can point to a custom packaged location.
