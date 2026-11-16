import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it, expect } from "vitest";
import { load } from "cheerio";
import { compileCatalog } from "../../src/content/compile";
import { validateDownloadedCatalog } from "../../src/content/validate-catalog";
import { createWorkspace } from "../../src/main/workspace";
const catalog = compileCatalog();
const find = (id: string) => catalog.items.find((i) => i.id === id)!;
const python = find("project:cloud-reporter-python");
const go = find("project:cloud-reporter");
const temps: string[] = [];
afterEach(() => {
  for (const dir of temps.splice(0))
    fs.rmSync(dir, { recursive: true, force: true });
});
describe("Cloud Resource Reporter in Python", () => {
  it("is a guided Python project with the stages of the Go reporter", () => {
    expect(python.kind === "project" && python.language).toBe("python");
    expect(go.kind === "project" && go.language).toBeUndefined();
    expect(python.title).toBe("Cloud Resource Reporter (Python)");
    expect(python.stages.map((s) => s.id)).toEqual(go.stages.map((s) => s.id));
    // The app has no pytest runner, so it registers no checks.
    expect(python.checks).toEqual([]);
    expect(python.prerequisites.join(" ")).toMatch(/Python 3\.11.*uv.*pytest/);
    const downloaded = validateDownloadedCatalog(JSON.stringify(catalog))
      .items.find((i) => i.id === python.id)!;
    expect(downloaded.kind === "project" && downloaded.language).toBe("python");
  });
  it("keeps the report contract of the Go brief and names no Go tools", () => {
    const blocks = (item: typeof go, stageId: string) =>
      load(item.stages.find((s) => s.id === stageId)!.html)("pre code")
        .toArray()
        .map((el) => load(el).text());
    // The dataset and the table, JSON and CSV examples are one shared contract.
    for (const stageId of ["aggregate", "formats"])
      expect(blocks(python, stageId), stageId).toEqual(blocks(go, stageId));
    expect(blocks(python, "formats")).toHaveLength(3);
    for (const stage of python.stages) {
      expect(stage.text, stage.id).not.toMatch(
        /\bgo (build|vet|test|mod|run)\b|go\.mod|net\/http|httptest|tabwriter|encoding\/csv|\*string|time\.Time/,
      );
    }
    expect(python.stages.at(-1)!.text).toContain("uv run pytest -q");
    expect(python.stages[0]!.text).toContain(
      "Vibe Learn has no automated checker for this project.",
    );
  });
  it("creates a workspace with Python helpers, Python assistant instructions and no Go module", () => {
    const parent = fs.mkdtempSync(path.join(os.tmpdir(), "vibe-py-reporter-"));
    temps.push(parent);
    const folder = createWorkspace(parent, python, "mentor");
    const read = (name: string) =>
      fs.readFileSync(path.join(folder, name), "utf8");
    expect(path.basename(folder)).toBe("cloud-reporter-python");
    expect(read("Taskfile.yml")).toContain("python3 doctor.py");
    expect(read("Taskfile.yml")).toContain("uv run pytest -q");
    expect(read("doctor.py")).toContain("def main(argv=None");
    expect(read("README.md")).toContain("- `Taskfile.yml`\n- `doctor.py`");
    expect(read("steps/02-fetch-page.md")).toContain("## Fetch one page");
    expect(read("MENTOR-NOTES.md")).toContain("- **Weak spots to revisit**");
    expect(read("AGENTS.md")).toContain("(for Python: `uv run pytest -q`)");
    expect(read("AGENTS.md")).toContain("docs.python.org");
    expect(read("AGENTS.md")).not.toMatch(/go (build|vet|test)|go\.dev/);
    // The learner creates the project and the implementation.
    for (const name of ["go.mod", "pyproject.toml", "src", "tests"])
      expect(fs.existsSync(path.join(folder, name)), name).toBe(false);
  });
  it("supplies a doctor that passes its fixture and changes nothing", () => {
    const doctor =
      python.kind === "project" &&
      python.supportFiles?.find((f) => f.path === "doctor.py");
    expect(doctor).toBeTruthy();
    const result = execFileSync(
      "python3",
      ["tests/v2/fixtures/reporter_doctor_test.py"],
      { input: (doctor as { contents: string }).contents, timeout: 30000, stdio: ["pipe", "pipe", "pipe"] },
    );
    expect(result.toString()).toBe("");
  });
});
