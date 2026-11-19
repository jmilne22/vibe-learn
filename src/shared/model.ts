import { z } from "zod";

export const Id = z
  .string()
  .min(1)
  .max(240)
  .regex(/^[a-zA-Z0-9._:-]+$/);

export const Slug = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9][a-z0-9-]*$/);

export const ProjectLanguageSchema = z.enum([
  "go",
  "python",
  "typescript",
  "rust",
  "generic",
]);
export type ProjectLanguage = z.infer<typeof ProjectLanguageSchema>;

// Mentor: the assistant gives hints and never edits code; it may update the two notes files
// after the learner agrees. Pair: it may edit in small reviewed steps.
export const AssistantModeSchema = z.enum(["mentor", "pair"]);
export type AssistantMode = z.infer<typeof AssistantModeSchema>;

export const StageSchema = z.object({
  id: Id,
  title: z.string(),
  html: z.string(),
  markdown: z.string(),
  text: z.string(),
});
export type Stage = z.infer<typeof StageSchema>;

// Names that test runners, build tools and coding assistants run or load on
// their own when they meet them in a folder.
const AUTOLOADED_NAMES = [
  "conftest.py",
  "setup.py",
  "pyproject.toml",
  "makefile",
  "gnumakefile",
  "package.json",
  "dockerfile",
  "build.rs",
  "agent.md",
  "conventions.md",
  "opencode.json",
];

// Supplied project helpers live at the workspace root. Reserve files generated
// by the workspace kit, and reject aliases that collide on case-insensitive filesystems.
// A Go helper must carry an ignore build tag so that the learner's own module never
// compiles it: `go run doctor.go` names the file and still runs it.
export const ProjectSupportFilesSchema = z
  .array(
    z
      .object({
        path: z
          .string()
          .max(100)
          .regex(
            /^[A-Za-z0-9](?:[A-Za-z0-9_.-]*[A-Za-z0-9])?$/,
            "Use a plain, non-hidden root filename for a project support file",
          )
          .regex(
            /\.(py|ya?ml|md|txt|json|sh|go)$/i,
            "Use a .py, .yml, .yaml, .md, .txt, .json, .sh or .go project support file",
          )
          .refine(
            (name) =>
              !AUTOLOADED_NAMES.includes(name.toLowerCase()) &&
              !/_test\.go$/i.test(name),
            "Use a project support filename that other tools do not run or load automatically",
          )
          .refine(
            (name) =>
              !/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(name) &&
              ![
                "readme.md",
                "notes.md",
                "mentor-notes.md",
                "agents.md",
                "claude.md",
                "gemini.md",
                "go.mod",
                "steps",
              ].includes(name.toLowerCase()),
            "Use a root filename that is not reserved by the workspace",
          ),
        contents: z.string().max(100_000),
      })
      .refine(
        (file) =>
          !/\.go$/i.test(file.path) ||
          /^\/\/go:build ignore\r?\n/.test(file.contents),
        "Start a .go project support file with the line //go:build ignore",
      ),
  )
  .max(20)
  .refine(
    (files) =>
      new Set(files.map((f) => f.path.toLowerCase())).size === files.length,
    "Duplicate project support filename",
  );
export type ProjectSupportFile = z.infer<
  typeof ProjectSupportFilesSchema
>[number];

export const ProjectSchema = z.object({
  id: Id,
  slug: Slug,
  title: z.string(),
  description: z.string(),
  language: ProjectLanguageSchema.default("go"),
  stages: z.array(StageSchema).min(1),
  related: z
    .array(z.object({ itemId: Id, stageId: Id.optional(), label: z.string() }))
    .default([]),
  prerequisites: z.array(z.string()).default([]),
  supportFiles: ProjectSupportFilesSchema.optional(),
  source: z.string(),
  version: z.string(),
});
export type Project = z.infer<typeof ProjectSchema>;

export const CatalogSchema = z.object({
  formatVersion: z.literal(3),
  items: z.array(ProjectSchema),
});
export type Catalog = z.infer<typeof CatalogSchema>;

export const ProgressSchema = z.object({
  itemId: Id,
  stageId: Id,
  scroll: z.number().min(0).max(1),
  updatedAt: z.string(),
});
export type Progress = z.infer<typeof ProgressSchema>;

export const NoteSchema = z.object({
  itemId: Id,
  text: z.string().max(1_000_000),
  updatedAt: z.string(),
});
export type Note = z.infer<typeof NoteSchema>;

export const BookmarkSchema = z.object({
  itemId: Id,
  stageId: Id,
});
export type Bookmark = z.infer<typeof BookmarkSchema>;

export const WebStateSchema = z.object({
  progress: z.array(ProgressSchema).default([]),
  notes: z.array(NoteSchema).default([]),
  bookmarks: z.array(BookmarkSchema).default([]),
});
export type WebState = z.infer<typeof WebStateSchema>;

export const BackupSchema = z.object({
  format: z.literal("vibe-learn"),
  version: z.union([z.literal(2), z.literal(3)]),
  exportedAt: z.string(),
  state: WebStateSchema,
});
export type Backup = z.infer<typeof BackupSchema>;

export const emptyState = (): WebState => ({
  progress: [],
  notes: [],
  bookmarks: [],
});
