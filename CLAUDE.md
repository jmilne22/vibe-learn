# vibe-learn

Static course platform. Courses are YAML + Markdown content compiled
to static HTML by `node build.js`. No framework, no backend.

## Commands
- `npm install`
- `npm run build` — build all courses
- `node build.js <slug>` — build a single course
- `npm run new-course -- <slug>` — scaffold an empty course

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
