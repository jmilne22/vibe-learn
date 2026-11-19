# Authoring Curated Projects

Learners usually generate custom tracks on demand with the `vibe-learn` skill (`npx skills add jmilne22/vibe-learn`). To include a curated project permanently on `vibe-learn.ai`, add it under `content/projects/`.

## Option 1: Markdown project folder (recommended)

Place the project at `content/projects/<slug>/` with a `project.yaml` manifest:

```yaml
title: Build a Mini Redis
description: Implement a RESP server with persistence and tests.
language: go # go | python | typescript | rust | generic
prerequisites:
  - Go 1.22+
supportFiles:
  - Taskfile.yml
  - doctor.go
```

Folder layout:
- `content/projects/<slug>/project.yaml`
- `content/projects/<slug>/README.md` (compiled as the `overview` stage)
- `content/projects/<slug>/steps/02-*.md`, `03-*.md`, ... (ordered stages)
- `content/projects/<slug>/assets/` (optional SVG/PNG/JPEG diagrams referenced as `assets/<file>`)
- Optional root support files listed in `supportFiles`

Validate from a local checkout:
```sh
npm run validate:content
npm run cli -- validate content/projects/<slug>
```

## Option 2: HTML project brief (existing 6 projects)

Existing briefs live at `content/projects/<name>.html` with `<section class="session" id="...">` blocks and diagrams under `content/projects/assets/<name>/`. Supplied helpers are marked with `<pre data-workspace-file="Taskfile.yml"><code>...</code></pre>`.

## Supplied project files

Supplied helpers must satisfy `ProjectSupportFilesSchema` in `src/shared/model.ts`:
- Non-hidden root-level filenames ending in `.py`, `.yml`, `.yaml`, `.md`, `.txt`, `.json`, `.sh`, or `.go`.
- Unique ignoring case, not colliding with generated workspace files (`README.md`, `NOTES.md`, `MENTOR-NOTES.md`, `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `go.mod`, `steps`).
- Rejects names other tools auto-run or auto-load (`conftest.py`, `setup.py`, `pyproject.toml`, `Makefile`, `package.json`, `Dockerfile`, `build.rs`, `*_test.go`, etc.).
- Every `.go` helper must start with `//go:build ignore` so `go build ./...` and `go test ./...` ignore it while `go run doctor.go` still runs it.

## Writing style (ASD-STE100)

Write project briefs about 80% of the way to ASD-STE100 Simplified Technical English:
- Procedures (steps the learner executes): imperative mood, one instruction per sentence, 20 words or fewer.
- Explanations: active voice, simple tenses, 25 words or fewer, no semicolons or soft phrasal verbs.
- Every brief has a **Glossary** giving each term one meaning, folded `<details>` hints, an **AI mentor prompt** at the end of each step, and concrete before-and-after examples.
- Diagrams follow the offline SVG rules: self-contained, finite animation ≤5s with `prefers-reduced-motion`, static counterpart paired with `motion-animated` / `motion-static`, and descriptive alt text.
