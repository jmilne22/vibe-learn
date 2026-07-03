## How This Course Works

This course has one rule that overrides everything else: **the projects are the course**. The five projects are not rewards for finishing modules — they're the spine, and the modules exist to unblock them. You're done with this course when five real tools live in five real repos, not when you've read thirteen modules or cleared an exercise count.

### The loop

**Every module from 1 through 9 ends with a Build section** — a project milestone that is the module's real final exam. Module 1 ends with your linter reading its first file; Module 4 ends with you shipping it. The projects aren't waiting at the end of the course; they're threaded through it, one milestone per module, and each milestone is deliberately doable with only the modules behind it.

Each work session runs the same loop:

1. **Open your current Build section** (the last page of the module you're in, or the next one you haven't done).
2. **Attempt it.** Struggling at the right edge of your ability is the highest-value learning there is; the milestone is how you find out what you actually don't know yet.
3. **When you're blocked, read the lesson section that unblocks you.** Not the whole module — the section. The lessons are written to be raided, not marched through.
4. **Do 2–3 exercises for that concept**, then get back to the milestone. Exercises are reps for a specific weakness, not a curriculum.

The project pages (P1–P5 in the sidebar) are the **full specs of the finished tools** — they sit at each project's ship point and become your assignment in the final milestone.

### Exercises: warmups, challenges, and the local workspace

Each module has a **lesson**, **warmups**, and **challenges**:

- **Warmups** are quick one-concept drills. If a warmup feels hard, the gap is in the lesson — go re-read that section.
- **Challenges** are multi-step problems with difficulty modes (Easy / Progressive / Balanced / Hard / Mixed). Progressive is the right default for a first pass.

**From Module 4 onward, challenges are done in your real editor and terminal.** One-time setup: clone the course repo and run

```bash
npm run practice
```

This generates a `practice/` directory with one folder per challenge variant — each contains `exercise.go` (a stub) and `exercise_test.go` (a real test). Every challenge card on the site shows its folder. The flow:

```bash
cd practice/module4/challenge_1_v1
# write your code in exercise.go
go test            # modules 6-9: go test -race
```

**A passing test is the definition of done.** Not "looks right," not "I'd have written that" — green. Self-ratings still matter for review scheduling, but the test is the ground truth under them. (First run needs network once, to download the YAML dependency.)

Modules 1–3 stay eyeball-verified on purpose: you don't know testing yet. Module 3 changes that — it's where `go test` enters your life and never leaves.

### Variants: the shuffle and the two-variant rule

Every exercise has multiple variants — shuffle freely to get fresh versions of a concept, and use **Get Easier Version** / **Get Harder Version** to step difficulty. Stepping down when you're stuck is scaffolding; it's how the course is meant to work.

But there's a limit: **two easier variants, max.** If you've stepped down twice and you're still stuck, more variants will not fix it — the gap is upstream, in the lesson. Go read the section, then come back. (Ask how a course ends up with 154 variants in Module 1 sometime.)

### Self-rating, self-explanation, and calibration

After viewing a solution, you'll be asked one question before you can rate: **why does this solution work?** One or two sentences, in your own words. This isn't busywork — generating the explanation is one of the strongest effects in the learning research, and it's the difference between recognizing a solution and owning it. Then rate yourself honestly — *Got it*, *Struggled*, or *Needed solution*. Ratings drive spaced repetition; **Daily Practice** pulls exercises that are due for review. Use it as a 10-minute warmup before a build session, never as the session itself.

Test-backed challenges (modules 4+) also ask you to **predict before you run**: will your code pass `go test`? Answer, run it, record what happened. Over time the card shows your hit rate — "when confident: 8/12 pass" — which is feedback on your *judgment*, not just your code. Bad calibration is how you end up grinding 154 variants of something you already know, or shipping something you never tested. Watch that number.

The thinking timer (locks hints and solutions for 45 seconds) is worth keeping on — the point of an exercise is the struggle, not the answer.

### Working with AI

One rule: **AI explains concepts and reviews code you wrote — it never writes milestone or exercise code.** The research on AI assistants for learners is consistent: solutions-on-demand inflate confidence while measurably eroding debugging skill. Ask "why does my goroutine leak here?" all day. Never ask "write the worker pool."

### The map

- **Track 1 (Modules 1–3):** Go fundamentals, driven by Config Linter milestones 1–3.
- **Tracks 2–3 (Modules 4–7):** Ship the Config Linter, then build and ship the Cloud Reporter. This is the heart of "CLI tools and services."
- **Track 4 (Modules 8–11):** The steep ramp — HTTP servers, then the DNS server project, then containers and Kubernetes. Two things are safe to skip or defer:
  - **Module 10 (Containers)** is fully independent — Module 11 doesn't need it.
  - **Difficulty-3 challenges** everywhere are depth, not gates.
- **Track 5 (Modules 12–13) is optional.** Algorithm patterns are interview prep, not tool-building; open source contribution is a great epilogue. Neither counts toward done.

### When you're stuck

- **Warmups hard?** The gap is in the lesson. Re-read.
- **Challenge hard?** Two easier variants, then the lesson.
- **Milestone hard?** That's normal and correct — it's supposed to be slightly ahead of you. Find the smallest piece you can't do and work on exactly that.
- **A whole module feels too hard?** Check the map above for what's skippable, do the milestone with what you have, and come back.

Five repos. That's the finish line.

---
