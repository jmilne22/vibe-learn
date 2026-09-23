import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import Database from "better-sqlite3";
import {
  BackupSchema,
  StateSchema,
  emptyState,
  type AppState,
  type Run,
} from "../shared/model";
export class Store {
  private constructor(private db: Database.Database) {}
  static async open(filename: string): Promise<Store> {
    if (filename !== ":memory:")
      fs.mkdirSync(path.dirname(filename), { recursive: true });
    const db = new Database(filename);
    const version = db.pragma("user_version", { simple: true }) as number;
    if (version > 1) {
      db.close();
      throw new Error(
        "This database was created by a newer Vibe Learn. Install the newer app.",
      );
    }
    if (version < 1) {
      try {
        if (filename !== ":memory:" && fs.statSync(filename).size > 0)
          await db.backup(`${filename}.before-v1.bak`);
        db.transaction(() => {
          db.exec(
            "CREATE TABLE IF NOT EXISTS records (kind TEXT NOT NULL, id TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY(kind,id))",
          );
          db.pragma("user_version = 1");
        })();
      } catch (error) {
        db.close();
        throw error;
      }
    }
    db.pragma("journal_mode = WAL");
    db.pragma("busy_timeout = 5000");
    const store = new Store(db);
    for (const run of store.state().runs)
      if (run.status === "running")
        store.putRun({
          ...run,
          status: "interrupted",
          finishedAt: new Date().toISOString(),
          output: run.output + "\nApplication exited before this run finished.",
        });
    return store;
  }
  get<T>(kind: string, id: string): T | undefined {
    const row = this.db
      .prepare("SELECT value FROM records WHERE kind=? AND id=?")
      .get(kind, id) as { value: string } | undefined;
    return row ? (JSON.parse(row.value) as T) : undefined;
  }
  put(kind: string, id: string, value: unknown): void {
    this.db
      .prepare(
        "INSERT INTO records VALUES (?,?,?) ON CONFLICT(kind,id) DO UPDATE SET value=excluded.value",
      )
      .run(kind, id, JSON.stringify(value));
  }
  state(): AppState {
    const state = emptyState();
    const rows = this.db
      .prepare("SELECT kind,id,value FROM records ORDER BY rowid")
      .all() as { kind: string; id: string; value: string }[];
    for (const row of rows) {
      const value: unknown = JSON.parse(row.value);
      if (
        [
          "progress",
          "notes",
          "bookmarks",
          "workspaces",
          "runs",
          "reviews",
          "exerciseWorkspaces",
        ].includes(row.kind)
      )
        (state[row.kind as keyof AppState] as unknown[]).push(value);
    }
    return StateSchema.parse(state);
  }
  bookmark(itemId: string, stageId: string): void {
    const id = `${itemId}/${stageId}`;
    if (this.get("bookmarks", id))
      this.db
        .prepare("DELETE FROM records WHERE kind=? AND id=?")
        .run("bookmarks", id);
    else this.put("bookmarks", id, { itemId, stageId });
  }
  putRun(run: Run): void {
    this.put("runs", run.id, run);
  }
  backup(): unknown {
    return {
      format: "vibe-learn",
      version: 2,
      exportedAt: new Date().toISOString(),
      state: this.state(),
    };
  }
  async import(data: unknown, backupFile?: string): Promise<string> {
    const raw = JSON.stringify(data);
    if (!raw || raw.length > 30_000_000)
      throw new Error("Choose a Vibe Learn backup under 30 MB.");
    const current = BackupSchema.parse(data);
    const importId = crypto.createHash("sha256").update(raw).digest("hex");
    if (this.get("imports", importId))
      return "This backup has already been imported.";
    if (backupFile) await this.db.backup(backupFile);
    this.db.transaction(() => {
      for (const note of current.state.notes)
        this.mergeNote(note.itemId, note.text);
      for (const progress of current.state.progress) {
        const old = this.get<AppState["progress"][number]>(
          "progress",
          progress.itemId,
        );
        if (!old || progress.updatedAt > old.updatedAt)
          this.put("progress", progress.itemId, progress);
      }
      for (const review of current.state.reviews) {
        const key = `${review.itemId}/${review.cardId}`;
        const old = this.get<AppState["reviews"][number]>("reviews", key);
        if (!old || review.updatedAt > old.updatedAt)
          this.put("reviews", key, review);
      }
      for (const bookmark of current.state.bookmarks)
        this.put(
          "bookmarks",
          `${bookmark.itemId}/${bookmark.stageId}`,
          bookmark,
        );
      for (const run of current.state.runs)
        if (!this.get("runs", run.id))
          this.putRun({
            ...run,
            artifactDir: undefined,
            status: run.status === "running" ? "interrupted" : run.status,
          });
      this.put("imports", importId, { importedAt: new Date().toISOString() });
    })();
    return "Imported notes, bookmarks, reading positions, flashcard reviews, and run history. Reattach workspace folders on this machine.";
  }
  private mergeNote(itemId: string, text: string): void {
    if (!text) return;
    const old = this.get<AppState["notes"][number]>("notes", itemId);
    const merged =
      !old || !old.text
        ? text
        : old.text === text
          ? old.text
          : old.text + "\n\n---\nImported notes\n\n" + text;
    if (merged.length > 1_000_000)
      throw new Error(
        "Combined notes exceed 1 MB. Export or shorten the existing notes before importing. No data was changed.",
      );
    this.put("notes", itemId, {
      itemId,
      text: merged,
      updatedAt: new Date().toISOString(),
    });
  }
  close(): void {
    this.db.close();
  }
}
