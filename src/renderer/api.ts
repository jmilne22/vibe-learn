import {
  BackupSchema,
  CatalogSchema,
  WebStateSchema,
  emptyState,
  type Backup,
  type Catalog,
  type WebState,
} from "../shared/model";

const STORAGE_KEY = "vibe-learn-v3:state";

export async function getCatalog(): Promise<Catalog> {
  const res = await fetch("./catalog.json");
  if (!res.ok) throw new Error("The project catalog could not be loaded.");
  return CatalogSchema.parse(await res.json());
}

export function loadState(): WebState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyState();
    return WebStateSchema.parse(JSON.parse(raw));
  } catch {
    return emptyState();
  }
}

function persistState(state: WebState): WebState {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* Storage may be unavailable in private browsing. */
  }
  return state;
}

export function saveProgress(
  itemId: string,
  stageId: string,
  scroll: number,
): WebState {
  const current = loadState();
  const next: WebState = {
    ...current,
    progress: [
      ...current.progress.filter((p) => p.itemId !== itemId),
      { itemId, stageId, scroll, updatedAt: new Date().toISOString() },
    ],
  };
  return persistState(next);
}

export function saveNote(itemId: string, text: string): WebState {
  const current = loadState();
  const next: WebState = {
    ...current,
    notes: [
      ...current.notes.filter((n) => n.itemId !== itemId),
      { itemId, text, updatedAt: new Date().toISOString() },
    ],
  };
  return persistState(next);
}

export function toggleBookmark(itemId: string, stageId: string): WebState {
  const current = loadState();
  const exists = current.bookmarks.some(
    (b) => b.itemId === itemId && b.stageId === stageId,
  );
  const next: WebState = {
    ...current,
    bookmarks: exists
      ? current.bookmarks.filter(
          (b) => !(b.itemId === itemId && b.stageId === stageId),
        )
      : [...current.bookmarks, { itemId, stageId }],
  };
  return persistState(next);
}

export function clearState(): WebState {
  return persistState(emptyState());
}

export function createBackup(): Backup {
  return {
    format: "vibe-learn",
    version: 3,
    exportedAt: new Date().toISOString(),
    state: loadState(),
  };
}

export function mergeBackup(raw: unknown): {
  state: WebState;
  summary: string;
} {
  const backup = BackupSchema.parse(raw);
  const current = loadState();

  const progressMap = new Map(current.progress.map((p) => [p.itemId, p]));
  for (const p of backup.state.progress) {
    const existing = progressMap.get(p.itemId);
    if (!existing || p.updatedAt > existing.updatedAt) {
      progressMap.set(p.itemId, p);
    }
  }

  const noteMap = new Map(current.notes.map((n) => [n.itemId, n]));
  let mergedNotes = 0;
  for (const n of backup.state.notes) {
    const existing = noteMap.get(n.itemId);
    if (!existing) {
      noteMap.set(n.itemId, n);
      mergedNotes++;
    } else if (existing.text !== n.text && n.text.trim()) {
      const combined = existing.text.trim()
        ? `${existing.text.trimEnd()}\n\n---\n\n${n.text.trimStart()}`
        : n.text;
      noteMap.set(n.itemId, {
        itemId: n.itemId,
        text: combined,
        updatedAt:
          n.updatedAt > existing.updatedAt ? n.updatedAt : existing.updatedAt,
      });
      mergedNotes++;
    }
  }

  const bookmarkKeys = new Set(
    current.bookmarks.map((b) => `${b.itemId}\0${b.stageId}`),
  );
  const bookmarks = [...current.bookmarks];
  for (const b of backup.state.bookmarks) {
    const key = `${b.itemId}\0${b.stageId}`;
    if (!bookmarkKeys.has(key)) {
      bookmarkKeys.add(key);
      bookmarks.push(b);
    }
  }

  const state = persistState({
    progress: [...progressMap.values()],
    notes: [...noteMap.values()],
    bookmarks,
  });
  return {
    state,
    summary: `Imported backup (${mergedNotes} note update(s), ${bookmarks.length} bookmark(s)).`,
  };
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
