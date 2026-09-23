import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import yaml from "js-yaml";
import { z } from "zod";

const root = path.resolve("courses/go-infrastructure");
const race = process.argv.includes("--race");
const exercises = z
  .array(
    z.object({
      id: z.string(),
      starter: z.string(),
      checks: z.string(),
      solution: z.string(),
    }),
  )
  .parse(
    yaml.load(
      fs.readFileSync(path.join(root, "content/exercises.yaml"), "utf8"),
    ),
  );
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "vibe-course-verify-"));
try {
  // Lab recipes are also available as complete offline lesson text.
  const labLessons = ["kubernetes/03", "terraform/03", "telemetry/04"]
    .map((entry) => {
      const [module, number] = entry.split("/");
      return fs.readFileSync(
        path.join(
          root,
          `content/lessons/module${module}/${number}-lab-files.md`,
        ),
        "utf8",
      );
    })
    .join("\n");
  function checkLabFiles(dir: string): void {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) checkLabFiles(file);
      else if (!labLessons.includes(fs.readFileSync(file, "utf8") + "```"))
        throw new Error(`Offline lab source differs from ${file}`);
    }
  }
  checkLabFiles(path.join(root, "labs"));
  for (const exercise of exercises) {
    for (const variant of ["starter", "solution"] as const) {
      const dir = path.join(temporary, exercise.id, variant);
      fs.cpSync(path.join(root, exercise.starter), dir, { recursive: true });
      fs.cpSync(path.join(root, exercise.checks), dir, { recursive: true });
      if (variant === "solution") {
        const solutionDir = path.join(
          root,
          "validation/solutions",
          exercise.id,
        );
        for (const file of fs.readdirSync(solutionDir)) {
          const contents = fs.readFileSync(
            path.join(solutionDir, file),
            "utf8",
          );
          if (!exercise.solution.includes("```go\n" + contents + "```"))
            throw new Error(
              `${exercise.id}: displayed solution differs from tested source`,
            );
        }
        fs.cpSync(solutionDir, dir, { recursive: true });
      }
      const run = spawnSync(
        "go",
        [
          "test",
          "-json",
          "-count=1",
          "-timeout=20s",
          ...(race && variant === "solution" ? ["-race"] : []),
          "./...",
        ],
        {
          cwd: dir,
          encoding: "utf8",
          timeout: 120000,
          env: {
            ...process.env,
            CGO_ENABLED: race && variant === "solution" ? "1" : "0",
            GOPROXY: "off",
            GOSUMDB: "off",
            GOTOOLCHAIN: "local",
          },
        },
      );
      const output = run.stdout + run.stderr;
      if (run.error)
        throw new Error(`${exercise.id}/${variant}: ${run.error.message}`);
      const events = run.stdout
        .split("\n")
        .filter((line) => line.startsWith("{"))
        .map((line) => JSON.parse(line) as { Action?: string; Test?: string });
      const correct =
        variant === "solution"
          ? run.status === 0 &&
            events.some((event) => event.Action === "pass" && event.Test)
          : run.status === 1 &&
            events.some(
              (event) =>
                event.Action === "fail" && event.Test === "TestContract",
            ) &&
            !/panic:|build failed|test timed out/.test(output);
      if (!correct) throw new Error(`${exercise.id}/${variant}: ${output}`);
      console.log(
        `${exercise.id}: ${variant === "starter" ? "starter fails its contract" : "solution passes"}${race && variant === "solution" ? " with race detector" : ""}`,
      );
    }
  }
  console.log(`Verified ${exercises.length} course exercises.`);
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
