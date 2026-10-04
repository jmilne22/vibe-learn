import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { compileCatalog } from "../../src/content/compile";
import { ProjectSupportFilesSchema } from "../../src/shared/model";
import {
  MINIMUM_CONTENT_APP_VERSION,
  versionAtLeast,
} from "../../src/shared/content-update";
const parse = (name: string) =>
  ProjectSupportFilesSchema.safeParse([{ path: name, contents: "x\n" }]);
describe("project support file names", () => {
  it("accepts plain helper scripts and data", () => {
    for (const name of ["Taskfile.yml", "doctor.py", "setup.sh", "data.json"])
      expect(parse(name).success, name).toBe(true);
  });
  it("rejects names other tools run or load automatically, whatever the case", () => {
    for (const name of ["conftest.py", "Makefile", "package.json", "SETUP.PY", "AGENT.md", "opencode.json"]) {
      const result = parse(name);
      expect(result.success, name).toBe(false);
      expect(result.error?.message, name).toMatch(
        /do not run or load automatically|Use a \.py, \.yml/,
      );
    }
  });
  it("rejects other extensions and hidden names", () => {
    for (const name of ["run.exe", "script.rb", "pyproject.toml", "Dockerfile"])
      expect(parse(name).error?.message, name).toContain(
        "Use a .py, .yml, .yaml, .md, .txt, .json or .sh project support file",
      );
    for (const name of [".cursorrules", ".env.json"])
      expect(parse(name).error?.message, name).toContain("non-hidden");
  });
});
describe("compiling supplied project files", () => {
  const source = "content/projects/cloud-reporter.html";
  const compileWith = (blocks: string) => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), "vibe-support-files-"));
    try {
      fs.cpSync("content/projects", path.join(base, "content/projects"), {
        recursive: true,
      });
      const original = fs.readFileSync(source, "utf8");
      expect(original).toContain("</main>");
      fs.writeFileSync(
        path.join(base, source),
        original.replace("</main>", `${blocks}</main>`),
      );
      return compileCatalog(base);
    } finally {
      fs.rmSync(base, { recursive: true, force: true });
    }
  };
  it("includes a marked block as a support file", () => {
    const reporter = compileWith(
      '<pre data-workspace-file="notes.txt"><code>hello\n\n</code></pre>',
    ).items.find((i) => i.id === "project:cloud-reporter")!;
    expect(reporter.kind === "project" && reporter.supportFiles).toEqual([
      { path: "notes.txt", contents: "hello\n" },
    ]);
  });
  it("rejects blocks without code or with only whitespace, naming the file and source", () => {
    for (const block of [
      '<pre data-workspace-file="notes.txt">hello</pre>',
      '<pre data-workspace-file="notes.txt"><code></code></pre>',
      '<pre data-workspace-file="notes.txt"><code>  \n\t\n</code></pre>',
    ])
      expect(() => compileWith(block)).toThrow(
        /Supplied file notes\.txt in .*cloud-reporter\.html needs a non-empty <code> block/,
      );
  });
  it("rejects bad and duplicate names", () => {
    expect(() =>
      compileWith('<pre data-workspace-file="conftest.py"><code>x</code></pre>'),
    ).toThrow("do not run or load automatically");
    expect(() =>
      compileWith(
        '<pre data-workspace-file="notes.txt"><code>a</code></pre><pre data-workspace-file="NOTES.txt"><code>b</code></pre>',
      ),
    ).toThrow("Duplicate project support filename");
  });
});
describe("content app version", () => {
  it("ships an app at least as new as the content minimum", () => {
    const pkg = JSON.parse(fs.readFileSync("package.json", "utf8")) as {
      version: string;
    };
    expect(versionAtLeast(pkg.version, MINIMUM_CONTENT_APP_VERSION)).toBe(true);
  });
});
