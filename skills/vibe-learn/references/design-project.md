# Designing a Vibe Learn Project

Follow this blueprint whenever the learner asks to learn how to build something. The goal is a concrete, running-first, STE100-clear project workspace — never a textbook essay or a vague list of chores.

## 1. Read the learner profile first

Check if `~/.vibe-learn/profile.md` exists. If it does, read it silently before asking intake questions so you do not ask things the learner already told you (language background, analogy preferences, editor setup, pacing).

## 2. Short intake (at most 4 concrete questions)

Ask only what is missing from the prompt and profile. Keep it short — one message:
1. **Target artifact:** What exact working thing should run on your machine at the end? (Optionally share an article URL, repo, or role description.)
2. **Language & stack:** What language are you building it in, and what language do you already know well (for analogies)?
3. **Time budget:** Roughly how much time do you want to spend (for example: 2-hour sprint, weekend build, or 2-day interview prep)?
4. **Assistant mode:** **Mentor** (hints only, you write every line of code) or **Pair** (small reviewed edits together)?

Wait for the learner's answers before generating files.

## 3. Running-first step architecture

Learners lose momentum when nothing is running. Design every project around fast, observable feedback:

- **`README.md` (Step 01 — Overview):**
  - Clear 2-sentence description of what the learner builds.
  - Step table with realistic time budgets and the concrete evidence produced at each step (budgets help planning; they are not timers or scores).
  - **Glossary:** Define every domain term with **one meaning only**. Explicitly separate overloaded words (for example: JSON Patch `"value"` vs. label value, or `delete` vs. `remove`).
  - **Source map:** Short curated list of official documentation links (never "read all of the docs").
  - **Quick start:** Exact commands to check tools and begin.
- **`steps/02-setup-and-skeleton.md` (Something running within ~30 minutes):**
  - **No multi-hour theory-only wall at the start.** If there is a required article or spec, cap reading at 20–30 minutes and pair it immediately with a tiny live command or experiment.
  - Include a read-only `doctor` script or command (`doctor.go` with `//go:build ignore`, `doctor.py`, or shell check) plus an optional `Taskfile.yml` when the stack has multiple tools. The doctor installs nothing and modifies no files.
  - End this step with the smallest runnable skeleton the learner can invoke (`curl`, `pytest`, `go test`, CLI output, running container).
- **`steps/03-..md` (Incremental build steps):**
  - Each step adds **one** observable capability.
  - **Prevent blank-screen freeze:** Split each non-trivial step into 2–4 named **sub-pieces** (for example: 1. pure core function, 2. unit tests for it, 3. wire into CLI/HTTP handler, 4. end-to-end test + logging).
  - Include **concrete before-and-after examples** (exact JSON, table, CLI output, or state transitions — never abstract prose alone).
  - Include **"Tests to write"**: specific test cases the learner writes themselves, with concrete inputs and expected outputs.
  - Put hints and optional reference solutions inside folded `<details><summary>...</summary>...</details>` blocks so the mentor never spoils them unprompted.
  - End every step with a tailored **`### AI mentor prompt`** blockquote telling the mentor what to check and ask on that specific step.
- **Final build step — Fault / Break-it drills (recommended for projects > 3 hours):**
  - Give 3–6 realistic failures to intentionally cause, observe in logs/tools, diagnose, and repair.
  - Say up front whether a stage is **find-only** or **fix-and-verify**.

## 4. Writing rules (ASD-STE100 discipline)

Write every step so neither a learner nor an AI mentor can misparse it:
- **Procedures (actions the learner takes):** imperative mood, one instruction per sentence, 20 words or fewer.
- **Explanations:** active voice, simple tenses, 25 words or fewer per sentence. No semicolons. No soft phrasal verbs (`spin up`, `dive into`, `kick off`).
- **One word, one meaning:** Stick strictly to the `README.md` Glossary. Never rotate synonyms for the same concept, and never use `"it"` or `"this"` when two nouns could match.
- **Keep exact commands, flags, JSON contracts, and expected outputs verbatim.**

## 5. Write and verify the workspace

Create the workspace folder with these exact files directly (no external CLI is required):
- `README.md`
- `steps/02-<slug>.md`, `steps/03-<slug>.md`, ... (contiguous numbering starting at `02`, matching `README.md` and `NOTES.md`)
- `NOTES.md` (with the step checklist matching `README.md` and `steps/`)
- `MENTOR-NOTES.md` (handoff template)
- `AGENTS.md` (copied/adapted from [mentor-protocol.md](mentor-protocol.md) for Mentor or Pair mode and the project's language)
- `CLAUDE.md` (`@AGENTS.md`)
- `GEMINI.md` (`@AGENTS.md`)
- `.claude/settings.local.json` (in Mentor mode: `{"permissions":{"ask":["Edit","Write","NotebookEdit"]}}`)
- Optional supplied root helpers (`Taskfile.yml`, `doctor.go` with `//go:build ignore`, etc.) — read-only, never auto-run.

Before handing the workspace to the learner, verify:
1. Every file above exists and step filenames are contiguous (`02-...`, `03-...`).
2. `NOTES.md` checklist matches the exact step numbers and titles in `README.md` and `steps/`.
3. `README.md` has a Glossary, and every step has folded `<details>` hints and an `AI mentor prompt`.
4. If the learner happens to have a local `vibe-learn` checkout, you may also run `vibe-learn validate <workspace-dir>`.

Tell the learner which step to open first, and ask how much energy they have today.

