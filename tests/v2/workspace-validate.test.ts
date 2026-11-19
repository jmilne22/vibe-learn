import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { compileCatalog } from "../../src/content/compile";
import { createBlankProject, createWorkspace } from "../../src/workspace/fs";
import { validateWorkspace } from "../../src/workspace/validate";

const catalog = compileCatalog();
const temps: string[] = [];
const temp = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vibe-validate-"));
  temps.push(dir);
  return dir;
};
afterEach(() => {
  for (const dir of temps.splice(0))
    fs.rmSync(dir, { recursive: true, force: true });
});

describe("validateWorkspace", () => {
  it("passes cleanly for every curated project workspace", () => {
    for (const project of catalog.items) {
      const folder = createWorkspace(temp(), project, "mentor");
      const report = validateWorkspace(folder);
      expect(report.ok, `${project.slug}: ${JSON.stringify(report.issues)}`).toBe(
        true,
      );
      expect(report.stepFiles.length).toBe(project.stages.length - 1);
    }
  });

  it("passes cleanly for a fresh custom project skeleton", () => {
    const folder = createBlankProject(temp(), {
      slug: "mini-dns",
      title: "Mini DNS",
      mode: "mentor",
      language: "go",
    });
    const report = validateWorkspace(folder);
    expect(report.ok).toBe(true);
    expect(report.issues).toEqual([]);
  });

  it("reports missing required files and misaligned step numbers as errors", () => {
    const dir = temp();
    fs.writeFileSync(path.join(dir, "README.md"), "# Demo\n");
    fs.mkdirSync(path.join(dir, "steps"));
    fs.writeFileSync(
      path.join(dir, "steps/05-wrong-number.md"),
      "## Step\n\n1. Spin up a server; check it.\n",
    );
    const report = validateWorkspace(dir);
    expect(report.ok).toBe(false);
    expect(
      report.issues.some(
        (i) => i.severity === "error" && i.file === "AGENTS.md",
      ),
    ).toBe(true);
    expect(
      report.issues.some(
        (i) =>
          i.severity === "error" &&
          i.file === "steps/05-wrong-number.md" &&
          i.message.includes('start with "02-"'),
      ),
    ).toBe(true);
    expect(
      report.issues.some(
        (i) =>
          i.severity === "warning" &&
          i.message.includes("soft phrasal verb"),
      ),
    ).toBe(true);
    expect(
      report.issues.some(
        (i) => i.severity === "warning" && i.message.includes("semicolons"),
      ),
    ).toBe(true);
  });
});

