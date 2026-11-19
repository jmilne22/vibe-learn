import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it, expect, vi } from "vitest";
import { compileCatalog } from "../../src/content/compile";
import { htmlToMarkdown } from "../../src/content/markdown-out";
import { CatalogSchema } from "../../src/shared/model";
import {
  blankProjectFiles,
  standaloneMentorFiles,
  workspaceFiles,
} from "../../src/workspace/generator";
import {
  addMissingFiles,
  addStandaloneMentorFiles,
  createWorkspace,
} from "../../src/workspace/fs";

const catalog = compileCatalog();
const projects = catalog.items;
const reporter = projects.find((i) => i.id === "project:cloud-reporter")!;
const operator = projects.find((i) => i.id === "project:relay-operator")!;
const pythonProject = { ...operator, language: "python" as const };
const rustProject = { ...operator, language: "rust" as const };
const tsProject = { ...operator, language: "typescript" as const };
const admission = projects.find(
  (i) => i.id === "project:kubernetes-admission-lab",
)!;

const temps: string[] = [];
const temp = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vibe-workspace-"));
  temps.push(dir);
  return dir;
};
afterEach(() => {
  for (const dir of temps.splice(0))
    fs.rmSync(dir, { recursive: true, force: true });
});

describe("stage HTML to Markdown", () => {
  it("keeps code, tables, lists, links and folded hints", () => {
    const md = htmlToMarkdown(
      `<h2>Fetch</h2>
<p>Use <code>net/url</code> and <strong>close</strong> the body. See <a href="https://go.dev">Go</a>, <a href="#/read/x/y">elsewhere</a>.</p>
<pre><code class="language-go">func main() {
\tfmt.Println("a | b")
}</code></pre>
<table><thead><tr><th>Code</th><th>Meaning</th></tr></thead>
<tbody><tr><td>401</td><td>Auth | token</td></tr></tbody></table>
<ul><li>One<ul><li>Nested</li></ul></li><li>Two</li></ul>
<details><summary>Hint: small steps</summary><p>Start with <em>one</em> page.</p></details>`,
    );
    expect(md).toContain("## Fetch");
    expect(md).toContain(
      "Use `net/url` and **close** the body. See [Go](https://go.dev), elsewhere.",
    );
    expect(md).toContain(
      '```go\nfunc main() {\n\tfmt.Println("a | b")\n}\n```',
    );
    expect(md).toContain(
      "| Code | Meaning |\n| --- | --- |\n| 401 | Auth \\| token |",
    );
    expect(md).toContain("- One\n  - Nested\n- Two");
    expect(md).toContain(
      "<details>\n<summary>Hint: small steps</summary>\n\nStart with *one* page.\n\n</details>",
    );
  });
});

