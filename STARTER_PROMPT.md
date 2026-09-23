# Create a Vibe Learn course

Ask what topic, existing experience and practical goal the learner has. Then create a course with `npm run new-course -- <slug>` and follow `docs/authoring.md`.

Author Markdown explanations with concrete examples, optional exercises, immediately available hints and solutions. Use stable module IDs, short named sections and YAML manifests. Keep platform code separate from course content. Reference concepts from project briefs through optional links. State genuine tool or project prerequisites, never completion gates.

Learners write implementations and their own tests in external workspaces. Include commands and expected observations where helpful. For courses, author small prepared Go or Rust exercises with focused supplied tests using `content/exercises.yaml` and the schema in `docs/authoring.md`. Project acceptance suites remain optional and separate. Optionally author concise explanatory flashcards in `content/flashcards.yaml`; browsing and spaced reviews are voluntary. Do not create daily sessions, scores, difficulty modes, forced reflection forms, timers, or unlock rules.

Do not modify runtime code merely to add course content. Validate with `npm run validate:content` and inspect the read-only preview. Preserve existing IDs and filenames when updating a course.
