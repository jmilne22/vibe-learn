import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import yaml from "js-yaml";
import { z } from "zod";
import {
  Id,
  FilePath,
  ExerciseSchema,
  FlashcardSchema,
  type Stage,
} from "../shared/model";
import { markdown } from "./render";
const version = (value: unknown) =>
  crypto
    .createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex")
    .slice(0, 16);
const association = {
  id: Id,
  moduleId: z.union([z.string(), z.number()]).transform(String).optional(),
};
const Cards = z.array(
  z.object({
    ...association,
    front: z.string().min(1),
    back: z.string().min(1),
  }),
);
const Exercises = z.array(
  z.object({
    ...association,
    title: z.string(),
    language: z.enum(["go", "rust"]),
    instructions: z.string(),
    hints: z.array(z.string()).default([]),
    solution: z.string().optional(),
    starter: FilePath,
    checks: FilePath,
  }),
);
function confined(root: string, relative: string): string {
  FilePath.parse(relative);
  let current = root;
  for (const part of relative.split("/")) {
    current = path.join(current, part);
    if (fs.lstatSync(current).isSymbolicLink())
      throw new Error(
        `Symlinks are not allowed in exercise content: ${relative}`,
      );
  }
  return current;
}
function files(root: string, relative: string) {
  const dir = confined(root, relative);
  const result: { path: string; contents: string }[] = [];
  let bytes = 0;
  function walk(folder: string) {
    for (const name of fs.readdirSync(folder).sort()) {
      const file = path.join(folder, name),
        stat = fs.lstatSync(file);
      if (stat.isSymbolicLink()) throw new Error(`Symlink: ${file}`);
      if (stat.isDirectory()) walk(file);
      else {
        bytes += stat.size;
        if (!stat.isFile() || bytes > 2_000_000 || result.length >= 200)
          throw new Error(`Exercise source too large or unsupported: ${file}`);
        result.push({
          path: FilePath.parse(
            path.relative(dir, file).split(path.sep).join("/"),
          ),
          contents: fs.readFileSync(file, "utf8"),
        });
      }
    }
  }
  walk(dir);
  return result;
}
export function activities(dir: string, stages: Stage[]) {
  const stageId = (moduleId?: string) => {
    if (moduleId === undefined) return undefined;
    const stage = stages.find((s) => s.moduleId === moduleId);
    if (!stage) throw new Error(`Unknown activity module: ${moduleId}`);
    return stage.id;
  };
  const load = (file: string): unknown =>
    fs.existsSync(path.join(dir, file))
      ? yaml.load(fs.readFileSync(confined(dir, file), "utf8"))
      : [];
  const flashcards = Cards.parse(load("content/flashcards.yaml")).map(
    (card) => {
      const value = {
        id: card.id,
        stageId: stageId(card.moduleId),
        frontHtml: markdown(card.front),
        backHtml: markdown(card.back),
      };
      return FlashcardSchema.parse({ ...value, version: version(value) });
    },
  );
  const exercises = Exercises.parse(load("content/exercises.yaml")).map(
    (exercise) => {
      const starter = files(dir, exercise.starter),
        checks = files(dir, exercise.checks);
      const paths = [...starter, ...checks].map((f) => f.path.toLowerCase());
      if (new Set(paths).size !== paths.length)
        throw new Error(`Overlapping starter/check files: ${exercise.id}`);
      const manifest = exercise.language === "go" ? "go.mod" : "Cargo.toml";
      if (!starter.some((f) => f.path === manifest))
        throw new Error(`${exercise.id}: starter requires ${manifest}`);
      if (
        !checks.some((f) =>
          exercise.language === "go"
            ? f.path.endsWith("_test.go")
            : f.path.startsWith("tests/") && f.path.endsWith(".rs"),
        )
      )
        throw new Error(`${exercise.id}: provide executable tests in checks`);
      const value = {
        id: exercise.id,
        title: exercise.title,
        stageId: stageId(exercise.moduleId),
        language: exercise.language,
        instructionsHtml: markdown(exercise.instructions),
        hintsHtml: exercise.hints.map(markdown),
        solutionHtml: exercise.solution
          ? markdown(exercise.solution)
          : undefined,
        files: starter,
        checkFiles: checks,
      };
      return ExerciseSchema.parse({ ...value, version: version(value) });
    },
  );
  for (const list of [flashcards, exercises])
    if (new Set(list.map((v) => v.id)).size !== list.length)
      throw new Error("Duplicate course activity ID");
  return { flashcards, exercises };
}
