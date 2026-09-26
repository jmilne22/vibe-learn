# Architecture and verification

The content compiler produces `build/content/catalog.json` (format version 2). Courses and projects are distinct Zod models with stable item/stage IDs, optional references, prerequisites and checks. Content hashes change when the compiled item changes. The renderer reads the package through IPC; the website reads the same package as a static file.

React components never import Node, Electron, SQLite or runner modules. ESLint enforces that boundary. The sandboxed preload exposes only `invoke(command)` and `onChange(listener)`. Main validates the sender frame, Zod command, item/stage identifiers, workspace build targets, and artifact paths. It owns file dialogs, external-folder opening, clipboard writes and persistence. Production renders through `vibe://app`, without a network server. Dev uses electron-vite's server.

SQLite's versioned schema stores notes, resume state, bookmarks, workspace associations, run summaries, exercise workspace associations, flashcard memory records and import receipts. SQL migrations back up an existing database first. A pending run becomes interrupted after an unclean restart. Imports validate before a transaction, back up the current database and merge rather than replace; conflicting notes are retained. Workspaces are never restored blindly from imported paths.

## Task execution

Only an explicit run command starts a process. One task runs at a time. Processes use argument arrays, stream output through IPC notifications, have a ten-minute deadline, and are terminated as process groups (or Windows task trees). SQLite holds a bounded output tail; the profile's `runs/<id>` directory holds the full log, result metadata and harness artifacts. Cancellation and shutdown wait for task cleanup.

Learner tests run vet followed by uncached Go tests; an empty suite is an execution error with an unchecked explanation. Ordinary checks disable cgo so the bundled toolchain does not require a system C compiler. Race tests explicitly enable it. The app does not install dependencies or rewrite source. Build errors, missing binaries, assertion failures, cancellation, timeouts and interrupted runs have separate feedback.

Acceptance binaries are built from a configurable workspace-relative target and launched with temporary data paths and a dynamically allocated loopback port. Readiness and all requests are bounded. Relay checks cover validation, routing, admission, append semantics, exported values, statistics and graceful draining. The HTTP-only checkpoint does not require the later output-file flag. Windows records graceful SIGINT verification as unchecked.

TSDB checks cover batch atomicity, equality queries, inclusive bounds, rejection, exact sample round-tripping across chunk sizes and process-restart recovery. They do not inspect the learner's WAL format or pretend to prove compression, retention, failure injection, memory bounds or power-loss durability. Those are listed as unchecked and remain in the brief's testing/review guidance. Fixtures demonstrate that public checks accept different timestamp names and a TSDB with entirely different storage internals; deliberately broken behavior fails.

Maelstrom integration uses the existing jar, workloads and per-attempt report directories. It reads the root EDN validity result without confusing nested checker results. Partition/repeated stages use the brief's configurations. Performance comparisons and race-instrumented workloads remain explicitly unchecked. Native Windows users run the documented Maelstrom commands in Linux/WSL. The operator has no executable checks at all.

Source fingerprints cover source/config files, excluding dependency/build/cache/artifact directories. They are not full hermetic dependency snapshots. Results show their original fingerprint and warn about changes during execution; they never represent a live verification of subsequent edits. Bump suite versions whenever check semantics change.

## Acceptance coverage

`npm run verify` checks strict types, UI/backend import boundaries, validated content and internal routes, transactional migrations, backup round-tripping, process failures/cancellation, actual Go tasks, harness fixtures, independent navigation, offline reading/search and keyboard/mobile usability.

`npm run smoke:desktop -- --packaged` additionally launches the real packaged executable with a temporary profile and empty tool PATH, saves notes/bookmarks, copies context, attaches a fixture workspace, creates a project workspace with step files, runs bundled Go without network module access, exports a backup and verifies persistence after restart. It also rejects invalid IPC and operator check requests. The manual/release-tag installer workflow runs this on Linux, macOS and Windows; local testing establishes only the current host's results.

## Project workspaces

