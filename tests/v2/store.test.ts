import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { Store } from "../../src/main/store";
import { emptyState } from "../../src/shared/model";
const backup = (state = emptyState()) => ({
  format: "vibe-learn",
  version: 2,
  exportedAt: "2026-01-01",
  state,
});
describe("durable learner data", () => {
  it("persists notes and positions across restart without changing workspace files", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "vibe-store-"));
    const file = path.join(root, "learning.sqlite");
    const source = path.join(root, "mine.go");
    fs.writeFileSync(source, "my work");
    let db = await Store.open(file);
    db.put("notes", "course:test", {
      itemId: "course:test",
      text: "My reasoning",
      updatedAt: "2026-01-01",
    });
    db.put("progress", "course:test", {
      itemId: "course:test",
      stageId: "module1-example",
      scroll: 0.42,
      updatedAt: "2026-01-01",
    });
    db.close();
    db = await Store.open(file);
    expect(db.state().notes[0]?.text).toBe("My reasoning");
    expect(db.state().progress[0]?.scroll).toBe(0.42);
    expect(fs.readFileSync(source, "utf8")).toBe("my work");
    db.close();
    fs.rmSync(root, { recursive: true });
  });
  it("merges current backups without overwriting notes and makes imports idempotent", async () => {
    const db = await Store.open(":memory:");
    db.put("notes", "course:test", {
      itemId: "course:test",
      text: "Existing note",
      updatedAt: "2026-01-01",
    });
    const state = emptyState();
    state.notes.push({
      itemId: "course:test",
      text: "Remember ownership",
      updatedAt: "2026-01-02",
    });
    state.progress.push({
      itemId: "course:test",
      stageId: "module1-example",
      scroll: 0.42,
      updatedAt: "2026-01-02",
    });
    state.bookmarks.push({
      itemId: "course:test",
      stageId: "module1-example",
    });
    const data = backup(state);
    await db.import(data);
    const once = db.state();
    await db.import(data);
    expect(db.state()).toEqual(once);
    expect(once.notes[0]?.text).toContain("Existing note");
    expect(once.notes[0]?.text).toContain("Remember ownership");
    const restored = await Store.open(":memory:");
    await restored.import(db.backup());
    expect(restored.state().notes[0]?.text).toBe(once.notes[0]?.text);
    expect(restored.state().progress).toEqual(once.progress);
    expect(restored.state().bookmarks).toEqual(once.bookmarks);
    restored.close();
    db.close();
  });
  it("rejects malformed backups atomically and leaves workspace attachment explicit", async () => {
    const db = await Store.open(":memory:");
    const before = db.state();
    await expect(
      db.import({ format: "vibe-learn", version: 999 }),
    ).rejects.toThrow();
    expect(db.state()).toEqual(before);
    db.put("workspaces", "project:ingest-relay", {
      itemId: "project:ingest-relay",
      path: "/foreign/machine",
      buildTarget: ".",
      maelstromPath: "",
    });
    const other = await Store.open(":memory:");
    await other.import(db.backup());
    expect(other.state().workspaces).toHaveLength(0);
    other.close();
    db.close();
  });
});
it("marks interrupted runs after restart and rolls back oversized merged notes", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vibe-restart-"));
  const file = path.join(root, "state.sqlite");
  let db = await Store.open(file);
  db.putRun({
    id: "pending",
    itemId: "course:test",
    checkId: "go-test",
    title: "Run",
    kind: "learner",
    status: "running",
    startedAt: "2026-01-01",
    sourceHash: "abc",
    sourceChanged: false,
    suiteVersion: "1",
    contentVersion: "1",
    output: "starting",
    unchecked: [],
  });
  db.close();
  db = await Store.open(file);
  expect(db.state().runs[0]?.status).toBe("interrupted");
  db.put("notes", "course:test", {
    itemId: "course:test",
    text: "a".repeat(999999),
    updatedAt: "2026-01-01",
  });
  const before = db.state();
  await expect(
    db.import(
      backup({
        ...emptyState(),
        notes: [
          {
            itemId: "course:test",
            text: "too many",
            updatedAt: "2026-01-02",
          },
        ],
      }),
    ),
  ).rejects.toThrow("exceed");
  expect(db.state()).toEqual(before);
  db.close();
  fs.rmSync(root, { recursive: true });
});
