# CI and Deployment

`.github/workflows/verify.yml` runs a single Linux job on pull requests and pushes to `main`:

1. Installs Node 24 and Go.
2. Runs `npm ci` and installs Playwright Chromium.
3. Runs `npm run verify` (typecheck, lint, content validation, Vitest suite, web and CLI builds, and Playwright browser tests).
4. On pushes to `main`, deploys `dist/` to GitHub Pages (`vibe-learn.ai`).

The `skills/vibe-learn/` agent skill is served directly from `main` via `npx skills add jmilne22/vibe-learn` — no package publishing or release workflow is required.
