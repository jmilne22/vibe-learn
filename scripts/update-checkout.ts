import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

export type Run = (command: string, args: string[], cwd: string) => void;
export interface UpdateOptions {
  cwd: string;
  rebuild?: boolean;
  run?: Run;
  log?: (message: string) => void;
}
export interface UpdateResult {
  from: string;
  to: string;
  installed: boolean;
  packaged: boolean;
  app: string;
}
export class UpdateError extends Error {}

/**
 * Fast-forward a clean checkout to its upstream, reinstall dependencies only
 * when the lockfile changed, and repackage the desktop app in place. Learner
 * profiles live outside the checkout and are never touched.
 */
export function updateCheckout(options: UpdateOptions): UpdateResult {
  const { cwd } = options;
  const run = options.run ?? runInherited;
  const log = options.log ?? console.log;
  if (git(cwd, "status", "--porcelain", "--untracked-files=no"))
    throw new UpdateError(
      "This checkout has uncommitted changes. Commit or stash them, then update again. Nothing was changed.",
    );
  let upstream: string;
  try {
    upstream = git(cwd, "rev-parse", "--abbrev-ref", "@{upstream}");
  } catch {
    throw new UpdateError(
      "The current branch does not track a remote branch. Check out main and try again. Nothing was changed.",
    );
  }
  const from = git(cwd, "rev-parse", "HEAD");
  log(`Fetching ${upstream}…`);
  git(cwd, "fetch", "--quiet");
  if (git(cwd, "rev-parse", "@{upstream}") !== from) {
    try {
      git(cwd, "merge", "--ff-only", "--quiet", "@{upstream}");
    } catch {
      throw new UpdateError(
        `This branch has commits that are not on ${upstream}, or the update would overwrite untracked files. Update it manually. Nothing was changed.`,
      );
    }
  }
  const to = git(cwd, "rev-parse", "HEAD");
  const changed =
    from === to
      ? []
      : git(cwd, "diff", "--name-only", from, to).split("\n").filter(Boolean);
  const app = packagedApp(cwd);
  const installed =
    changed.includes("package-lock.json") ||
    !fs.existsSync(path.join(cwd, "node_modules"));
  const packaged =
    installed || from !== to || !!options.rebuild || !fs.existsSync(app);
  if (from === to) log(`Already at the latest ${upstream} (${short(to)}).`);
  else log(`Updated ${short(from)} → ${short(to)} (${changed.length} files).`);
  if (installed) run(npm, ["ci"], cwd);
  if (packaged) run(npm, ["run", "package:desktop"], cwd);
  else
    log(
      "The packaged app is current. Use npm run update:app -- --rebuild to package it again.",
    );
  return { from, to, installed, packaged, app };
}

/** Forge writes to the same folder every time, so shortcuts keep working. */
export function packagedApp(cwd: string): string {
  const { productName } = JSON.parse(
    fs.readFileSync(path.join(cwd, "package.json"), "utf8"),
  ) as { productName: string };
  const dir = path.join(
    cwd,
    "out",
    `${productName}-${process.platform}-${process.arch}`,
  );
  if (process.platform === "darwin")
    return path.join(dir, `${productName}.app`);
  return path.join(
    dir,
    process.platform === "win32" ? "vibe-learn.exe" : "vibe-learn",
  );
}

const npm = "npm";
const short = (sha: string) => sha.slice(0, 7);
const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
function runInherited(command: string, args: string[], cwd: string): void {
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.status !== 0)
    throw new UpdateError(
      `${command} ${args.join(" ")} failed. The source is already updated; fix the error, then run npm ci and npm run update:app -- --rebuild.`,
    );
}