describe("project workspace files", () => {
  it.each(projects.map((p) => [p.id, p] as const))(
    "%s gets one step file per stage, numbered like the sidebar",
    (_, item) => {
      const files = workspaceFiles(item, "mentor");
      const paths = files.map((f) => f.path);
      const steps = paths.filter((p) => p.startsWith("steps/"));
      expect(steps).toHaveLength(item.stages.length - 1);
      expect(new Set(paths).size).toBe(paths.length);
      const readme = files.find((f) => f.path === "README.md")!.contents;
      expect(readme.startsWith("# ")).toBe(true);
      steps.forEach((step, index) => {
        expect(step).toMatch(
          new RegExp(`^steps/${String(index + 2).padStart(2, "0")}-`),
        );
        expect(readme).toContain(`](${step})`);
      });
      for (const file of files) expect(file.contents).not.toContain("#/read/");
    },
  );

  it("maps links between stages of the same project to relative step files", () => {
    const relay = projects.find((i) => i.id === "project:ingest-relay")!;
    const all = workspaceFiles(relay, "pair")
      .map((f) => f.contents)
      .join("\n");
    expect(all).toMatch(
      /\]\((\.\.\/)?(README\.md|steps\/\d\d-[\w-]+\.md|\d\d-[\w-]+\.md)\)/,
    );
  });

  it("makes the learner approve assistant edits only in mentor mode and embeds profile & anti-frustration rules", () => {
    const mentor = workspaceFiles(reporter, "mentor");
    const pair = workspaceFiles(reporter, "pair");
    const settings = mentor.find(
      (f) => f.path === ".claude/settings.local.json",
    )!;
    expect(JSON.parse(settings.contents).permissions).toEqual({
      ask: ["Edit", "Write", "NotebookEdit"],
    });
    expect(pair.some((f) => f.path.startsWith(".claude/"))).toBe(false);
    const agents = (files: typeof mentor) =>
      files.find((f) => f.path === "AGENTS.md")!.contents;
    expect(agents(mentor)).toContain(
      "you never write or edit my project files. The only exceptions are NOTES.md and MENTOR-NOTES.md",
    );
    expect(agents(mentor)).toContain("show_edit_predictions");
    expect(agents(pair)).toContain("wait for my OK");
    for (const files of [mentor, pair]) {
      expect(agents(files)).toContain(
        "If I haven't said which step I'm on, ask.",
      );
      expect(agents(files)).toContain("~/.vibe-learn/profile.md");
      expect(agents(files)).toContain("~/.vibe-learn/memory.md");
      expect(files.find((f) => f.path === "CLAUDE.md")!.contents).toBe(
        "@AGENTS.md\n",
      );
      expect(files.find((f) => f.path === "GEMINI.md")!.contents).toBe(
        "@AGENTS.md\n",
      );
      expect(agents(files)).toContain(
        "offer to update it, and write only after I say yes",
      );
      expect(agents(files)).toContain("ask whether to tick it in NOTES.md");
      expect(agents(files)).toContain(
        "One question or one physical action per message.",
      );
      const notes = files.find((f) => f.path === "MENTOR-NOTES.md")!.contents;
      expect(notes).toContain("- **Weak spots to revisit**");
      expect(notes).toContain("don't quote how I expressed frustration");
    }
  });

  it("supports standalone mentor kits and blank custom project skeletons", () => {
    const kit = standaloneMentorFiles({
      title: "My Service",
      mode: "mentor",
      language: "typescript",
    });
    expect(kit.map((f) => f.path).sort()).toEqual([
      ".claude/settings.local.json",
      "AGENTS.md",
      "CLAUDE.md",
      "GEMINI.md",
      "MENTOR-NOTES.md",
      "NOTES.md",
    ]);
    expect(kit.find((f) => f.path === "AGENTS.md")!.contents).toContain(
      "npx tsc --noEmit",
    );

    const blank = blankProjectFiles({
      slug: "mini-raft",
      title: "Mini Raft",
      mode: "mentor",
      language: "rust",
    });
    expect(blank.some((f) => f.path === "README.md")).toBe(true);
    expect(blank.some((f) => f.path === "steps/02-setup-and-skeleton.md")).toBe(
      true,
    );
    expect(blank.find((f) => f.path === "AGENTS.md")!.contents).toContain(
      "cargo test",
    );
  });
});

