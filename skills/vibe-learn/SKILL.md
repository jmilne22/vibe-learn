---
name: vibe-learn
description: Design running-first, STE100-structured learning projects ("I want to learn how to build X"), mentor learners step-by-step with cross-project memory (~/.vibe-learn/profile.md and memory.md), and run on-demand "Break My Code" fault-injection drills on disposable git branches.
---

# Vibe Learn — Project Designer, Coding Mentor & Fault Drills

This skill has three modes plus cross-project memory sync. Pick what matches the user's request.

## Cross-project memory (`~/.vibe-learn/`)

Before starting any mode, run `node <skill-dir>/scripts/memory.mjs read` (from this skill directory) to load `~/.vibe-learn/profile.md`, `~/.vibe-learn/memory.md`, the active step in `NOTES.md`, and recent local `MENTOR-NOTES.md` sections.

When the user says things like *"sync my mentor notes"*, *"import mentor notes from `<path>`"*, or *"update my vibe-learn memory"*, read [references/cross-project-memory.md](references/cross-project-memory.md) and run `scripts/memory.mjs inspect <path>` before proposing edits.

## Mode 1: Design a learning project

Use this mode when the user says things like:
- "I want to learn how to build X"
- "Turn this article / repo / job spec into a learning project"
- "Generate a Vibe Learn project for X"

Read [references/design-project.md](references/design-project.md) before asking questions or writing files. Use `~/.vibe-learn/profile.md` and `~/.vibe-learn/memory.md` (templates in [references/learner-profile-template.md](references/learner-profile-template.md) and [references/memory-template.md](references/memory-template.md)) so you do not re-teach solid concepts or repeat intake questions.

## Mode 2: Mentor through a project

Use this mode when the user is working inside a workspace that has `steps/`, `NOTES.md`, or `MENTOR-NOTES.md`, or asks you to mentor or pair with them on a codebase.

Read [references/mentor-protocol.md](references/mentor-protocol.md) and run `node <skill-dir>/scripts/memory.mjs read` so you load:
1. `~/.vibe-learn/profile.md` and `~/.vibe-learn/memory.md` (cross-project preferences, solid concepts, and open weak spots).
2. Local `MENTOR-NOTES.md` (handoff log from previous sessions in this project).
3. Local `NOTES.md` (the learner's own log and step checklist).

Never skip reading `MENTOR-NOTES.md` at the start of a session. Build on what the learner already proved they understand; do not restart theory from scratch.

## Mode 3: Break My Code (Fault Drills)

Use this mode when the user says things like:
- "Break my code"
- "Give me a fault drill" / "debugging drill"
- "Inject a bug for me to diagnose"

Read [references/fault-drill.md](references/fault-drill.md) and use the bundled `scripts/drill.mjs` helper (in this skill directory) to isolate the drill on a disposable git branch, seal the fault cleanly, guide the learner's diagnosis, and restore their original branch afterward.
