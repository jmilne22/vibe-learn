import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const script = path.resolve("skills/vibe-learn/scripts/memory.mjs");
const temps: string[] = [];

function tempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vibe-memory-test-"));
  temps.push(dir);
  return dir;
}

function runMemory(
  args: string[],
  vibeHome: string,
  cwd = process.cwd(),
): { ok: boolean; out: string; err: string } {
  try {
    const out = execFileSync(process.execPath, [script, ...args], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, VIBE_HOME: vibeHome },
    });
    return { ok: true, out, err: "" };
  } catch (error) {
    const e = error as { stdout?: string; stderr?: string };
    return { ok: false, out: String(e.stdout || ""), err: String(e.stderr || "") };
  }
}

afterEach(() => {
  for (const dir of temps.splice(0))
    fs.rmSync(dir, { recursive: true, force: true });
});

describe("skills/vibe-learn/scripts/memory.mjs", () => {
  it("initializes profile.md and memory.md without overwriting existing edits", () => {
    const home = tempDir();
    const first = runMemory(["init"], home);
    expect(first.ok, first.err).toBe(true);
    const profilePath = path.join(home, ".vibe-learn/profile.md");
    const memoryPath = path.join(home, ".vibe-learn/memory.md");
    expect(fs.existsSync(profilePath)).toBe(true);
    expect(fs.existsSync(memoryPath)).toBe(true);

    fs.writeFileSync(profilePath, "# Custom profile\n", "utf8");
    const second = runMemory(["init"], home);
    expect(second.ok, second.err).toBe(true);
    expect(second.out).toContain("Kept existing:");
    expect(fs.readFileSync(profilePath, "utf8")).toBe("# Custom profile\n");
  });

  it("degrades gracefully when empty and returns compact session context when populated", () => {
    const home = tempDir();
    const project = tempDir();

    const empty = runMemory(["read", "--cwd", project], home);
    expect(empty.ok).toBe(true);
    expect(empty.out).toContain("No global ~/.vibe-learn/ memory");

    runMemory(["init"], home);
    fs.writeFileSync(
      path.join(project, "NOTES.md"),
      "# Notes\n\n- [x] 01 Overview\n- [ ] 02 Build skeleton\n- [ ] 03 Add tests\n",
    );
    fs.writeFileSync(
      path.join(project, "MENTOR-NOTES.md"),
      [
        "# Mentor notes",
        "",
        "## Step 01: 2026-10-01",
        "### Did well",
        "- First step.",
        "",
        "## Step 02: 2026-10-02",
        "### Did well",
        "- Second step.",
        "",
        "## Step 03: 2026-10-03",
        "### Weak spots to revisit",
        "- Third step weak spot.",
      ].join("\n") + "\n",
    );

    const brief = runMemory(["read", "--cwd", project, "--json"], home);
    expect(brief.ok, brief.err).toBe(true);
    const data = JSON.parse(brief.out) as {
      profile: string;
      memory: string;
      local: { nextStep: string; recentMentorSections: string[] };
    };
    expect(data.profile).toContain("Vibe Learn Learner Profile");
    expect(data.memory).toContain("Vibe Learn Cross-Project Memory");
    expect(data.local.nextStep).toBe("02 Build skeleton");
    // Only the latest 2 sections are included to keep context compact.
    expect(data.local.recentMentorSections).toHaveLength(2);
    expect(data.local.recentMentorSections[0]).toContain("Step 02");
    expect(data.local.recentMentorSections[1]).toContain("Step 03");
  });

  it("extracts high-signal sections from MENTOR-NOTES.md and reports bloat warnings in status", () => {
    const home = tempDir();
    runMemory(["init"], home);

    const project = tempDir();
    const notesFile = path.join(project, "MENTOR-NOTES.md");
    fs.writeFileSync(
      notesFile,
      [
        "# Mentor notes",
        "",
        "## Step 01 (Read article): 2026-10-06",
        "### Learner's answers",
        "Long raw transcript that should not dominate distillation.",
        "### Did well",
        "- Got caller direction right.",
        "### Weak spots to revisit",
        "- TLS trust model and SAN verification.",
        "### What frustrated them",
        "- Hard to understand when nothing is running.",
        "### Advice for the next session",
        "- Reuse Python dict analogy.",
      ].join("\n") + "\n",
    );

    const inspected = runMemory(["inspect", notesFile, "--json"], home);
    expect(inspected.ok, inspected.err).toBe(true);
    const parsed = JSON.parse(inspected.out) as {
      stepCount: number;
      steps: { heading: string; subsections: { heading: string; body: string }[] }[];
    };
    expect(parsed.stepCount).toBe(1);
    expect(parsed.steps[0]!.subsections.map((s) => s.heading)).toEqual([
      "Did well",
      "Weak spots to revisit",
      "What frustrated them",
      "Advice for the next session",
    ]);

    // Trigger bloat warning (>120 lines in memory.md)
    const memoryPath = path.join(home, ".vibe-learn/memory.md");
    fs.writeFileSync(
      memoryPath,
      Array.from({ length: 130 }, (_, i) => `- item ${i}`).join("\n") + "\n",
    );
    const status = runMemory(["status", "--json"], home);
    expect(status.ok, status.err).toBe(true);
    const st = JSON.parse(status.out) as {
      memory: { lines: number };
      warnings: string[];
    };
    expect(st.memory.lines).toBe(130);
    expect(st.warnings.some((w) => w.includes("memory.md"))).toBe(true);
  });
});

