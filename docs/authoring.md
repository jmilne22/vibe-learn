# Content authoring

Content is authored in this repository, bundled with the application, and published to the content update channel by the existing Pages workflow. Desktop users can download the current catalog from Settings after deployment. `courses/` is intentionally empty; the bundled catalog currently contains six standalone projects.

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

## Supplied project files

For standalone projects, mark a supplied helper's code block as `<pre data-workspace-file="Taskfile.yml"><code>…</code></pre>`. The compiler reads its text before HTML sanitization, validates it, and includes it in the project's optional `supportFiles` catalog field. Keep the block in a folded reference section so the learner can inspect it. Only mark setup helpers; leave exercise implementations and solutions as ordinary code blocks.

**Create workspace** writes supplied files automatically; **Add missing workspace files** adds missing files to an attached folder and never overwrites existing files, including symlinks. Neither action executes the helpers, and the generated README.md lists them. A supplied `Taskfile.yml` is also skipped when the folder already has any spelling Task would load instead (`Taskfile.yaml`, `taskfile.dist.yml` and so on); the learner's taskfile wins.

Filenames must be non-hidden root-level names ending in `.py`, `.yml`, `.yaml`, `.md`, `.txt`, `.json`, `.sh` or `.go`, unique ignoring case, and must not collide with generated workspace files or Windows device names. Names that other tools run or load on their own are rejected in any case: `conftest.py`, `setup.py`, `pyproject.toml`, `Makefile`, `GNUmakefile`, `package.json`, `Dockerfile`, `build.rs`, `AGENT.md`, `CONVENTIONS.md`, `opencode.json` and any `*_test.go` file. A `.go` helper must start with the line `//go:build ignore`. Then `go build ./...` and `go test ./...` in the learner's module skip it, and `go run doctor.go` still runs it. A marked block needs a non-empty `<code>` child. Each project can supply up to 20 files of 100,000 characters each. Downloaded catalogs and workspace creation enforce the same validation.

Learners and their assistants run these helpers, and content updates are hash-checked but not signed, so review supplied files as code: keep them short, readable and read-only where possible.

This requires Vibe Learn 2.3.0 or newer, because older apps reject supplied `.go` helpers. The published content manifest specifies that minimum; users update the app before downloading this catalog. The admission lab supplies Taskfile.yml and doctor.go while leaving main.go and go.mod to the learner.

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

## Standalone project illustrations

Store SVG/PNG/JPEG images in `content/projects/assets/<source-file-stem>/` and reference them as `assets/<source-file-stem>/diagram.svg` from the project HTML. The compiler embeds local images for offline reading, rejects paths outside that project asset directory (including symlink escapes), and reports missing/unsupported assets. Course image handling is unchanged. Keep SVG images self-contained, without scripts or external resources. For short CSS animations, use a finite duration of at most five seconds, include `prefers-reduced-motion` inside the SVG, and supply a static counterpart.

Pair animated and static images with the `motion-animated` and `motion-static` classes. The reader stylesheet selects the static image under reduced motion as an additional fallback for browsers that do not propagate this preference into SVG image documents. Both images need useful alt text; keep captions and numbered explanations outside the images so workspace Markdown retains them.

Always include descriptive alt text, captions and numbered prose equivalents. Workspace Markdown exports retain image descriptions and captions, not the images themselves. The Kubernetes Admission Lab demonstrates this pattern. Its Go tests and cluster checks run in the learner terminal; do not register app checks or create an app-owned runner for it. `tests/v2/admission-content.test.ts` extracts the reference `main.go`, `main_test.go` and helpers from the HTML and runs gofmt, vet and the tests, so keep those blocks complete.
