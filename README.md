# Vibe Learn

A desktop app for your learning material. Author courses and project briefs, work through exercises in your own editor, and keep notes and progress locally. Courses and projects can be used independently.

The desktop app stores reading positions, bookmarks, notes, and flashcard reviews in SQLite. Code and learner-written tests stay in ordinary folders opened in your own editor. Copy a project or stage's context into an external AI tool when useful; the app does not send code anywhere.

The [website](https://jmilne22.github.io/vibe-learn/) is a read-only preview with a [desktop download link](https://github.com/jmilne22/vibe-learn/releases/latest). Vibe Learn 2.0.2 adds content updates from Settings; earlier installations need an app upgrade first.

## Development

Use Node.js 24+, npm, Go, and a configured Rust toolchain (Cargo/rustc/linker) for the full platform test suite. Native SQLite builds may require Python and your platform's C/C++ build tools.

```sh
npm ci
npx playwright install chromium
npm run app
```

Development uses `Vibe Learn 2 Dev` in the OS application-data directory; packaged builds use `Vibe Learn 2`. Neither reuses the old app's profile or `practice/` folder. `VIBE_USER_DATA_DIR` overrides the profile for isolated testing.

```sh
npm run verify          # TypeScript, ESLint, content validation, unit/integration and browser tests
npm run smoke:desktop   # Real Electron: exercises, flashcards, IPC and persistence; build first
npm run package:desktop # Unpacked application with catalog, SQLite and Go
npm run smoke:desktop -- --packaged
npm run make:desktop    # Windows installer, macOS DMG/ZIP, Linux ZIP
npm run preview        # Local read-only preview
npm run new-course -- my-topic
```

Linux headless desktop testing needs an X server (`xvfb-run -a npm run smoke:desktop`). `ELECTRON_PATH` and `CHROMIUM_PATH` can select system-compatible test executables. On NixOS, enter `nix-shell` first, then run the npm commands; the included shell selects a Nix-compatible Electron and native SQLite libraries. Generic Electron downloads need an FHS environment or the Nix Electron runtime; manual and release-tag builds package on standard Linux, Windows, and macOS runners.

## What's included

- Download content updates from Settings and keep them locally for offline reading.
- Independent Courses and Projects libraries, Continue, offline search, collapsible navigation and keyboard access.
- Five standalone projects with stages, examples and resource links. The old courses and samples were removed; the Courses library is intentionally empty.
- Course framework: Go/Rust starter-file exercises with visible tests, hints, solutions and explicit runs; optional flashcard browsing and local spaced review. New courses must supply their own content.
- Optional project reference examples, per-item notes with Markdown export, bookmarks and JSON backup/import. Future courses can use the Markdown/YAML authoring framework.
- Create or attach workspaces on demand, with a minimal Go module for new Go activities. Explicit runs stream output, support cancellation and timeouts, and retain logs and artifacts.
- Ingest Relay: optional HTTP/storage checkpoints and final public-behavior checks.
- Tiny TSDB: optional HTTP/recovery/final checks, with internal design and storage invariants left to learner tests and review.
- Gossip Glomers: integration with the existing Maelstrom harness and saved reports. Install its additional tools separately.
- Cloud Resource Reporter: a GitHub API CLI project with pagination, summaries, table/JSON/CSV output, and learner-written HTTP tests.
- Relay Operator: guided experiments and expected observations. **No app-owned automated suite.**

Provided checks and learner tests are separate. A passing run records exactly what was checked, the source fingerprint, content version, suite version, and unchecked requirements. It never gates navigation or claims to verify later edits.

Packaged Go exercises use the bundled toolchain; development uses Go from PATH. Course exercises run offline and need cached dependencies. Project checks may download Go modules when online; race tests need a C compiler. Rust exercises need an externally installed Cargo/Rust toolchain and linker. Maelstrom and Kubernetes tooling are detected or described, not silently installed. Reading and saved state require no network.

## Code layout

| Directory | Responsibility |
| --- | --- |
| `src/content` | Markdown/YAML/HTML import, sanitization, link resolution, versioned catalog |
| `src/shared` | Zod models and the desktop command contract |
| `src/main` | Application services, SQLite, workspaces and task execution |
| `src/preload` | Narrow validated IPC bridge and change notifications |
| `src/renderer` | React/Router, TanStack Query, CSS Modules, Radix dialogs |
| `courses` | Course authoring sources |
| `content/projects` | Imported project source documents |
| `tests/v2` | Platform tests and acceptance-harness fixtures |

There is no localhost production daemon, automatic code watcher, general-purpose plugin system, cloud sync, integrated editor/terminal/AI chat, or productivity/scoring machinery.

## Content and CI

Content is authored in the repository, bundled with the app, and published through GitHub Pages. Use **Settings & backups → Update content** to download the latest catalog. There is no arbitrary course-package importer. Start with `npm run new-course -- my-topic`, then follow [authoring](docs/authoring.md). JSON import in Settings restores saved app data, not content packages. The public landing page describes the platform; the linked preview reads the bundled catalog.

Automatic CI runs one Linux verification job. Main-branch pushes deploy the website after it passes. Installer builds run only manually or for release tags. See [CI and releases](docs/ci.md).

More: [architecture](docs/architecture.md), [backups](docs/backups.md), [desktop packaging](docs/desktop-packaging.md), and [validation results](docs/validation.md).
