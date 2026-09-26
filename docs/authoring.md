# Content authoring

Content is authored in this repository, bundled with the application, and published to the content update channel by the existing Pages workflow. Desktop users can download the current catalog from Settings after deployment. `courses/` is intentionally empty; the bundled catalog currently contains five standalone projects.

Run `npm run new-course -- my-topic`. Edit `courses/<slug>/course.yaml` and Markdown under `content/lessons`. Run `npm run validate:content`, then `npm run build` or `npm run app`.

```yaml
course:
  name: My course
  slug: my-topic
  description: What this course helps you understand.
modules:
  - id: intro
    title: Introduction
```

Use explicit stable module IDs. A module uses `module<id>.md` or a `module<id>/` directory of numbered Markdown sections. Start each file with an H2 heading. Preserve IDs and filenames across content updates so resume and bookmarks remain usable.

Author ordinary Markdown with fenced examples, links and optional hints/solutions in HTML `details`. Illustrations in `content/assets` are embedded for offline reading. Scripts and executable HTML are sanitized out. The renderer also supports optional predict-output, gap and variation blocks; it does not load the previous exercise-variant, algorithm-plugin or challenge-plugin schemas.

Courses can include prepared-file exercises and optional flashcards using the schemas below. These features do not require restoring any retired course content.

Course-linked Markdown projects may be declared with `id`, `title`, `file` (a lesson-folder stem), optional `description` and `afterModule` for a related lesson link. Standalone project documents live in `content/projects`; the compiler maps their HTML sections into stable stages with project-specific prerequisites and checks. Created workspaces write each stage to `steps/NN-<stageId>.md`, so keep stage ids stable, put hints and answers inside `<details><summary>`, and prefer ordinary HTML (headings, paragraphs, lists, tables, `pre > code`) that converts cleanly to Markdown. Relay Operator remains guided.

## Course exercises

Add `content/exercises.yaml`. These optional exercises are distinct from project checks. Any exercise can be opened at any time; hints and solutions never lock.

````yaml
- id: slice-copy
  moduleId: intro
  title: Copy a slice
  language: go
  instructions: |
    Implement `Copy` so the result has its own backing array.
  hints:
    - Allocate a new slice before copying.
  solution: |
    ```go
    result := make([]int, len(input))
    copy(result, input)
    return result
    ```
  starter: content/exercises/slice-copy/starter
  checks: content/exercises/slice-copy/checks
````

`starter` and `checks` are course-relative directories, bundled as UTF-8 text files. Give starter files stable names. Include `go.mod` for Go, or `Cargo.toml` for Rust (`language: rust`). Checks must include Go `_test.go` files or Rust integration tests under `tests/*.rs`. Starter and check paths must not overlap, even by case. Parent paths, hidden files and symlinks are rejected. Keep exercises small and dependency-free where possible; all exercise checks run offline.

Use a deliberately incomplete implementation with a clear, useful failure. Tests should assert observable behavior and accept different valid implementations. Write focused, deterministic tests and explain what they cover. An empty suite is an execution error. The Rust runner uses `cargo test --offline`; Cargo, Rust, a linker, and any cached dependencies must be installed externally. Go uses the packaged toolchain with cgo disabled.

**Prepare exercise** creates a unique ordinary folder with starter files and visible checks. **Attach folder** associates existing work without writing to it. **Run checks** makes a disposable saved copy, restores the current provided checks in that copy, and streams results. The learner's files remain untouched. **Create fresh copy** makes another folder; it never resets the old one. Content changes update the suite version and show a notice, without replacing source. Runs do not watch files or gate navigation.

## Optional flashcards

Add `content/flashcards.yaml`:

```yaml
- id: slice-aliasing
  moduleId: intro
  front: Does assigning a slice copy its elements?
  back: |
    No. Assignment copies the slice header; both slices refer to the same
    backing array. Allocate and copy when you need independent elements.
```

Use stable card IDs, concise questions and explanatory answers in Markdown. `moduleId` is optional for both cards and exercises; when present it links to that module's first section. Content hashes version cards and exercises independently.

The deck supports unrestricted browsing and optional FSRS review with Again, Hard, Good and Easy ratings. Review state is local SQLite data and is included in backups. Edited cards start fresh on their next review. There are no streaks, scores, daily requirements, reminders or navigation gates. The website allows browsing, while scheduling and task execution require the desktop app.

Ordinary content edits need no desktop release. New runtime features or built-in check implementations require an app release and a corresponding minimum content app version; see [CI and releases](ci.md#updating-content-without-an-installer).
