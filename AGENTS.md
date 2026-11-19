# Vibe Learn

Lightweight AI coding mentor skill (`skills/vibe-learn/`), browser-safe workspace generator, local helper CLI, and static web reader (`vibe-learn.ai`) built with strict TypeScript, React, Vite, and Zod. Read `README.md` and `docs/architecture.md` for the v3 design.

## Commands
- `npm run dev` — compile catalog and start Vite dev server
- `npm run build` — compile catalog, static web app (`dist/`), and local CLI bundle (`build/cli/index.js`)
- `npm run verify` — type checks, lint, content validation, Vitest tests, production builds, and Playwright browser tests
- `npm run cli -- <args>` — run the local helper CLI from source with `tsx`
- On NixOS, enter `nix-shell` before running npm commands.

## Boundaries
- `skills/vibe-learn/` owns the agent skill instructions for on-demand project generation and cross-session mentoring (installed via `npx skills add jmilne22/vibe-learn`).
- `src/workspace/generator.ts` is strictly browser-safe (no `node:*` imports) so the local CLI and browser `.zip` exporter produce identical workspace files.
- `src/renderer/` owns the static web UI only; ESLint blocks `node:*`, `src/cli/`, `src/content/`, `src/workspace/fs.ts`, and `src/workspace/validate.ts` imports.
- `src/cli/` owns the local Node CLI commands. `package.json` stays `"private": true`.
- `src/content/` compiles curated projects (HTML briefs or Markdown project folders under `content/projects/`) into `build/content/catalog.json`.

## Product
Learners work in their own editor and terminal alongside their coding agent. Reading is never gated. Workspaces remain learner-owned, and generated files never overwrite existing learner files.

For authoring or promoting a project track, read `STARTER_PROMPT.md` and `docs/authoring.md`. Keep stable project IDs and step filenames.
