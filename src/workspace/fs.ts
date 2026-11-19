import fs from "node:fs";
import path from "node:path";
import type { AssistantMode, Project, ProjectLanguage } from "../shared/model";
import {
  TASKFILES,
  blankProjectFiles,
  standaloneMentorFiles,
  workspaceFiles,
  workspaceSlug,
  type AddedFiles,
  type WorkspaceFile,
} from "./generator";

const ALIASES: Record<string, string[]> = Object.fromEntries(
  TASKFILES.map((name) => [name, TASKFILES]),
);

function writeExclusive(folder: string, file: WorkspaceFile): boolean {
  const target = path.join(folder, file.path);
  try {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, file.contents, { flag: "wx" });
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") return false;
    throw error;
  }
}

// Skips a file when it, or a learner file standing in for it, was already
// there, and reports the learner's name for it.
export function writeWorkspaceFiles(
  folder: string,
  files: WorkspaceFile[],
): AddedFiles {
  const present = fs.existsSync(folder) ? fs.readdirSync(folder) : [];
  const result: AddedFiles = { written: [], skipped: [] };
  for (const file of files) {
    const aliases = ALIASES[file.path.toLowerCase()];
    const kept =
      aliases && present.find((name) => aliases.includes(name.toLowerCase()));
    if (kept) result.skipped.push(kept);
    else
      (writeExclusive(folder, file) ? result.written : result.skipped).push(
        file.path,
      );
  }
  return result;
}

function allocateFreshFolder(parent: string, slug: string): string {
  fs.mkdirSync(parent, { recursive: true });
  const base = fs.realpathSync(parent);
  for (let n = 1; n < 1000; n++) {
    const candidate = path.join(base, n === 1 ? slug : `${slug}-${n}`);
    try {
      fs.mkdirSync(candidate); // New folders only; never replace existing work.
      return candidate;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
  }
  throw new Error(`Could not allocate a fresh workspace folder for ${slug}`);
}

export function createWorkspace(
  parent: string,
  item: Project,
  mode: AssistantMode,
): string {
  const slug = workspaceSlug(item);
  // Build and validate everything first so bad content never creates a folder.
  const files = workspaceFiles(item, mode);
  const folder = allocateFreshFolder(parent, slug);
  try {
    writeWorkspaceFiles(folder, files);
  } catch (error) {
    fs.rmSync(folder, { recursive: true, force: true });
    throw error;
  }
  return folder;
}

export function createBlankProject(
  parent: string,
  options: {
    slug: string;
    title: string;
    mode: AssistantMode;
    language: ProjectLanguage;
    goal?: string;
  },
): string {
  const files = blankProjectFiles(options);
  const folder = allocateFreshFolder(parent, options.slug);
  try {
    writeWorkspaceFiles(folder, files);
  } catch (error) {
    fs.rmSync(folder, { recursive: true, force: true });
    throw error;
  }
  return folder;
}

// For attached/existing folders: creates only missing files and never overwrites.
export function addMissingFiles(
  folder: string,
  item: Project,
  mode: AssistantMode,
): AddedFiles {
  return writeWorkspaceFiles(folder, workspaceFiles(item, mode));
}

export function addStandaloneMentorFiles(
  folder: string,
  options: {
    title: string;
    mode: AssistantMode;
    language: ProjectLanguage;
  },
): AddedFiles {
  fs.mkdirSync(folder, { recursive: true });
  return writeWorkspaceFiles(folder, standaloneMentorFiles(options));
}

