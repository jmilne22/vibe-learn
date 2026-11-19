# Architecture

Vibe Learn has three small layers and zero native dependencies:

1. **Agent Skill (`skills/vibe-learn/`):** Installed directly from GitHub (`npx skills add jmilne22/vibe-learn`). Teaches coding agents (Claude Code, Codex, Gemini CLI, OpenCode, Zed) how to design running-first STE100 learning projects (`references/design-project.md`) and mentor across sessions (`references/mentor-protocol.md`) using `MENTOR-NOTES.md`, `NOTES.md`, and `~/.vibe-learn/profile.md`.
2. **Workspace Engine & Local CLI (`src/workspace/`, `src/cli/`):**
   - `src/workspace/generator.ts` is pure, browser-safe TypeScript that builds `README.md`, `steps/NN-*.md`, `NOTES.md`, `MENTOR-NOTES.md`, `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `.claude/settings.local.json`, and validated root-level support files.
   - `src/workspace/fs.ts` writes files exclusively (`flag: "wx"`) so existing learner files, symlinks, and Taskfiles are never overwritten.
   - `src/workspace/validate.ts` checks workspace files, contiguous step numbering, Glossary presence, folded hints, AI mentor prompts, and STE prose rules.
   - `src/cli/index.ts` is a local helper CLI (`npm run cli -- ...`, bundled to `build/cli/index.js`) for repo checkout and authoring workflows. `package.json` stays `"private": true`.
3. **Content Compiler & Static Web App (`src/content/`, `src/renderer/`):**
   - `src/content/compile.ts` compiles curated projects under `content/projects/` (HTML briefs and Markdown project folders) into `build/content/catalog.json` (format version 3).
   - Local SVG/PNG/JPEG diagrams are embedded as data URIs with path and symlink confinement checks. `stage.markdown` is precomputed at build time via `src/content/markdown-out.ts` so the browser never bundles an HTML parser.
   - `src/renderer/` is a static React/Vite app deployed to GitHub Pages (`vibe-learn.ai`) with a single top bar (`Projects`, `New`, `Data`, theme icon), minimal landing page, `/new` prompt builder, inline `Workspace` and `Notes` panels, and browser `localStorage` persistence with JSON backup/import and Markdown export.
   - `src/renderer/zip.ts` packages `WorkspaceFile[]` into an uncompressed `.zip` archive directly in the browser.

## Boundaries

ESLint enforces that `src/renderer/` never imports `node:*`, `src/cli/`, `src/content/`, `src/workspace/fs.ts`, or `src/workspace/validate.ts`.

## Verification

`npm run verify` runs:
- Strict TypeScript (`tsc --noEmit`)
- ESLint including browser boundary rules
- Content validation (`src/content/compile.ts --check`)
- Vitest suite: content integrity, Admission Lab Go code and `doctor.go` tests, support-file validation, workspace generation and validation, ZIP format, and CLI commands
- Production builds (`build/content/catalog.json`, `dist/`, `build/cli/index.js`)
- Playwright browser tests against the built static site (landing page, projects list, `/new` prompt builder, inline `Workspace` `.zip` download and `Notes` panel, `localStorage` persistence, offline reading, narrow viewports, and reduced-motion SVG animations)
