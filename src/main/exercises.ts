import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {
  type Exercise,
  type ExerciseWorkspace,
  SourceFileSchema,
} from "../shared/model";
import { command, TaskError, type ProcessContext } from "./process";
export function writeFiles(folder: string, files: Exercise["files"]): void {
  for (const source of files) {
    const file = SourceFileSchema.parse(source);
    const target = path.join(folder, file.path);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, file.contents);
  }
}
export function prepareExercise(
  parent: string,
  itemId: string,
  exercise: Exercise,
): ExerciseWorkspace {
  const folder = path.join(
    fs.realpathSync(parent),
    exercise.id.replace(/[^a-zA-Z0-9-]/g, "-") +
      "-" +
      crypto.randomUUID().slice(0, 8),
  );
  fs.mkdirSync(folder);
  try {
    writeFiles(folder, [...exercise.files, ...exercise.checkFiles]);
  } catch (error) {
    fs.rmSync(folder, { recursive: true, force: true });
    throw error;
  }
  return {
    itemId,
    exerciseId: exercise.id,
    path: folder,
    version: exercise.version,
  };
}
export async function runExercise(
  exercise: Exercise,
  source: string,
  artifactDir: string,
  go: string,
  context: ProcessContext,
): Promise<void> {
  const snapshot = path.join(artifactDir, "workspace");
  fs.mkdirSync(snapshot);
  const ignored = new Set([
    ".git",
    "target",
    "node_modules",
    "bin",
    "build",
    "dist",
    ".vibe",
  ]);
  let count = 0,
    bytes = 0;
  async function copy(from: string, to: string) {
    for (const entry of await fs.promises.readdir(from, {
      withFileTypes: true,
    })) {
      context.signal.throwIfAborted();
      if (ignored.has(entry.name)) continue;
      const file = path.join(from, entry.name),
        target = path.join(to, entry.name);
      const stat = await fs.promises.lstat(file);
      if (stat.isSymbolicLink() || (!stat.isDirectory() && !stat.isFile()))
        throw new TaskError(
          "error",
          `Exercise workspaces cannot contain symlinks or special files: ${entry.name}`,
        );
      if (stat.isDirectory()) {
        await fs.promises.mkdir(target);
        await copy(file, target);
      } else {
        bytes += stat.size;
        if (++count > 1000 || bytes > 20_000_000)
          throw new TaskError(
            "error",
            "Exercise workspace exceeds 1,000 files or 20 MB. Attach only the exercise folder.",
          );
        await fs.promises.copyFile(file, target);
      }
    }
  }
  await copy(source, snapshot);
  // Restore the authored checks in the disposable snapshot, never in the learner's folder.
  writeFiles(snapshot, exercise.checkFiles);
  const ctx: ProcessContext = {
    ...context,
    env: {
      ...context.env,
      GOWORK: "off",
      GOFLAGS: "",
      GOPROXY: "off",
      GOSUMDB: "off",
      CARGO_TARGET_DIR: path.join(artifactDir, "target"),
    },
  };
  ctx.log("Running exercise checks…\n");
  let output: string;
  if (exercise.language === "go") {
    await command(go, ["version"], snapshot, ctx);
    let pending = "";
    const log = (chunk: string) => {
      pending += chunk;
      const lines = pending.split("\n");
      pending = lines.pop()!;
      for (const line of lines) {
        try {
          const event = JSON.parse(line) as { Output?: string };
          if (event.Output) ctx.log(event.Output);
        } catch {
          ctx.log(line + "\n");
        }
      }
    };
    try {
      output = await command(
        go,
        ["test", "-json", "-count=1", "./..."],
        snapshot,
        { ...ctx, log },
      );
    } finally {
      if (pending) ctx.log(pending + "\n");
    }
    if (
      !output.split("\n").some((line) => {
        try {
          const event = JSON.parse(line) as { Action?: string; Test?: string };
          return event.Action === "pass" && !!event.Test;
        } catch {
          return false;
        }
      })
    )
      throw new TaskError(
        "error",
        "No executed test cases were reported. Check the exercise package.",
      );
  } else {
    ctx.log(
      "Rust exercises require cargo, rustc, and a native linker. Install the Rust toolchain externally; dependencies must already be available offline.\n",
    );
    await command("cargo", ["--version"], snapshot, ctx);
    output = await command(
      "cargo",
      ["test", "--offline", "--", "--format", "terse"],
      snapshot,
      ctx,
    );
    if (
      ![...output.matchAll(/test result: ok\. (\d+) passed/g)].some(
        (match) => Number(match[1]) > 0,
      )
    )
      throw new TaskError(
        "error",
        "No executed test cases were reported. Check the exercise package.",
      );
  }
}
