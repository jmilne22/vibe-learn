# Rebuild validation

Verified on Linux/NixOS on 2026-09-23, including a fresh source copy and `npm ci`:

- `npm run verify`: strict TypeScript, ESLint, 18 platform tests, content validation (4 projects / 38 sections), production builds, and four Playwright browser tests.
- Linux ZIP generation through Electron Forge succeeds; the Nix shell includes the required `zip` utility.
- `actionlint` accepts both workflows, documentation links resolve locally, and `git diff --check` passes. Automatic CI is one Linux job; desktop builds are manual/tag-triggered.
- Packaged Linux Electron smoke: SQLite restart, notes, bookmarks, source preservation, clipboard, validated IPC, workspace UI execution, reading-position retention through navigation/restart, and saved appearance.
- Packaged Go test runs with an empty host tool PATH and module downloads disabled.
- Relay/TSDB public-interface fixture servers, deliberate contract failures, missing tools, empty tests, source changes, cancellation, timeouts and interrupted-run recovery.
- Browser preview with external network blocked, keyboard skip navigation, narrow layout, independent course/project access.
- ASAR inspection confirms only compiled app bundles, package metadata and runtime dependencies are included.
- Development launch through the included Nix shell (system-compatible Electron and SQLite libraries).
- Course activity tests: real Go/Rust checks, preserved source and locally edited checks, independent fresh copies, empty-test rejection, review scheduling/version resets/duplicate protection, backup merge, and restart persistence.
- Extended development Electron smoke: prepare an exercise, observe failure, edit learner code, observe success, reveal hints, browse/review cards, export review state and restart. Screenshots are in `build/screenshots/desktop-exercise.png`, `desktop-flashcard-browse.png`, and `desktop-flashcard-review.png`. The temporary fixture course is not shipped.
- `npm audit --omit=dev` reports no runtime advisories after compatible updates. Forge's development/packaging dependency tree still reports upstream advisories (including archive tooling); no forced Forge downgrade was applied.

The generic packaged Electron executable required local ELF loader/library adjustments to launch on NixOS. Those changes affect only the temporary unpacked executable, after ZIP creation; the generated ZIP is unchanged. The smoke script asserts `app.isPackaged`, uses an empty host PATH, and verifies bundled offline Go execution. General Linux distribution should use the standard Ubuntu CI artifact.

Not verified on this host: macOS/Windows execution and signing, or a live Maelstrom run (Java/Graphviz/gnuplot are not installed). The manual/release-tag workflow packages and smoke-tests all three OSes; ordinary PRs run a single Linux verification job. Maelstrom argument construction and report verdict handling are covered by platform tests; its live integration still needs an installed harness. No Kubernetes automated evaluation is intended or included.
