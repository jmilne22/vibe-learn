# vibe-learn

Static course platform. Courses are YAML + Markdown content compiled
to static HTML by `node build.js`. No framework, no backend.

## Commands
- `npm install`
- `npm run build` — build all courses
- `node build.js <slug>` — build a single course
- `npm run new-course -- <slug>` — scaffold an empty course
- `npm run practice` — generate local Go test workspaces in `practice/`
- `npm run app` — prepare clean desktop assets and start the isolated development app. It uses port 4712 plus separate app data and `Documents/Vibe Learn Dev/`; it never uses the repo's ignored `practice/`.
- `npm run package:desktop` — build a self-contained platform app with bundled course assets, clean exercise seed, vendored Go modules, and the local Go toolchain.
- `npm run make:desktop` — create the current OS installer via Electron Forge.
- `node vibe.js watch` — local daemon (127.0.0.1:4711) that serves `dist/` and relays `vibe check` results to course pages
- `node vibe.js check <dir>` — run go vet + `go test -race` on one practice exercise; result is recorded and graded objectively
- `node vibe.js next` — print the exercise the course page queued up

## Learning model
- Scheduling is FSRS (stability/difficulty/predicted recall) in `engine/js/srs.js`; legacy SM-2 entries migrate lazily. Dashboard is session-first: one computed session (pretest → learn → review → build), memory panel, mastery map.
- Exercises with go-test workspaces render as local-first cards in daily practice when `vibe watch` is up: no code input in the browser; the test run replaces self-rating (`engine/js/vibe-bridge.js`).

## Creating a Course
Read STARTER_PROMPT.md — it contains the complete generation prompt
with all schemas. Ask the user what topic they want, then follow
the prompt's instructions.

## Architecture
- `engine/` — platform code (templates, JS, CSS, plugins). Don't modify for content.
- `courses/<slug>/` — one directory per course
- `build.js` — entire build system

## Conventions
- Course manifests: `course.yaml` (not JSON)
- Module IDs: array index by default, only `title` required
- Exercise files: `content/exercises/module{id}-variants.yaml`
- Lesson files: `content/lessons/module{id}.md` (single page) or `content/lessons/module{id}/` (split into sections)
- Flashcards: `content/flashcards/flashcards.yaml` (keys are module IDs as strings)

## Section Splitting
A module's content can be a single `.md` file or a directory of numbered `.md` files.
The filesystem is the structure — no config flag needed.

- **Single file** (`module{id}.md`) → one HTML page (unchanged behavior)
- **Directory** (`module{id}/`) → one HTML page per section file, plus auto-generated exercises page

### Directory convention
```
content/lessons/module1/
  01-your-first-go-program.md    → module1-1.html  (Section 1.1)
  02-variables-and-types.md      → module1-2.html  (Section 1.2)
  03-type-conversion.md          → module1-3.html  (Section 1.3)
```

- Files sorted by name (numeric prefix controls order)
- Each `.md` file starts with an H2 heading (used as page title, stripped from body)
- Inline exercise divs go at the bottom of each section file
- Exercises page (`module{id}-exercises.html`) is auto-generated for modules with `hasExercises: true`
- Summary content goes at the end of the last section file
- Splitting helper: `node split-modules.js <slug>` auto-splits all modules (except module 0)

## Inline Exercises
Lesson authors can interleave practice after each concept section:

```html
<div class="inline-exercises" data-concept="Slice Operations"></div>
```

- `data-concept` matches the `concept` field on warmups in the exercise YAML
- Engine renders all matching warmup variants as separate cards with a shuffle button
- On wide screens (>= 1400px), inline exercises show a two-column split with a sticky reference pane
- Bottom warmups section is hidden when all concepts are covered inline
- Modules without inline divs work unchanged
- Bottom `warmups-container` and `challenges-container` divs should still be present

## Don't
- Modify `engine/` to add course content
- Add a backend or external API calls
- Use `course.json` (use `course.yaml`)