**Create workspace** makes a new folder named after the project (with a numeric suffix if one exists) in the parent the learner chooses. It never reuses a folder, and removes it again if writing fails. `src/main/workspace.ts` converts each sanitised stage into Markdown (`src/content/markdown-out.ts`): the overview becomes README.md and each later stage `steps/NN-<stageId>.md`, numbered as in the sidebar, with hints kept as folded `<details>` blocks and links between stages mapped to the files. AGENTS.md (read directly or through the `@AGENTS.md` pointers in CLAUDE.md and GEMINI.md) tells an external assistant to work only on the step the learner names. Mentor mode also writes a Claude Code settings file that denies edits. Attaching writes nothing; **Add AI assistant files** creates only missing files and never overwrites or adds a Go module.

## Optional course activities

Courses add versioned exercise and flashcard arrays; projects do not. Exercise files are compiled from confined authoring directories. Main prepares unique folders, attaches existing folders without writing, and uses the shared runner for explicit Go/Rust checks. Each run copies a bounded workspace into its artifact directory, rejects symlinks, restores the provided checks there, and runs offline. It never resets learner work. Rust build output is kept in the run directory. An empty suite cannot pass. This is ordinary local code execution, not an execution sandbox.

FSRS (`ts-fsrs`) schedules local flashcard reviews. The validated review command checks card identity/version and the prior record timestamp to reject duplicate submissions. Card edits reset memory on the next review. Browse mode does not mutate scheduling. Review records merge by timestamp on backup import; imported exercise paths are not attached automatically. No navigation or project checks depend on recall ratings.

Non-packaged builds accept `VIBE_DEV_CATALOG` for an isolated authoring/test catalog. The desktop smoke uses a test-only course to exercise prepare → fail → edit → pass, review ratings, export and restart; packaged builds start from their bundled catalog and can use a verified downloaded update. Test fixtures never populate the public Courses library.

## Content updates

The content compiler also emits `updates/latest.json` and `updates/<sha256>.json`. The existing Pages deployment publishes both alongside the preview. The manifest declares the update format, minimum app version, source commit date, and catalog hash. Filenames derived from the hash prevent mixing a manifest with a different catalog during deployment; if an older file is no longer available, retry the update to fetch the current manifest.

**Settings & backups → Update content** makes the only network request for content updates. Main fetches from the fixed HTTPS Pages endpoint, refuses redirects, caps requests at 30 seconds and catalogs at 30 MB, checks the hash and compatibility, validates IDs/references/exercise paths and built-in check versions, and sanitizes HTML. Source files in exercises are data until the learner explicitly runs checks. Content updates cannot install a new runner or acceptance suite implementation.

**Settings & backups → Update app** downloads the app code (main, preload and renderer bundles) that CI publishes from `main` to `updates/app/` on Pages. The manifest is signed with an Ed25519 key held only as the `APP_UPDATE_SIGNING_KEY` Actions secret; the app ships the public key and rejects anything else. The bundle must match the signed SHA-256, contain only `main/`, `preload/` and `renderer/` files, and declare the same runtime fingerprint (Electron plus the installed packages the main process loads) as the installation, otherwise the user is told to install a new release. Files are written to `app-update/<revision>` in the profile and take effect after a restart.

The package entry is `main/bootstrap.js`. It runs the saved code only when it is signed, newer than the installed app, and for the same runtime; otherwise it runs the installed code. Downloaded code resolves packages from the installed `node_modules`. If a downloaded version does not reach a loaded window, the next start marks it failed and uses the installed version, and Settings says so. Learner data is never part of an app update.

The profile's `content/current.json` holds the verified manifest and catalog, written through a temporary file and rename before changing the active library. A successful replacement retains `previous.json`. Startup reads local files only, falls back to the previous catalog or bundled content if the cache is invalid, and prefers bundled content with a later source commit date. Failed downloads and writes leave the active catalog in place. An update cannot start during a run; runs and exercise preparation cannot start during an update.

Content updates never write SQLite records or learner workspace files. Stable identifiers keep notes, progress, bookmarks and reviews associated; records for removed content remain in backups. Existing exercise folders are not reset when checks change. JSON backups contain learner state, not the downloaded catalog cache. The content can be downloaded again after restoring a backup.
