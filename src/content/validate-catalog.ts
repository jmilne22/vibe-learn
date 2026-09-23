import { CatalogSchema, type Catalog } from "../shared/model";
import { clean, htmlText } from "./render";

const supportedChecks: Record<string, string> = {
  "learner:go-test": "go-test-v1",
  "learner:go-race": "go-test-v1",
  ...Object.fromEntries(
    ["relay", "tsdb"].flatMap((kind) =>
      ["http", "storage", "final"].map((part) => [
        `acceptance:${kind}-${part}`,
        `${kind}-1`,
      ]),
    ),
  ),
  ...Object.fromEntries(
    [
      "1",
      "2",
      "3a",
      "3b",
      "3c",
      "3d",
      "3e",
      "4",
      "5a",
      "5b",
      "5c",
      "6a",
      "6b",
      "6c",
    ].map((stage) => [`maelstrom:maelstrom-${stage}`, "maelstrom-0.2.3-v1"]),
  ),
};
function unique(values: string[], label: string): void {
  if (new Set(values).size !== values.length)
    throw new Error(`Duplicate ${label} in content update.`);
}
export function validateDownloadedCatalog(data: string): Catalog {
  const catalog = CatalogSchema.parse(JSON.parse(data));
  unique(
    catalog.items.map((i) => i.id),
    "item ID",
  );
  for (const item of catalog.items) {
    unique(
      item.stages.map((s) => s.id),
      "section ID",
    );
    unique(
      item.checks.map((c) => c.id),
      "check ID",
    );
    const hasStage = (id?: string) =>
      !id || item.stages.some((s) => s.id === id);
    for (const stage of item.stages) {
      stage.html = clean(stage.html);
      stage.text = htmlText(stage.html);
    }
    for (const check of item.checks) {
      if (!hasStage(check.stageId))
        throw new Error("Unknown check section in content update.");
      if (supportedChecks[`${check.kind}:${check.id}`] !== check.suiteVersion)
        throw new Error(
          "This content needs a newer app to run its checks. Download the latest Vibe Learn.",
        );
    }
    for (const link of item.related) {
      const target = catalog.items.find((i) => i.id === link.itemId);
      if (
        !target ||
        (link.stageId && !target.stages.some((s) => s.id === link.stageId))
      )
        throw new Error("Broken related link in content update.");
    }
    if (item.kind !== "course") continue;
    unique(
      item.exercises.map((e) => e.id),
      "exercise ID",
    );
    unique(
      item.flashcards.map((c) => c.id),
      "flashcard ID",
    );
    for (const card of item.flashcards) {
      if (!hasStage(card.stageId))
        throw new Error("Unknown flashcard section in content update.");
      card.frontHtml = clean(card.frontHtml);
      card.backHtml = clean(card.backHtml);
    }
    for (const exercise of item.exercises) {
      if (!hasStage(exercise.stageId))
        throw new Error("Unknown exercise section in content update.");
      exercise.instructionsHtml = clean(exercise.instructionsHtml);
      exercise.hintsHtml = exercise.hintsHtml.map(clean);
      if (exercise.solutionHtml)
        exercise.solutionHtml = clean(exercise.solutionHtml);
      const files = [...exercise.files, ...exercise.checkFiles];
      const paths = files.map((f) => f.path.toLowerCase());
      unique(paths, "exercise file path");
      if (paths.some((p) => paths.some((other) => other.startsWith(p + "/"))))
        throw new Error("Conflicting exercise file paths in content update.");
      if (
        files.length > 400 ||
        files.reduce((n, f) => n + Buffer.byteLength(f.contents), 0) > 4_000_000
      )
        throw new Error("Exercise files exceed the content limit.");
      const go = exercise.language === "go";
      if (
        !exercise.files.some(
          (f) => f.path === (go ? "go.mod" : "Cargo.toml"),
        ) ||
        !exercise.checkFiles.some((f) =>
          go
            ? f.path.endsWith("_test.go")
            : f.path.startsWith("tests/") && f.path.endsWith(".rs"),
        )
      )
        throw new Error("Exercise manifest or checks are missing.");
    }
  }
  return catalog;
}
