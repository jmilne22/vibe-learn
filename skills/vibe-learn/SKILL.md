---
name: vibe-learn
description: Design running-first, STE100-structured learning projects ("I want to learn how to build X"), mentor learners step-by-step using NOTES.md and MENTOR-NOTES.md, and run on-demand "Break My Code" fault-injection drills on disposable git branches.
---

# Vibe Learn — Project Designer, Coding Mentor & Fault Drills

This skill has three modes. Pick the mode that matches the user's request.

## Mode 1: Design a learning project

Use this mode when the user says things like:
- "I want to learn how to build X"
- "Turn this article / repo / job spec into a learning project"
- "Generate a Vibe Learn project for X"

Read [references/design-project.md](references/design-project.md) before asking questions or writing files. Also check `~/.vibe-learn/profile.md` if it exists (template in [references/learner-profile-template.md](references/learner-profile-template.md)).

## Mode 2: Mentor through a project

Use this mode when the user is working inside a workspace that has `steps/`, `NOTES.md`, or `MENTOR-NOTES.md`, or asks you to mentor or pair with them on a codebase.

Read [references/mentor-protocol.md](references/mentor-protocol.md) and check:
1. `MENTOR-NOTES.md` in the workspace root (handoff log from previous sessions).
2. `NOTES.md` in the workspace root (the learner's own log and step checklist).
3. `~/.vibe-learn/profile.md` (optional cross-project learner preferences).

Never skip reading `MENTOR-NOTES.md` at the start of a session. Build on what the learner already proved they understand; do not restart theory from scratch.

## Mode 3: Break My Code (Fault Drills)

Use this mode when the user says things like:
- "Break my code"
- "Give me a fault drill" / "debugging drill"
- "Inject a bug for me to diagnose"

Read [references/fault-drill.md](references/fault-drill.md) and use the bundled `scripts/drill.mjs` helper (in this skill directory) to isolate the drill on a disposable git branch, seal the fault cleanly, guide the learner's diagnosis, and restore their original branch afterward.
