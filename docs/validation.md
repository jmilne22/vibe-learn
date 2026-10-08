# Rebuild validation

## Admission lab in Go, STE100 wording — 8 October 2026

- `nix-shell --run 'npm run verify'` passed: types, lint, content validation (6 items / 54 sections), 69 platform tests, production builds and 7 browser tests. `npm run smoke:desktop` passed with doctor.go as the supplied helper. Outside the Nix shell, the Rust exercise test needs a default rustup toolchain.
- The lab webhook, its tests and the helpers are Go. The content test extracts `main.go`, `main_test.go`, `baseline-main.go`, `doctor.go`, `register.go` and `workloads.go` from the HTML and runs gofmt, vet and the 9 reference tests. The Go doctor fixture covers missing tools, Docker access, an absent cluster, version skew, an old Go, node readiness and the command timeout. The real `task doctor` passed in a folder without go.mod.
- App and minimum content versions are 2.3.0, because older apps reject supplied `.go` files. A `.go` helper must start with `//go:build ignore`, and `*_test.go` names are rejected.
- The two-stage Dockerfile built a 22 MB distroless image, and a changed-source rebuild passed with `--network=none`. A disposable two-node k3d cluster (`rancher/k3s:v1.37.1-k3s1`) verified TLS serving as user 65532, registration, dry-run without persistence, mutation of all three workload kinds with the linux selector kept, placement on the agent, UPDATE, namespace isolation, slog request lines, and fault card 3 with its new shell-only `base64` command.
- Every project workspace now gets MENTOR-NOTES.md, a handoff log with a fixed format, and AGENTS.md guidance on reading it, offering updates at the end of a step, ticking NOTES.md on request and how to talk to the learner. Mentor mode now asks for approval on each edit instead of denying edits, so the notes files can be written. Verify and the desktop smoke passed again with these changes.
- The brief text was rewritten to ASD-STE100 rules (structural rules strict for procedures, hints and mentor prompts) and checked with an STE linter. It adds a glossary, one duration (9½ hours, 8½ without the optional stage) and separate labels for files the app writes and files the learner copies.

## Supplied workspace helpers — 4 October 2026

- `npm run verify` inside the repository shell passed: 58 platform tests, 7 browser tests, types, lint, catalog validation and production builds.
- Development and packaged Linux desktop smoke tests passed creation of the admission workspace with Taskfile.yml and doctor.py, restoration of a missing doctor, preservation of an edited Taskfile, and confirmation that preparing files starts no runs. The packaged smoke also passed signed app update/restart and bundled offline Go execution.
- Downloaded-catalog tests preserve helper contents and reject traversal, nested or reserved names, and case-insensitive collisions. Workspace tests also verify that existing symlink targets remain untouched.
- App and minimum content versions are 2.2.2 because the catalog now carries optional project support files. The lab's instructions and diagnostics no longer assume a distribution. macOS and Windows were not run locally.

## Kubernetes Admission Lab — 4 October 2026

- `nix-shell --run 'npm run verify'`: types, lint, content validation (6 projects / 53 sections), 55 platform tests, production builds, and 7 browser tests passed.
- The authored Python reference passed 19 pytest cases both with the local Nix Python environment and inside the pinned FastAPI container. Doctor fixtures cover missing tools, denied Docker access, absent cluster, version skew, node readiness, and bounded command timeouts; the real readiness check also passed.
- A disposable two-node k3d cluster using `rancher/k3s:v1.37.1-k3s1` verified image build/import, health requests, TLS admission, all three workload kinds, CREATE/UPDATE, preserved selectors, dry-run without persistence, and namespace isolation. All five fault cards produced the expected symptoms and recovered. Cluster restart and a changed-source image rebuild/import/deployment also succeeded.
- The browser preview passed with external requests blocked. Both animations were checked at start/middle/end and stopped; narrow layouts and reduced motion passed. An isolated development Electron profile also verified reading-first entry, image rendering, and the static motion fallback. Existing course-image behavior and downloaded-catalog sanitization remain covered.
- Workspace exports retain support code, captions, numbered explanations, and hints. The catalog remains below the existing 30 MB download limit. No app-owned Kubernetes evaluation suite was added.
- A trial build with `--network=none` invalidated the dependency RUN cache and failed to download packages. The readiness instructions use a normal cached rebuild and do not promise a fully disconnected image build. Packaged installers and other operating systems were not revalidated for this content change.

## Earlier rebuild checks

Verified on Linux/NixOS on 2026-09-23, including a fresh source copy and `npm ci`:

- `npm run verify`: strict TypeScript, ESLint, 18 platform tests, content validation (4 projects / 38 sections), production builds, and four Playwright browser tests.
- Linux ZIP generation through Electron Forge succeeds; the Nix shell includes the required `zip` utility.
- `actionlint` accepts both workflows, documentation links resolve locally, and `git diff --check` passes. Automatic CI is one Linux job; desktop builds are manual/tag-triggered.
- Packaged Linux Electron smoke: SQLite restart, notes, bookmarks, source preservation, clipboard, validated IPC, workspace UI execution, project workspace creation with step files, reading-position retention through navigation/restart, and saved appearance.
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

## Content update release check

The live GitHub Pages URL redirects to the configured `vibe-learn.ai` domain. The updater intentionally rejects redirects, so its endpoint now uses that domain directly. Verified a real download through `ContentLibrary`, catalog validation, inclusion of Cloud Resource Reporter, and reopening the saved catalog with network access disabled. Type checks, lint, and all 28 platform tests passed. The v2.0.2 release workflow was cancelled before publication; v2.0.3 contains the corrected endpoint.
