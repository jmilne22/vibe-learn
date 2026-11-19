import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { compileCatalog } from "../../src/content/compile";
import { runCli } from "../../src/cli/index";

const temps: string[] = [];
const temp = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vibe-cli-"));
  temps.push(dir);
  return dir;
};

beforeAll(() => {
  // Ensure build/content/catalog.json exists before CLI list/init tests.
  const catalog = compileCatalog();
  fs.mkdirSync("build/content", { recursive: true });
  fs.writeFileSync("build/content/catalog.json", JSON.stringify(catalog));
});

afterEach(() => {
  for (const dir of temps.splice(0))
    fs.rmSync(dir, { recursive: true, force: true });
  delete process.env.VIBE_HOME;
  vi.restoreAllMocks();
});

function capture(args: string[]): { code: number; out: string; err: string } {
  const out: string[] = [];
  const err: string[] = [];
  const logSpy = vi
    .spyOn(console, "log")
    .mockImplementation((...a) => out.push(a.join(" ")));
  const errSpy = vi
    .spyOn(console, "error")
    .mockImplementation((...a) => err.push(a.join(" ")));
  try {
    const code = runCli(args);
    return { code, out: out.join("\n"), err: err.join("\n") };
  } finally {
    logSpy.mockRestore();
    errSpy.mockRestore();
  }
}

describe("vibe-learn CLI", () => {
  it("lists curated projects and initializes a validated workspace", () => {
    const listed = capture(["list"]);
    expect(listed.code).toBe(0);
    expect(listed.out).toContain("kubernetes-admission-lab");
    expect(listed.out).toContain("ingest-relay");

    const parent = temp();
    const init = capture(["init", "cloud-reporter", parent, "--mode", "mentor"]);
    expect(init.code).toBe(0);
    const created = path.join(parent, "cloud-reporter");
    expect(fs.existsSync(path.join(created, "AGENTS.md"))).toBe(true);
    expect(
      fs.existsSync(path.join(created, ".claude/settings.local.json")),
    ).toBe(true);

    const validated = capture(["validate", created]);
    expect(validated.code).toBe(0);
    expect(validated.out).toContain("Valid workspace");
  });

  it("creates a custom project skeleton and attaches mentor files to an existing repo", () => {
    const parent = temp();
    const created = capture([
      "new",
      "mini-proxy",
      parent,
      "--lang",
      "rust",
      "--mode",
      "mentor",
    ]);
    expect(created.code).toBe(0);
    expect(created.out).toContain("vibe-learn validate");
    const folder = path.join(parent, "mini-proxy");
    expect(fs.readFileSync(path.join(folder, "AGENTS.md"), "utf8")).toContain(
      "cargo test",
    );
    expect(capture(["validate", folder]).code).toBe(0);

    const existing = temp();
    fs.writeFileSync(path.join(existing, "main.py"), "print(1)\n");
    const mentor = capture(["mentor", existing, "--lang", "python"]);
    expect(mentor.code).toBe(0);
    expect(fs.existsSync(path.join(existing, "MENTOR-NOTES.md"))).toBe(true);
    expect(fs.readFileSync(path.join(existing, "main.py"), "utf8")).toBe(
      "print(1)\n",
    );
  });

  it("initializes learner profile and installs the agent skill", () => {
    const fakeHome = temp();
    process.env.VIBE_HOME = fakeHome;

    const initProfile = capture(["profile", "--init"]);
    expect(initProfile.code).toBe(0);
    const profileFile = path.join(fakeHome, ".vibe-learn/profile.md");
    expect(fs.existsSync(profileFile)).toBe(true);
    expect(fs.readFileSync(profileFile, "utf8")).toContain(
      "Vibe Learn Learner Profile",
    );

    const install = capture(["install-skill", "--target", "claude"]);
    expect(install.code).toBe(0);
    const skillDest = path.join(fakeHome, ".claude/skills/vibe-learn");
    expect(fs.existsSync(path.join(skillDest, "SKILL.md"))).toBe(true);
    expect(
      fs.existsSync(path.join(skillDest, "references/design-project.md")),
    ).toBe(true);

    // Refuses overwrite without --force, succeeds with --force
    expect(capture(["install-skill", "--target", "claude"]).code).toBe(1);
    expect(
      capture(["install-skill", "--target", "claude", "--force"]).code,
    ).toBe(0);
  });
});

