#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

function git(args, cwd, extraEnv = {}) {
  try {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, ...extraEnv },
    }).trimEnd();
  } catch (error) {
    const stderr =
      error && typeof error === "object" && "stderr" in error
        ? String(error.stderr || "").trim()
        : "";
    throw new Error(stderr || `git ${args.join(" ")} failed`);
  }
}

function tryGit(args, cwd) {
  try {
    return git(args, cwd);
  } catch {
    return null;
  }
}

function ensureRepo(cwd) {
  const top = tryGit(["rev-parse", "--show-toplevel"], cwd);
  if (!top) {
    throw new Error(
      "Not inside a git repository. Initialize git and make a baseline commit before starting a drill.",
    );
  }
  const head = tryGit(["rev-parse", "--verify", "HEAD"], top);
  if (!head) {
    throw new Error(
      "Repository has no commits yet. Make a baseline commit before starting a drill.",
    );
  }
  const statePath = path.resolve(
    top,
    git(["rev-parse", "--git-path", "vibe-drill.json"], top),
  );
  return { root: top, head, statePath };
}

function readState(statePath) {
  if (!fs.existsSync(statePath)) return null;
  return JSON.parse(fs.readFileSync(statePath, "utf8"));
}

function writeState(statePath, state) {
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2) + "\n", "utf8");
}

function isDirty(cwd) {
  return git(["status", "--porcelain"], cwd).length > 0;
}

function safeSlug(raw) {
  return (
    String(raw || "fault")
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 32) || "fault"
  );
}

