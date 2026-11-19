# Vibe Learn

Vibe Learn creates step-by-step project workspaces for your editor, terminal, and coding agent (Claude Code, Codex, Gemini CLI, OpenCode, or Zed).

Install the skill from GitHub to generate a project for anything you want to build, or download one of the curated projects on [vibe-learn.ai](https://vibe-learn.ai/) as a `.zip`.

## Quick start

```sh
# Install the skill directly from GitHub
npx skills add jmilne22/vibe-learn
```

Then open an empty folder in your coding agent and tell it what you want to learn to build.

Once you have working code in a git repo, say **"break my code"** to run a fault-injection drill: the agent forks a disposable git branch (using `skills/vibe-learn/scripts/drill.mjs`), injects one realistic compiling bug, seals it so `git diff` stays clean, mentors you through diagnosing and fixing it, and restores your original branch afterward.

If you want cross-project mentor preferences, create `~/.vibe-learn/profile.md` from [skills/vibe-learn/references/learner-profile-template.md](skills/vibe-learn/references/learner-profile-template.md).

## Workspace files

Each project workspace is an ordinary folder:

- `README.md` — overview, Glossary (one meaning per term), source map, and step index.
- `steps/NN-*.md` — running-first steps split into small sub-pieces with before/after examples, tests to write, folded `<details>` hints, and an AI mentor prompt.
- `NOTES.md` — your own log and step checklist.
- `MENTOR-NOTES.md` — the assistant's handoff log between sessions (what clicked, weak spots to revisit, analogies that worked, next step).
- `AGENTS.md`, `CLAUDE.md`, `GEMINI.md` — mentor or pair instructions for coding agents.
- `.claude/settings.local.json` (Mentor mode) — asks for approval before edits so project code stays yours while allowing agreed updates to `NOTES.md` and `MENTOR-NOTES.md`.
- Optional read-only helpers such as `Taskfile.yml` and `doctor.go`.

## Curated projects

- **Ingest Relay** — HTTP event ingest, bounded queues, batching, and graceful draining in Go (plus optional Go warm-up experiments).
- **Relay Operator** — containerize the relay and build a Kubernetes operator.
- **Gossip Glomers** — distributed systems challenges with Fly.io's Maelstrom harness.
- **Tiny TSDB** — time-series storage engine with HTTP API, WAL recovery, chunks, and retention.
- **Cloud Resource Reporter** — GitHub API CLI with Link-header pagination, summaries, and table/JSON/CSV output.
- **Kubernetes Admission Lab** — Go mutating webhook on `k3d` with offline diagrams, `doctor.go`, and nine failure drills.

## Local development & repo CLI

Requires Node.js 24+ (and Go for the Admission Lab Go content tests). On NixOS, enter `nix-shell` first.

```sh
npm ci
npx playwright install chromium
npm run dev       # compile catalog + Vite dev server
npm run verify    # typecheck, lint, content validation, tests, builds, Playwright tests
npm run preview   # preview the built static site locally
```

From a local checkout, you can also run the helper CLI directly:

```sh
npm run cli -- list
npm run cli -- init kubernetes-admission-lab ./work --mode mentor
npm run cli -- new my-project ./work --lang go --mode mentor
npm run cli -- mentor ./existing-repo --lang python
npm run cli -- validate ./work/my-project
npm run cli -- profile --init
```

## Code layout

| Directory | Responsibility |
| --- | --- |
| `skills/vibe-learn` | Agent skill for designing projects and mentoring across sessions |
| `src/shared` | Zod models for projects, catalog, and browser state |
| `src/workspace` | Browser-safe workspace generator, Node filesystem helpers, and workspace validator |
| `src/cli` | Local helper CLI (`list`, `init`, `new`, `mentor`, `validate`, `profile`, `install-skill`) |
| `src/content` | Compiles HTML and Markdown projects into `build/content/catalog.json` |
| `src/renderer` | Static web app (`vibe-learn.ai`): reader, `/new` prompt builder, `.zip` exporter, `localStorage` state |
| `content/projects` | Curated project briefs and SVG illustrations |
| `tests/v2` | Content, workspace, CLI, ZIP, and Playwright browser tests |

More: [architecture](docs/architecture.md), [authoring](docs/authoring.md), [CI](docs/ci.md), and [validation](docs/validation.md).
