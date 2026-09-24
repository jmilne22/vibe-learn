import { z } from "zod";
export const Id = z
  .string()
  .min(1)
  .max(240)
  .regex(/^[a-zA-Z0-9._:-]+$/);
export const StageSchema = z.object({
  id: Id,
  title: z.string(),
  html: z.string(),
  text: z.string(),
  moduleId: z.string().optional(),
});
export const CheckSchema = z.object({
  id: Id,
  title: z.string(),
  kind: z.enum(["learner", "acceptance", "maelstrom", "exercise"]),
  suiteVersion: z.string(),
  stageId: z.string().optional(),
  description: z.string(),
  unchecked: z.array(z.string()).default([]),
});
export const FilePath = z
  .string()
  .min(1)
  .max(300)
  .refine(
    (v) =>
      !v.includes("\\") &&
      !v.includes(":") &&
      !v.includes("\0") &&
      v
        .split("/")
        .every((p) => !!p && p !== "." && p !== ".." && !p.startsWith(".")),
    "Use a relative path without hidden files or parent segments",
  );
export const SourceFileSchema = z.object({
  path: FilePath,
  contents: z.string().max(1_000_000),
});
export const ExerciseSchema = z.object({
  id: Id,
  title: z.string(),
  stageId: Id.optional(),
  language: z.enum(["go", "rust"]),
  instructionsHtml: z.string(),
  hintsHtml: z.array(z.string()),
  solutionHtml: z.string().optional(),
  files: z.array(SourceFileSchema).min(1),
  checkFiles: z.array(SourceFileSchema).min(1),
  version: z.string(),
});
export const FlashcardSchema = z.object({
  id: Id,
  stageId: Id.optional(),
  frontHtml: z.string(),
  backHtml: z.string(),
  version: z.string(),
});
export type Exercise = z.infer<typeof ExerciseSchema>;
export type Flashcard = z.infer<typeof FlashcardSchema>;
const common = {
  id: Id,
  title: z.string(),
  description: z.string(),
  stages: z.array(StageSchema).min(1),
  related: z
    .array(z.object({ itemId: Id, stageId: Id.optional(), label: z.string() }))
    .default([]),
  checks: z.array(CheckSchema).default([]),
  prerequisites: z.array(z.string()).default([]),
  source: z.string(),
  version: z.string(),
};
export const ItemSchema = z.discriminatedUnion("kind", [
  z.object({
    ...common,
    kind: z.literal("course"),
    exercises: z.array(ExerciseSchema).default([]),
    flashcards: z.array(FlashcardSchema).default([]),
  }),
  z.object({ ...common, kind: z.literal("project") }),
]);
export const CatalogSchema = z.object({
  formatVersion: z.literal(2),
  items: z.array(ItemSchema),
});
export type Catalog = z.infer<typeof CatalogSchema>;
export type Item = z.infer<typeof ItemSchema>;
export type Stage = z.infer<typeof StageSchema>;
export type Check = z.infer<typeof CheckSchema>;
export const ProgressSchema = z.object({
  itemId: Id,
  stageId: Id,
  scroll: z.number().min(0).max(1),
  updatedAt: z.string(),
});
export const NoteSchema = z.object({
  itemId: Id,
  text: z.string().max(1_000_000),
  updatedAt: z.string(),
});
export const BookmarkSchema = z.object({ itemId: Id, stageId: Id });
export const WorkspaceSchema = z.object({
  itemId: Id,
  path: z.string(),
  buildTarget: z.string().default("."),
  maelstromPath: z.string().default(""),
});
export const RunStatus = z.enum([
  "running",
  "passed",
  "failed",
  "missing-tool",
  "error",
  "cancelled",
  "timed-out",
  "interrupted",
]);
export const RunSchema = z.object({
  id: Id,
  itemId: Id,
  checkId: Id,
  title: z.string(),
  kind: z.enum(["learner", "acceptance", "maelstrom", "exercise"]),
  status: RunStatus,
  startedAt: z.string(),
  finishedAt: z.string().optional(),
  sourceHash: z.string(),
  sourceChanged: z.boolean().default(false),
  suiteVersion: z.string(),
  contentVersion: z.string(),
  output: z.string(),
  artifactDir: z.string().optional(),
  unchecked: z.array(z.string()),
});
export type Run = z.infer<typeof RunSchema>;
export type Workspace = z.infer<typeof WorkspaceSchema>;
export const ExerciseWorkspaceSchema = z.object({
  itemId: Id,
  exerciseId: Id,
  path: z.string(),
  version: z.string(),
});
export type ExerciseWorkspace = z.infer<typeof ExerciseWorkspaceSchema>;
const nonnegative = z.number().finite().nonnegative();
export const ReviewSchema = z.object({
  itemId: Id,
  cardId: Id,
  cardVersion: z.string(),
  updatedAt: z.iso.datetime(),
  memory: z.object({
    due: z.iso.datetime(),
    last_review: z.iso.datetime().optional(),
    stability: nonnegative,
    difficulty: nonnegative.max(10),
    elapsed_days: nonnegative,
    scheduled_days: nonnegative,
    learning_steps: nonnegative.int(),
    reps: nonnegative.int(),
    lapses: nonnegative.int(),
    state: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
  }),
});
export type Review = z.infer<typeof ReviewSchema>;
export const StateSchema = z.object({
  progress: z.array(ProgressSchema),
  notes: z.array(NoteSchema),
  bookmarks: z.array(BookmarkSchema),
  workspaces: z.array(WorkspaceSchema),
  runs: z.array(RunSchema),
  reviews: z.array(ReviewSchema).default([]),
  exerciseWorkspaces: z.array(ExerciseWorkspaceSchema).default([]),
});
export type AppState = z.infer<typeof StateSchema>;
export const BackupSchema = z.object({
  format: z.literal("vibe-learn"),
  version: z.literal(2),
  exportedAt: z.string(),
  state: StateSchema,
});
export const emptyState = (): AppState => ({
  progress: [],
  notes: [],
  bookmarks: [],
  workspaces: [],
  runs: [],
  reviews: [],
  exerciseWorkspaces: [],
});
export const CommandSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("exercise"),
    itemId: Id,
    exerciseId: Id,
    action: z.enum(["prepare", "attach", "open", "fresh", "run"]),
  }),
  z.object({
    type: z.literal("review"),
    itemId: Id,
    cardId: Id,
    cardVersion: z.string(),
    expectedUpdatedAt: z.string().nullable(),
    grade: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  }),
  z.object({ type: z.literal("catalog") }),
  z.object({ type: z.literal("content-status") }),
  z.object({ type: z.literal("update-content") }),
  z.object({ type: z.literal("app-status") }),
  z.object({ type: z.literal("update-app") }),
  z.object({ type: z.literal("restart-app") }),
  z.object({ type: z.literal("state") }),
  z.object({
    type: z.literal("progress"),
    itemId: Id,
    stageId: Id,
    scroll: z.number().min(0).max(1),
  }),
  z.object({
    type: z.literal("note"),
    itemId: Id,
    text: z.string().max(1_000_000),
  }),
  z.object({ type: z.literal("bookmark"), itemId: Id, stageId: Id }),
  z.object({
    type: z.literal("workspace"),
    itemId: Id,
    action: z.enum(["attach", "create", "open"]),
  }),
  z.object({
    type: z.literal("configure"),
    itemId: Id,
    buildTarget: z
      .string()
      .min(1)
      .max(300)
      .refine((v) => !v.startsWith("-") && !v.includes("\0")),
    maelstromPath: z.string().max(2000),
  }),
  z.object({ type: z.literal("run"), itemId: Id, checkId: Id }),
  z.object({ type: z.literal("cancel"), runId: Id }),
  z.object({ type: z.literal("artifacts"), runId: Id }),
  z.object({ type: z.literal("copy"), text: z.string().max(8_000_000) }),
  z.object({ type: z.literal("backup") }),
  z.object({ type: z.literal("import") }),
  z.object({ type: z.literal("export-notes"), itemId: Id }),
]);
export type Command = z.infer<typeof CommandSchema>;
export interface DesktopAPI {
  invoke(command: Command): Promise<unknown>;
  onChange(listener: () => void): () => void;
}