describe("creating and extending workspaces", () => {
  it("creates supplied helpers but leaves the learner implementation unwritten", () => {
    const folder = createWorkspace(temp(), admission, "mentor");
    expect(
      fs.readFileSync(path.join(folder, "Taskfile.yml"), "utf8"),
    ).toContain("go run doctor.go");
    expect(fs.readFileSync(path.join(folder, "doctor.go"), "utf8")).toContain(
      "func doctorMain(",
    );
    expect(fs.existsSync(path.join(folder, "main.go"))).toBe(false);
    expect(fs.existsSync(path.join(folder, "go.mod"))).toBe(false);
    expect(fs.readFileSync(path.join(folder, "README.md"), "utf8")).toContain(
      "Step 0 — Read the assigned article",
    );
  });

  it("adds absent helpers while preserving edited files and symlink targets", () => {
    const folder = temp();
    fs.writeFileSync(path.join(folder, "Taskfile.yml"), "my tasks\n");
    let result = addMissingFiles(folder, admission, "mentor");
    expect(result.written).toContain("doctor.go");
    expect(result.skipped).toContain("Taskfile.yml");
    expect(fs.readFileSync(path.join(folder, "Taskfile.yml"), "utf8")).toBe(
      "my tasks\n",
    );
    fs.unlinkSync(path.join(folder, "doctor.go"));
    const outside = path.join(temp(), "mine.go");
    fs.writeFileSync(outside, "my doctor\n");
    fs.symlinkSync(outside, path.join(folder, "doctor.go"));
    result = addMissingFiles(folder, admission, "pair");
    expect(result.skipped).toContain("doctor.go");
    expect(result.written).toEqual([]);
    expect(fs.readFileSync(outside, "utf8")).toBe("my doctor\n");
  });

  it("rejects unsafe or conflicting helper names before creating folders", () => {
    const plain = "Use a plain, non-hidden root filename";
    const reserved = "not reserved by the workspace";
    for (const [name, message] of [
      ["../outside.py", plain],
      ["/tmp/out.py", plain],
      ["nested/file.py", plain],
      ["C:\\out.py", plain],
      [".env", plain],
      ["file.", plain],
      ["README.md", reserved],
      ["AGENTS.md", reserved],
      ["MENTOR-NOTES.md", reserved],
      ["go.mod", reserved],
      ["CON.txt", reserved],
      ["conftest.py", "do not run or load automatically"],
      ["run.exe", "Use a .py, .yml"],
    ] as const) {
      const item = {
        ...admission,
        supportFiles: [{ path: name, contents: "bad" }],
      };
      expect(() =>
        CatalogSchema.parse({ formatVersion: 3, items: [item] }),
      ).toThrow(message);
      const parent = temp();
      const mkdir = vi.spyOn(fs, "mkdirSync");
      try {
        expect(() => createWorkspace(parent, item, "mentor")).toThrow(message);
        expect(mkdir).not.toHaveBeenCalled();
      } finally {
        mkdir.mockRestore();
      }
      expect(fs.readdirSync(parent)).toEqual([]);
    }
  });

  it("keeps a learner taskfile under any Task spelling and reports it by its own name", () => {
    const item = {
      ...operator,
      supportFiles: [
        { path: "Taskfile.yml", contents: "version: '3'\n" },
        { path: "doctor.py", contents: "print('ok')\n" },
      ],
    };
    for (const name of ["Taskfile.yaml", "taskfile.dist.yml"]) {
      const folder = temp();
      fs.writeFileSync(path.join(folder, name), "my tasks\n");
      const result = addMissingFiles(folder, item, "mentor");
      expect(result.skipped).toEqual([name]);
      expect(result.written).toContain("doctor.py");
      expect(result.written).not.toContain("Taskfile.yml");
      expect(
        fs.readdirSync(folder).filter((f) => /^taskfile/i.test(f)),
      ).toEqual([name]);
    }
  });

  it("names the commands and documentation of the project's language in AGENTS.md", () => {
    const agents = (item: typeof reporter, mode: "mentor" | "pair") =>
      workspaceFiles(item, mode).find((f) => f.path === "AGENTS.md")!.contents;
    for (const mode of ["mentor", "pair"] as const) {
      expect(agents(pythonProject, mode)).toContain(
        "(for Python: `uv run pytest -q`)",
      );
      expect(agents(rustProject, mode)).toContain("cargo test");
      expect(agents(tsProject, mode)).toContain("npm test");
      expect(agents(reporter, mode)).toContain(
        "(for Go: `go build`, `go vet`, `go test ./...`)",
      );
    }
  });

  it("creates a new named folder each time and never reuses one", () => {
    const parent = temp();
    const first = createWorkspace(parent, reporter, "mentor");
    const second = createWorkspace(parent, reporter, "pair");
    expect(path.basename(first)).toBe("cloud-reporter");
    expect(path.basename(second)).toBe("cloud-reporter-2");
    expect(
      fs.readFileSync(path.join(first, "steps/02-fetch-page.md"), "utf8"),
    ).toContain("## Fetch one page");
    expect(
      fs.existsSync(path.join(first, ".claude/settings.local.json")),
    ).toBe(true);
    expect(fs.existsSync(path.join(second, ".claude"))).toBe(false);
  });

  it("removes a half-created folder when writing fails", () => {
    const parent = temp();
    const write = fs.writeFileSync;
    let calls = 0;
    const spy = vi.spyOn(fs, "writeFileSync").mockImplementation((...args) => {
      if (++calls === 3) throw new Error("disk full");
      return write(...args);
    });
    try {
      expect(() => createWorkspace(parent, reporter, "mentor")).toThrow(
        "disk full",
      );
    } finally {
      spy.mockRestore();
    }
    expect(fs.readdirSync(parent)).toEqual([]);
  });

  it("adds standalone mentor files to an existing repo without overwriting code", () => {
    const repo = temp();
    fs.writeFileSync(path.join(repo, "NOTES.md"), "existing notes\n");
    fs.writeFileSync(path.join(repo, "app.py"), "print('hi')\n");
    const res = addStandaloneMentorFiles(repo, {
      title: "App",
      mode: "mentor",
      language: "python",
    });
    expect(res.skipped).toEqual(["NOTES.md"]);
    expect(res.written).toContain("AGENTS.md");
    expect(res.written).toContain("MENTOR-NOTES.md");
    expect(fs.readFileSync(path.join(repo, "NOTES.md"), "utf8")).toBe(
      "existing notes\n",
    );
    expect(fs.readFileSync(path.join(repo, "app.py"), "utf8")).toBe(
      "print('hi')\n",
    );
  });
});
