# vibe-learn

Static course platform. Courses are YAML + Markdown content compiled
to static HTML by `node build.js`. No framework, no backend.

## Commands
- `npm install`
- `npm run build` — build all courses
- `node build.js <slug>` — build a single course
- `npm run new-course -- <slug>` — scaffold an empty course
- `npm run builder` — launch web-based course editor at http://localhost:3456
- `node scripts/patch-exercises.js <spec.yaml>` — bulk-patch exercise variants from a YAML spec

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
- Lesson files: `content/lessons/module{id}.md`
- Flashcards: `content/flashcards/flashcards.yaml` (keys are module IDs as strings)

## Bulk Exercise Editing
When replacing multiple exercise variants at once, use the patch script
instead of editing the YAML by hand. Write a YAML spec and run:

```
node scripts/patch-exercises.js spec.yaml
```

Spec format — only patched fields are overwritten, everything else preserved:
```yaml
file: courses/<slug>/content/exercises/module1-variants.yaml
replacements:
  - section: warmup_1
    variantId: v5
    patch:
      title: New Title
      description: New description...
      hints:
        - "hint1"
        - "hint2"
      solution: |-
        fmt.Println("hello")
```

This avoids burning tokens on repetitive YAML edits. Generate the spec,
run the script, then `node build.js <slug>` to verify.

## Don't
- Modify `engine/` to add course content
- Add a backend or external API calls
- Use `course.json` (use `course.yaml`)
