# Validation Log

## v3 Refocus & Ground-Up Web Redesign — 19 November 2026

- Removed Electron, Electron Forge, `better-sqlite3`, `ts-fsrs`, OTA app/content updaters, unused course/flashcard subsystems, desktop smoke/packaging scripts, and `.github/workflows/desktop.yml`. `package.json` stays `"private": true` (263 packages audited, 0 vulnerabilities).
- Added the installable agent skill pack under `skills/vibe-learn/` (`SKILL.md`, `references/design-project.md`, `references/mentor-protocol.md`, `references/learner-profile-template.md`), installed directly from GitHub via `npx skills add jmilne22/vibe-learn`.
- Extracted browser-safe workspace generation (`src/workspace/generator.ts`), non-destructive filesystem helpers (`src/workspace/fs.ts`), workspace validation (`src/workspace/validate.ts`), and local helper CLI (`src/cli/index.ts`, bundled to `build/cli/index.js`).
- Rebuilt `src/renderer/` from zero (`app.css`, `main.tsx`, `generate.tsx`, `zip.ts`, `api.ts`): unified top bar (`Projects`, `New`, `Data`, sun/moon theme icon), vertically centered minimal landing page with workspace tree preview, inline `Workspace` (`.zip` export) and `Notes` panels, and browser `localStorage` persistence with JSON backup/import.
- Verified with `nix-shell --run 'npm run verify'`:
  - `tsc --noEmit` and `eslint` passed.
  - `npm run validate:content`: validated 6 projects, 54 sections.
  - `npm test`: 7 Vitest suites, 43 tests passed (including Markdown folder project compilation, Admission Lab Go `gofmt`/`vet`/`test` + `doctor.go` fixtures, support-file validation, workspace generator & validator, ZIP format, and CLI commands).
  - `npm run build`: built `dist/` (4.35 KB gzipped CSS, 129.9 KB gzipped JS) and `build/cli/index.js` (204 KB).
  - `npm run test:ui`: 6/6 Playwright browser tests passed (minimal landing page, projects list, `/new` prompt builder, inline `Workspace` `.zip` download & `Notes` persistence, offline reading, `390x844` mobile layout, and Admission Lab offline SVG animations + reduced-motion fallback).
