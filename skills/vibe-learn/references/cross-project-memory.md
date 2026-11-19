# Cross-Project Memory & Distillation Protocol

Carry durable learning preferences and technical progress across projects using two small local Markdown files under `~/.vibe-learn/`:

- **`~/.vibe-learn/profile.md`** (~60 lines max): How the learner learns — background languages, analogies that landed, pacing, stuck protocol, editor/OS setup. Never project-specific implementation details.
- **`~/.vibe-learn/memory.md`** (~120 lines max): Distilled technical ledger — 1-line project log, `Solid` concepts (do not re-teach from scratch), open `Weak spots to revisit`, and recurring habits/tool notes.
- **`<project>/MENTOR-NOTES.md`**: Detailed chronological session log for the active project only.

Locate `scripts/memory.mjs` inside the same `vibe-learn` skill directory as this file.

## Reading memory at session start

Run:
```sh
node <skill-dir>/scripts/memory.mjs read
```
This prints a compact session brief containing `~/.vibe-learn/profile.md`, `~/.vibe-learn/memory.md`, the next unchecked step in `NOTES.md`, and the latest two sections of local `MENTOR-NOTES.md`.

If `~/.vibe-learn/` does not exist yet or is unreadable in a restricted sandbox, degrade gracefully and continue with local workspace files only.

## When to update `~/.vibe-learn/`

Never write to `~/.vibe-learn/profile.md` or `~/.vibe-learn/memory.md` without showing the exact proposed additions/edits and getting the learner's `"yes"` first.

Offer updates in three situations:

1. **End of a project (or major milestone):**
   - Run `node <skill-dir>/scripts/memory.mjs init` (if files do not exist yet; never overwrites).
   - Run `node <skill-dir>/scripts/memory.mjs inspect MENTOR-NOTES.md`.
   - Propose **3–5 concise bullets** across `profile.md` and `memory.md` (1-line project entry, new `Solid` concepts, remaining `Weak spots`, any durable preference/analogy).
2. **Explicit import or sync (`"sync my mentor notes"`, `"import mentor notes from <path>"`):**
   - Run `node <skill-dir>/scripts/memory.mjs init`.
   - Run `node <skill-dir>/scripts/memory.mjs inspect <path/to/MENTOR-NOTES.md>`.
   - Show the exact proposed bullets for `profile.md` and `memory.md`, wait for `"yes"`, then write them cleanly.
3. **Promoting a weak spot to `Solid`:**
   - Whenever the learner proves a concept listed under `Weak spots to revisit` (in working code, tests, or a "Break My Code" fault drill), offer to move that bullet from `Weak spots to revisit` to `Solid` with a short evidence note.

## Hygiene & size limits

- Run `node <skill-dir>/scripts/memory.mjs status` periodically; if `profile.md` exceeds ~80 lines or `memory.md` exceeds ~120 lines, merge duplicates and prune resolved/redundant items instead of appending.
- Record what the learner understands and how they learn. Leave out personal remarks and do not quote expressions of frustration.
- **Optional multi-machine sync:** Because `~/.vibe-learn/` holds only plain Markdown files, learners can initialize a private git repo inside `~/.vibe-learn/` (or symlink it into their dotfiles) if they want to carry notes across machines.

