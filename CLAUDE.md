# Vibe Learn development

The active v2 application is strict TypeScript with React, Electron/electron-vite, SQLite and validated IPC. Read README.md and docs/architecture.md before changing platform behavior. Content authoring is documented in STARTER_PROMPT.md and docs/authoring.md.

Run `npm run verify`. For desktop changes, build and run `npm run smoke:desktop`; validate native/runtime changes with `npm run package:desktop` and `npm run smoke:desktop -- --packaged`.

Keep filesystem, process and database access out of renderer components. No production localhost server, file-change execution, cloud sync or progression gates. Workspaces and profiles are learner-owned; never replace them. The Relay Operator uses guided verification, with no app-owned automated suite.
