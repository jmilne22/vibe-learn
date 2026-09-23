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

## Content updater — 23 September 2026

- `npm run verify`: types, lint, catalog validation, 28 platform tests, build, and five browser tests passed.
- Update tests cover saved/offline startup, hash failures, app/manifest incompatibility, unsupported built-in suites, unsafe exercise paths, sanitized HTML, HTTP errors, redirects, timeouts, oversized streams, concurrent requests, failed atomic replacement, and recovery from a damaged cache.
- Development and packaged Linux smoke tests passed update → new project visible → HTTP failure leaves content intact → restart with the downloaded catalog. SQLite records and learner source files were unchanged by the update. The packaged smoke also passed bundled offline Go execution.
- The packaged binary was launched through an FHS wrapper with Electron libraries on NixOS. This did not modify the release binary. Tests used a temporary profile under the home directory so it was visible inside that environment.
- The generated Pages artifact and installer both contain catalog bytes matching their manifests. Smoke tests use fixture update responses; the public update endpoint will be deployed when this change merges. Windows/macOS execution is left to the existing installer workflow.
