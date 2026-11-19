import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const script = path.resolve("skills/vibe-learn/scripts/drill.mjs");
const temps: string[] = [];

function tempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vibe-drill-test-"));
  temps.push(dir);
  return dir;
}

function git(args: string[], cwd: string): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "Test",
      GIT_AUTHOR_EMAIL: "test@example.com",
      GIT_COMMITTER_NAME: "Test",
      GIT_COMMITTER_EMAIL: "test@example.com",
    },
  }).trimEnd();
}

function runDrill(
  args: string[],
  cwd: string,
): { ok: boolean; out: string; err: string } {
  try {
    const out = execFileSync(process.execPath, [script, ...args], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { ok: true, out, err: "" };
  } catch (error) {
    const e = error as { stdout?: string; stderr?: string };
    return { ok: false, out: String(e.stdout || ""), err: String(e.stderr || "") };
  }
}

function initRepo(): string {
  const dir = tempDir();
  git(["init", "-b", "main"], dir);
  fs.writeFileSync(path.join(dir, "app.js"), "export const add = (a, b) => a + b;\n");
  git(["add", "app.js"], dir);
  git(["commit", "-m", "initial"], dir);
  return dir;
}

afterEach(() => {
  for (const dir of temps.splice(0))
    fs.rmSync(dir, { recursive: true, force: true });
});

describe("skills/vibe-learn/scripts/drill.mjs", () => {
  it("refuses to start outside a git repo or on a dirty working tree", () => {
    const nonGit = tempDir();
    const res1 = runDrill(["start"], nonGit);
    expect(res1.ok).toBe(false);
    expect(res1.err).toContain("Not inside a git repository");

    const repo = initRepo();
    fs.writeFileSync(path.join(repo, "app.js"), "export const add = (a, b) => a - b;\n");
    const res2 = runDrill(["start"], repo);
    expect(res2.ok).toBe(false);
    expect(res2.err).toContain("uncommitted changes");
  });

  it("runs the full start -> seal -> status -> reveal -> cleanup lifecycle cleanly", () => {
    const repo = initRepo();
    const baseCommit = git(["rev-parse", "HEAD"], repo);

    // 1. Start creates a disposable branch and keeps working tree clean
    const start = runDrill(["start", "--name", "off-by-one"], repo);
    expect(start.ok, start.err).toBe(true);
    const drillBranch = git(["symbolic-ref", "--short", "HEAD"], repo);
    expect(drillBranch).toMatch(/^vibe-drill\/\d{8}-\d{6}-off-by-one$/);
    expect(git(["status", "--porcelain"], repo)).toBe("");

    // Refuses a second start while active
    const secondStart = runDrill(["start"], repo);
    expect(secondStart.ok).toBe(false);
    expect(secondStart.err).toContain("already active");

    // Seal refuses when no bug has been injected yet
    const emptySeal = runDrill(
      ["seal", "--symptom", "add fails", "--verify", "node -e 'process.exit(1)'"],
      repo,
    );
    expect(emptySeal.ok).toBe(false);
    expect(emptySeal.err).toContain("No changes found");

    // 2. Inject bug and seal so git diff is clean (no spoiler)
    fs.writeFileSync(path.join(repo, "app.js"), "export const add = (a, b) => a + b + 1;\n");
    const seal = runDrill(
      ["seal", "--symptom", "add(2, 2) returns 5 instead of 4", "--verify", "npm test"],
      repo,
    );
    expect(seal.ok, seal.err).toBe(true);
    expect(git(["status", "--porcelain"], repo)).toBe("");
    expect(git(["diff"], repo)).toBe("");

    // 3. Status reports active drill metadata
    const status = runDrill(["status", "--json"], repo);
    expect(status.ok, status.err).toBe(true);
    const parsed = JSON.parse(status.out) as {
      active: boolean;
      dirty: boolean;
      status: string;
      baseBranch: string;
      symptom: string;
      verifyCmd: string;
    };
    expect(parsed.active).toBe(true);
    expect(parsed.dirty).toBe(false);
    expect(parsed.status).toBe("active");
    expect(parsed.baseBranch).toBe("main");
    expect(parsed.symptom).toContain("returns 5");
    expect(parsed.verifyCmd).toBe("npm test");

    // 4. Learner fixes the bug locally; reveal shows both fault and learner fix
    fs.writeFileSync(path.join(repo, "app.js"), "export const add = (a, b) => a + b;\n");
    const reveal = runDrill(["reveal"], repo);
    expect(reveal.ok, reveal.err).toBe(true);
    expect(reveal.out).toContain("=== Injected fault ===");
    expect(reveal.out).toContain("a + b + 1");
    expect(reveal.out).toContain("=== Learner fix ===");

    // 5. Cleanup refuses without --force when local edits exist, then restores cleanly with --force
    const blockedCleanup = runDrill(["cleanup"], repo);
    expect(blockedCleanup.ok).toBe(false);
    expect(blockedCleanup.err).toContain("--force");

    const cleanup = runDrill(["cleanup", "--force"], repo);
    expect(cleanup.ok, cleanup.err).toBe(true);
    expect(git(["symbolic-ref", "--short", "HEAD"], repo)).toBe("main");
    expect(git(["rev-parse", "HEAD"], repo)).toBe(baseCommit);
    expect(git(["branch", "--list", drillBranch], repo)).toBe("");
    expect(fs.readFileSync(path.join(repo, "app.js"), "utf8")).toBe(
      "export const add = (a, b) => a + b;\n",
    );
    expect(runDrill(["status"], repo).out).toContain("No active drill.");
  });

  it("handles detached HEAD repositories cleanly on start and cleanup", () => {
    const repo = initRepo();
    const baseCommit = git(["rev-parse", "HEAD"], repo);
    git(["checkout", "--detach", baseCommit], repo);

    const start = runDrill(["start", "--name", "detached"], repo);
    expect(start.ok, start.err).toBe(true);
    const cleanup = runDrill(["cleanup"], repo);
    expect(cleanup.ok, cleanup.err).toBe(true);
    expect(git(["rev-parse", "HEAD"], repo)).toBe(baseCommit);
  });
});

