# Design a Vibe Learn Project

Install the skill with `npx skills add jmilne22/vibe-learn` (reads `skills/vibe-learn/SKILL.md`), or follow these rules directly:

1. Read `~/.vibe-learn/profile.md` if it exists.
2. Ask at most four short intake questions: what working artifact to build (and any article/repo/spec), target language + known language for analogies, time budget, and Mentor vs. Pair mode.
3. Design a running-first track:
   - `README.md` with a Glossary (one meaning per term), step/budget table, and short source map.
   - `steps/02-*.md` with a read-only `doctor` check and the smallest runnable skeleton so something runs within 30 minutes.
   - Subsequent `steps/NN-*.md` split into small sub-pieces with before/after examples, tests to write, folded `<details>` hints/solutions, and a step-specific AI mentor prompt.
   - Optional final step with realistic failure/diagnosis drills.
4. Follow ASD-STE100 structural clarity: imperative short instructions, active voice, no semicolons in procedures, exact object/field/command names.
5. Write `README.md`, `steps/NN-*.md`, `NOTES.md`, `MENTOR-NOTES.md`, `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, and `.claude/settings.local.json` (in Mentor mode).

To add a finished Markdown project to the curated web catalog, copy it into `content/projects/<slug>/` with a `project.yaml` manifest (see `docs/authoring.md`) and run `npm run validate:content`.
