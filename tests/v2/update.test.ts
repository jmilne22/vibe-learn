import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import {
  UpdateError,
  packagedApp,
  updateCheckout,
} from "../../scripts/update-checkout";

let root: string, origin: string, local: string;
let steps: string[];
const git = (cwd: string, ...args: string[]) =>
  execFileSync(
    "git",
    [
      "-c",
      "user.name=Test",
      "-c",
      "user.email=test@example.com",
      "-c",
      "commit.gpgsign=false",
      ...args,
    ],
    { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  ).trim();
const commit = (cwd: string, file: string, text: string) => {
  fs.writeFileSync(path.join(cwd, file), text);
  git(cwd, "add", file);
  git(cwd, "commit", "-q", "-m", `Change ${file}`);
  return git(cwd, "rev-parse", "HEAD");
};
const update = (rebuild = false) =>
  updateCheckout({
    cwd: local,
    rebuild,
    run: (command, args) => steps.push([command, ...args].join(" ")),
    log: () => {},
  });

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "vibe-update-"));
  origin = path.join(root, "origin");
  local = path.join(root, "local");
  fs.mkdirSync(origin);
  git(origin, "init", "-q", "-b", "main");
  commit(origin, "package.json", JSON.stringify({ productName: "Vibe Learn" }));
  commit(origin, "package-lock.json", "{}");
  git(root, "clone", "-q", origin, local);
  fs.mkdirSync(path.join(local, "node_modules"));
  steps = [];
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe("git checkout updater", () => {
  it("fast-forwards and repackages without reinstalling unchanged dependencies", () => {
    const latest = commit(origin, "README.md", "new");
    const result = update();
    expect(git(local, "rev-parse", "HEAD")).toBe(latest);
    expect(result).toMatchObject({ to: latest, installed: false });
    expect(steps).toEqual(["npm run package:desktop"]);
  });

  it("reinstalls dependencies only when the lockfile changes", () => {
    commit(origin, "package-lock.json", '{"changed":true}');
    expect(update().installed).toBe(true);
    expect(steps).toEqual(["npm ci", "npm run package:desktop"]);
  });

  it("does nothing when the source and packaged app are current", () => {
    fs.mkdirSync(path.dirname(packagedApp(local)), { recursive: true });
    fs.writeFileSync(packagedApp(local), "");
    expect(update().packaged).toBe(false);
    expect(steps).toEqual([]);
    update(true);
    expect(steps).toEqual(["npm run package:desktop"]);
  });

  it("packages when the app has never been built", () => {
    update();
    expect(steps).toEqual(["npm run package:desktop"]);
  });

  it("leaves uncommitted work untouched", () => {
    const before = git(local, "rev-parse", "HEAD");
    commit(origin, "README.md", "new");
    fs.writeFileSync(path.join(local, "package-lock.json"), "edited");
    expect(update).toThrow(UpdateError);
    expect(git(local, "rev-parse", "HEAD")).toBe(before);
    expect(fs.readFileSync(path.join(local, "package-lock.json"), "utf8")).toBe(
      "edited",
    );
    expect(steps).toEqual([]);
  });

  it("refuses to rewrite local commits or branches without an upstream", () => {
    commit(origin, "README.md", "remote");
    const mine = commit(local, "NOTES.md", "local");
    expect(update).toThrow(/not on origin\/main/);
    expect(git(local, "rev-parse", "HEAD")).toBe(mine);
    git(local, "switch", "-q", "-c", "experiment");
    expect(update).toThrow(/does not track a remote branch/);
    expect(steps).toEqual([]);
  });
});
