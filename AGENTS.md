# Vibe Learn

Offline desktop app built with strict TypeScript, React, Electron, SQLite and validated IPC. The browser is a read-only preview. Read README.md and docs/architecture.md for the current design.

## Commands
- `npm run app` — isolated desktop development app
- `npm run build` — compile content, desktop bundles and static preview
- `npm run verify` — type checks, lint, content validation and platform/browser tests
- `npm run package:desktop` — package with the local Go toolchain
- `npm run smoke:desktop -- --packaged` — packaged persistence and Go execution test
- `npm run new-course -- <slug>` — scaffold Markdown/YAML course sources
- Automatic CI is one Linux `verify` job; installers run manually or on release tags. See docs/ci.md.
- On NixOS, enter `nix-shell` before the npm commands.

## Boundaries
- `src/content/` compiles authoring sources into a versioned catalog.
- `src/renderer/` owns UI only; no filesystem, process or database imports.
- `src/main/` owns storage, workspaces, task execution and validated IPC.
- `courses/` is currently empty; old infrastructure and sample courses were removed.
- `content/projects/` contains the standalone project briefs. Optional Go experiments are a relay reference section.

## Product
Courses and projects are independent; reading is never gated. Workspaces remain learner-owned and checks run only on explicit request. The Relay Operator has guided verification and no app-owned automated suite.

Courses support focused Go/Rust starter-file exercises with explicit supplied checks, and optional flashcards with local FSRS reviews. See docs/authoring.md for schemas. Do not restore the previous daily-practice, scoring, difficulty, timer or plugin systems.

For content authoring, read STARTER_PROMPT.md and docs/authoring.md. Keep stable IDs and section filenames. Do not modify platform code merely to add lesson content.
