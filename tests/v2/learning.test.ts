import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { setTimeout as delay } from "node:timers/promises";
import { it, expect } from "vitest";
import { Store } from "../../src/main/store";
import { reviewCard } from "../../src/main/review";
import { prepareExercise } from "../../src/main/exercises";
import { Runner } from "../../src/main/runner";
import { activities } from "../../src/content/activities";
import { BackupSchema, type Exercise } from "../../src/shared/model";
import { fixtureCourse, goExercise, rustExercise } from "./fixtures/course";
it("schedules optional reviews, rejects duplicate/stale ratings, resets changed cards, and merges backups without attaching folders", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vibe-review-"));
  let store = await Store.open(path.join(root, "state.sqlite"));
  const card = {
    id: "card",
    frontHtml: "Question",
    backHtml: "Answer",
    version: "1",
  };
  const now = new Date("2026-09-23T12:00:00Z");
  try {
    const first = reviewCard(store, "course:test", card, "1", null, 3, now);
    expect(first.memory.reps).toBe(1);
    expect(Date.parse(first.memory.due)).toBeGreaterThan(+now);
    expect(() =>
      reviewCard(store, "course:test", card, "1", null, 3, now),
    ).toThrow("already saved");
    expect(() =>
      reviewCard(store, "course:test", card, "wrong", first.updatedAt, 3, now),
    ).toThrow("changed");
    const later = new Date("2026-09-24T12:00:00Z");
    const second = reviewCard(
      store,
      "course:test",
      card,
      "1",
      first.updatedAt,
      4,
      later,
    );
    expect(second.memory.reps).toBe(2);
    store.close();
    store = await Store.open(path.join(root, "state.sqlite"));
    expect(store.state().reviews[0]).toEqual(second);
    const backup = BackupSchema.parse(store.backup());
    backup.state.exerciseWorkspaces.push({
      itemId: "course:test",
      exerciseId: "e",
      path: "/do-not-attach",
      version: "1",
    });
    const other = await Store.open(":memory:");
    try {
      await other.import(backup);
      expect(other.state().reviews).toEqual([second]);
      expect(other.state().exerciseWorkspaces).toEqual([]);
    } finally {
      other.close();
    }
    const changed = reviewCard(
      store,
      "course:test",
      { ...card, version: "2" },
      "2",
      second.updatedAt,
      1,
      new Date("2026-09-25T12:00:00Z"),
    );
    expect(changed.memory.reps).toBe(1);
    await store.import(backup);
    expect(store.state().reviews[0]).toEqual(changed);
  } finally {
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
it("compiles optional activity YAML, resolves modules, versions edits, and rejects unsafe or overlapping files", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vibe-activities-"));
  const write = (file: string, value: string) => {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), value);
  };
  try {
    write(
      "content/flashcards.yaml",
      "- id: sum\n  moduleId: intro\n  front: What is addition?\n  back: Combining values.\n",
    );
    write(
      "content/exercises.yaml",
      "- id: add\n  moduleId: intro\n  title: Addition\n  language: go\n  instructions: Fix it.\n  starter: content/add/starter\n  checks: content/add/checks\n",
    );
    for (const f of goExercise.files)
      write(`content/add/starter/${f.path}`, f.contents);
    for (const f of goExercise.checkFiles)
      write(`content/add/checks/${f.path}`, f.contents);
    const stages = [
      {
        id: "intro-section",
        moduleId: "intro",
        title: "Intro",
        html: "",
        text: "",
      },
    ];
    const initial = activities(root, stages);
    expect(initial.flashcards[0]?.stageId).toBe("intro-section");
    expect(initial.exercises[0]?.checkFiles).toEqual(goExercise.checkFiles);
    write(
      "content/add/starter/addition.go",
      "package addition\nfunc Add(a,b int) int {return a+b}",
    );
    expect(activities(root, stages).exercises[0]?.version).not.toBe(
      initial.exercises[0]?.version,
    );
    write("content/add/checks/go.mod", "module wrong");
    expect(() => activities(root, stages)).toThrow("Overlapping");
    fs.rmSync(path.join(root, "content/add/checks/go.mod"));
    write(
      "content/exercises.yaml",
      "- id: escape\n  title: Bad\n  language: go\n  instructions: Bad\n  starter: ../outside\n  checks: content/add/checks\n",
    );
    expect(() => activities(root, stages)).toThrow("relative path");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
it("runs real Go and Rust exercise checks in snapshots, preserves edits, rejects empty tests, and makes fresh copies", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vibe-exercises-"));
  const store = await Store.open(":memory:");
  const runner = new Runner(store, path.join(root, "runs"), "go", () => {});
  async function run(exercise: Exercise, folder: string) {
    const id = runner.start(
      fixtureCourse,
      {
        id: `exercise:${exercise.id}`,
        kind: "exercise",
        title: exercise.title,
        suiteVersion: exercise.version,
        description: "",
        unchecked: [],
      },
      {
        itemId: fixtureCourse.id,
        path: folder,
        buildTarget: ".",
        maelstromPath: "",
      },
      exercise,
    );
    for (let n = 0; n < 2400; n++) {
      const result = store.state().runs.find((r) => r.id === id)!;
      if (result.status !== "running") return result;
      await delay(50);
    }
    throw new Error("Run did not finish");
  }
  try {
    const workspace = prepareExercise(root, fixtureCourse.id, goExercise);
    // Editing or deleting the local supplied test does not remove the packaged check from the snapshot.
    fs.writeFileSync(
      path.join(workspace.path, "addition_test.go"),
      "package addition\n",
    );
    const failed = await run(goExercise, workspace.path);
    expect(failed.status, failed.output).toBe("failed");
    const solution = "package addition\nfunc Add(a,b int) int {return b+a}\n";
    fs.writeFileSync(path.join(workspace.path, "addition.go"), solution);
    const passed = await run(goExercise, workspace.path);
    expect(passed.status, passed.output).toBe("passed");
    expect(
      fs.readFileSync(path.join(workspace.path, "addition_test.go"), "utf8"),
    ).toBe("package addition\n");
    expect(
      fs.readFileSync(
        path.join(passed.artifactDir!, "workspace/addition_test.go"),
        "utf8",
      ),
    ).toContain("TestAdd");
    const fresh = prepareExercise(root, fixtureCourse.id, {
      ...goExercise,
      version: "2",
    });
    expect(fresh.path).not.toBe(workspace.path);
    expect(
      fs.readFileSync(path.join(workspace.path, "addition.go"), "utf8"),
    ).toBe(solution);
    const empty = await run(
      {
        ...goExercise,
        checkFiles: [
          { path: "addition_test.go", contents: "package addition\n" },
        ],
      },
      workspace.path,
    );
    expect(empty.status).toBe("error");
    expect(empty.output).toContain("No executed test");
    const rust = prepareExercise(root, fixtureCourse.id, rustExercise);
    const rustPassed = await run(rustExercise, rust.path);
    expect(rustPassed.status, rustPassed.output).toBe("passed");
    fs.writeFileSync(
      path.join(rust.path, "src/lib.rs"),
      "pub fn add(_a:i32,_b:i32)->i32 {0}\n",
    );
    expect((await run(rustExercise, rust.path)).status).toBe("failed");
    fs.writeFileSync(path.join(rust.path, "src/lib.rs"), "this is not rust");
    expect((await run(rustExercise, rust.path)).status).toBe("error");
  } finally {
    await runner.close();
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
}, 120000);