function timestamp() {
  const now = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${now.getUTCFullYear()}${p(now.getUTCMonth() + 1)}${p(now.getUTCDate())}-${p(now.getUTCHours())}${p(now.getUTCMinutes())}${p(now.getUTCSeconds())}`;
}

function printHelp() {
  console.log(`Vibe Learn Fault Drill Helper

Usage:
  drill.mjs start [--name <slug>] [--cwd <dir>]
  drill.mjs seal --symptom "<text>" --verify "<cmd>" [--cwd <dir>]
  drill.mjs status [--json] [--cwd <dir>]
  drill.mjs reveal [--cwd <dir>]
  drill.mjs cleanup [--force] [--keep-branch] [--cwd <dir>]
`);
}

function main(argv) {
  const [command, ...rest] = argv;
  if (!command || command === "-h" || command === "--help" || command === "help") {
    printHelp();
    return 0;
  }

  switch (command) {
    case "start": {
      const { values } = parseArgs({
        args: rest,
        options: {
          name: { type: "string", default: "fault" },
          cwd: { type: "string" },
        },
      });
      const cwd = values.cwd ? path.resolve(values.cwd) : process.cwd();
      const { root, head, statePath } = ensureRepo(cwd);
      const existing = readState(statePath);
      if (existing) {
        throw new Error(
          `A drill is already active on branch "${existing.drillBranch}". Finish or run \`drill.mjs cleanup\` first.`,
        );
      }
      if (isDirty(root)) {
        throw new Error(
          "Working tree has uncommitted changes. Commit or stash your work before starting a drill.",
        );
      }
      const baseBranch = tryGit(["symbolic-ref", "--quiet", "--short", "HEAD"], root);
      const slug = safeSlug(values.name);
      const drillBranch = `vibe-drill/${timestamp()}-${slug}`;
      git(["checkout", "-b", drillBranch], root);
      const state = {
        version: 1,
        status: "injecting",
        baseBranch,
        baseCommit: head,
        drillBranch,
        startedAt: new Date().toISOString(),
      };
      writeState(statePath, state);
      console.log(
        `Started drill branch "${drillBranch}" from ${baseBranch || head.slice(0, 7)}.`,
      );
      console.log(
        "Inject one realistic compiling bug, verify it fails, then run `drill.mjs seal`.",
      );
      return 0;
    }

    case "seal": {
      const { values } = parseArgs({
        args: rest,
        options: {
          symptom: { type: "string" },
          verify: { type: "string" },
          cwd: { type: "string" },
        },
      });
      if (!values.symptom || !values.verify) {
        throw new Error(
          'Usage: drill.mjs seal --symptom "<observable symptom>" --verify "<command>"',
        );
      }
      const cwd = values.cwd ? path.resolve(values.cwd) : process.cwd();
      const { root, statePath } = ensureRepo(cwd);
      const state = readState(statePath);
      if (!state) {
        throw new Error("No active drill. Run `drill.mjs start` first.");
      }
      if (state.status !== "injecting") {
        throw new Error(
          `Drill "${state.drillBranch}" is already sealed (status: ${state.status}).`,
        );
      }
      const currentBranch = tryGit(
        ["symbolic-ref", "--quiet", "--short", "HEAD"],
        root,
      );
      if (currentBranch !== state.drillBranch) {
        throw new Error(
          `Expected branch "${state.drillBranch}", found "${currentBranch || "detached HEAD"}".`,
        );
      }
      if (!isDirty(root)) {
        throw new Error(
          "No changes found to seal. Inject the fault before running `drill.mjs seal`.",
        );
      }
      git(["add", "-A"], root);
      git(
        [
          "-c",
          "user.name=vibe-learn",
          "-c",
          "user.email=drill@vibe-learn.local",
          "commit",
          "--no-verify",
          "-m",
          "vibe-drill: broken state",
        ],
        root,
      );
      const faultCommit = git(["rev-parse", "HEAD"], root);
      const updated = {
        ...state,
        status: "active",
        faultCommit,
        symptom: values.symptom,
        verifyCmd: values.verify,
        sealedAt: new Date().toISOString(),
      };
      writeState(statePath, updated);
      console.log(`Sealed drill on "${state.drillBranch}" (${faultCommit.slice(0, 7)}).`);
      console.log(`Symptom: ${values.symptom}`);
      console.log(`Verify:  ${values.verify}`);
      return 0;
    }

    case "status": {
      const { values } = parseArgs({
        args: rest,
        options: {
          json: { type: "boolean", default: false },
          cwd: { type: "string" },
        },
      });
      const cwd = values.cwd ? path.resolve(values.cwd) : process.cwd();
      const { root, statePath } = ensureRepo(cwd);
      const state = readState(statePath);
      if (!state) {
        if (values.json) console.log(JSON.stringify({ active: false }));
        else console.log("No active drill.");
        return 0;
      }
      const dirty = isDirty(root);
      const payload = { active: true, dirty, ...state };
      if (values.json) {
        console.log(JSON.stringify(payload, null, 2));
      } else {
        console.log(`Drill branch: ${state.drillBranch}`);
        console.log(`Base:         ${state.baseBranch || state.baseCommit}`);
        console.log(`Status:       ${state.status}`);
        if (state.symptom) console.log(`Symptom:      ${state.symptom}`);
        if (state.verifyCmd) console.log(`Verify:       ${state.verifyCmd}`);
        console.log(`Local edits:  ${dirty ? "yes" : "no"}`);
      }
      return 0;
    }

    case "reveal": {
      const { values } = parseArgs({
        args: rest,
        options: {
          cwd: { type: "string" },
        },
      });
      const cwd = values.cwd ? path.resolve(values.cwd) : process.cwd();
      const { root, statePath } = ensureRepo(cwd);
      const state = readState(statePath);
      if (!state || !state.faultCommit) {
        throw new Error("No sealed drill to reveal.");
      }
      const faultDiff = git(
        ["diff", `${state.baseCommit}..${state.faultCommit}`],
        root,
      );
      console.log("=== Injected fault ===");
      console.log(faultDiff || "(empty diff)");
      const fixDiff = git(["diff", state.faultCommit], root);
      if (fixDiff) {
        console.log("\n=== Learner fix ===");
        console.log(fixDiff);
      }
      return 0;
    }

    case "cleanup": {
      const { values } = parseArgs({
        args: rest,
        options: {
          force: { type: "boolean", default: false },
          "keep-branch": { type: "boolean", default: false },
          cwd: { type: "string" },
        },
      });
      const cwd = values.cwd ? path.resolve(values.cwd) : process.cwd();
      const { root, statePath } = ensureRepo(cwd);
      const state = readState(statePath);
      if (!state) {
        console.log("No active drill to clean up.");
        return 0;
      }
      if (isDirty(root)) {
        if (!values.force) {
          throw new Error(
            "Uncommitted edits exist on the drill branch. Save any tests you want to keep, or re-run with `--force` to discard drill edits and restore your original branch.",
          );
        }
        git(["reset", "--hard", "HEAD"], root);
      }
      if (state.baseBranch) {
        git(["checkout", state.baseBranch], root);
      } else {
        git(["checkout", "--detach", state.baseCommit], root);
      }
      if (!values["keep-branch"]) {
        git(["branch", "-D", state.drillBranch], root);
      }
      fs.rmSync(statePath, { force: true });
      console.log(
        `Restored ${state.baseBranch || state.baseCommit.slice(0, 7)}${values["keep-branch"] ? ` (kept branch "${state.drillBranch}")` : ` and deleted "${state.drillBranch}"`}.`,
      );
      return 0;
    }

    default:
      console.error(`Unknown subcommand: ${command}`);
      printHelp();
      return 2;
  }
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

