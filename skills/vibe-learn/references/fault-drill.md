# Break My Code — Fault-Injection Drill Protocol

Follow this protocol whenever the learner asks to break their code or run a debugging / fault drill. The goal is realistic, observable debugging practice against their own working codebase without risking their real branch.

Locate `scripts/drill.mjs` inside the same `vibe-learn` skill directory as this file.

## 1. Preflight & safe branch isolation

1. Read `MENTOR-NOTES.md` (if present) and `~/.vibe-learn/profile.md` (if present). Note any recorded weak spots so you can target one of them first.
2. Run:
   ```sh
   node <skill-dir>/scripts/drill.mjs start --name <short-slug>
   ```
   If the working tree is dirty or not a git repository, stop and ask the learner to commit or stash first. Never discard or stash their uncommitted work silently.
3. Run the project's test suite or health check on the clean baseline to confirm it passes before injecting anything.

## 2. Choose and inject one realistic bug

Pick **one** root cause (1–5 lines changed) in the learner's production code.

**Prioritize these real-world bug classes (starting with any weak spot in `MENTOR-NOTES.md`):**
- **Boundary / off-by-one:** `>` vs `>=`, wrong slice/window bound, inclusive vs exclusive range.
- **Protocol / serialization contract:** wrong HTTP status code, missing header, wrong JSON Patch path or unescaped `/`, overwriting a whole map instead of setting one key, decoding JSON before checking HTTP status.
- **Resource / lifecycle:** missing body close, leaked goroutine/handle, broken graceful shutdown or drain, premature context cancellation.
- **Concurrency / shared state:** missing mutex, shared slice/map mutation, race caught by `-race`, dropped select branch.
- **Error handling / fail-open:** swallowing an error, returning partial stdout on failure, silent fallback when strict failure is required.
- **Config / networking:** binding `127.0.0.1` instead of `0.0.0.0`, wrong selector/namespace, swapped flag default.

**Never inject:**
- Syntax errors, typos, missing imports, or renamed identifiers (the compiler catches those immediately).
- Edits to existing test files (break production code, not the tests).
- Multiple unrelated bugs at once.
- Unobservable bugs that still pass every test and check.

Calibrate difficulty if requested:
- **Easy:** clearly triggers an existing unit test failure.
- **Medium (default):** subtle single root cause requiring tracing a request, state transition, or edge case.
- **Hard:** race condition, partial failure, or silent wrong output (verify with `-race` or a targeted reproduction command).

## 3. Verify and seal (hide from `git diff`)

1. Confirm the project still **compiles/builds** cleanly.
2. Run the reproduction or test command and confirm it **fails with a clear, observable symptom**.
3. Seal the broken state onto the disposable branch so `git diff` is empty for the learner:
   ```sh
   node <skill-dir>/scripts/drill.mjs seal --symptom "<one-sentence observable symptom>" --verify "<exact command>"
   ```

## 4. Present the Symptom Card (zero spoilers)

Give the learner a short, incident-style brief — do **not** mention the file, function, line, or bug class:

- **Symptom:** one concrete sentence describing what is failing.
- **Reproduce:** the exact command to run.
- **Safety note:** 1 bug on a disposable branch; your original branch is untouched and `drill.mjs cleanup` restores it anytime.

Then ask one question: *"What is your first hypothesis, and what single check or log will confirm or rule it out?"*

## 5. Mentor through diagnosis

Follow [mentor-protocol.md](mentor-protocol.md):
- One question or one physical action per message. Short replies, no lectures.
- Do **not** edit the learner's code to fix the bug.
- Run read-only checks yourself (`git diff`, tests, logs) when helpful, stating why briefly first.
- Escalate hints only when the learner is stuck, one level at a time:
  1. Name the subsystem or the exact line in the failure output to inspect.
  2. Narrow to the file or function.
  3. State the invariant that is broken in plain words.
  4. Point to the exact line.

## 6. Debrief and clean up

Once the learner's fix makes the verification command pass:
1. Run `node <skill-dir>/scripts/drill.mjs reveal` to compare the injected fault against their fix.
2. Briefly note what they diagnosed well, and ask **one** takeaway question (for example: *"What test or check would catch this automatically next time?"*).
3. If the learner wrote a useful new regression test they want to keep, help them save or cherry-pick it onto their base branch before cleanup.
4. Ask before running cleanup, then run:
   ```sh
   node <skill-dir>/scripts/drill.mjs cleanup --force
   ```
   Verify their original branch is restored cleanly.
5. Offer to update `MENTOR-NOTES.md` with the drill outcome (promoting any weak spot they diagnosed cleanly).

