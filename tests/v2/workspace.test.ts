import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it, expect, vi } from "vitest";
import { compileCatalog } from "../../src/content/compile";
import { htmlToMarkdown } from "../../src/content/markdown-out";
import {
  addMissingFiles,
  createWorkspace,
  workspaceFiles,
} from "../../src/main/workspace";
const catalog = compileCatalog();
const projects = catalog.items.filter((i) => i.kind === "project");
const reporter = catalog.items.find((i) => i.id === "project:cloud-reporter")!;
const operator = catalog.items.find((i) => i.id === "project:relay-operator")!;
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
	fmt.Println("a | b")
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
      expect(readme.startsWith(`# `)).toBe(true);
      steps.forEach((step, index) => {
        expect(step).toMatch(
          new RegExp(`^steps/${String(index + 2).padStart(2, "0")}-`),
        );
        expect(readme).toContain(`](${step})`);
      });
      for (const file of files) expect(file.contents).not.toContain("#/read/");
    },
  );
  it("maps links between stages of the same project to step files", () => {
    const relay = catalog.items.find((i) => i.id === "project:ingest-relay")!;
    const all = workspaceFiles(relay, "pair")
      .map((f) => f.contents)
      .join("\n");
    expect(all).toMatch(
      /\]\((\.\.\/)?(README\.md|steps\/\d\d-[\w-]+\.md|\d\d-[\w-]+\.md)\)/,
    );
  });
  it("blocks assistant edits only in mentor mode", () => {
    const mentor = workspaceFiles(reporter, "mentor");
    const pair = workspaceFiles(reporter, "pair");
    const settings = mentor.find(
      (f) => f.path === ".claude/settings.local.json",
    )!;
    expect(JSON.parse(settings.contents).permissions.deny).toContain("Edit");
    expect(pair.some((f) => f.path.startsWith(".claude/"))).toBe(false);
    const agents = (files: typeof mentor) =>
      files.find((f) => f.path === "AGENTS.md")!.contents;
    expect(agents(mentor)).toContain(
      "you never write or edit my project files",
    );
    expect(agents(pair)).toContain("wait for my OK");
    for (const files of [mentor, pair]) {
      expect(agents(files)).toContain(
        "If I haven't said which step I'm on, ask.",
      );
      expect(files.find((f) => f.path === "CLAUDE.md")!.contents).toBe(
        "@AGENTS.md\n",
      );
    }
  });
});
describe("creating and extending workspaces", () => {
  it("creates a new named folder each time and never reuses one", () => {
    const parent = temp();
    const first = createWorkspace(parent, reporter, "mentor");
    const second = createWorkspace(parent, reporter, "pair");
    expect(path.basename(first)).toBe("cloud-reporter");
    expect(path.basename(second)).toBe("cloud-reporter-2");
    expect(fs.readFileSync(path.join(first, "go.mod"), "utf8")).toContain(
      "module example.com/cloud-reporter",
    );
    expect(
      fs.readFileSync(path.join(first, "steps/02-fetch-page.md"), "utf8"),
    ).toContain("## Fetch one page");
    expect(fs.existsSync(path.join(first, ".claude/settings.local.json"))).toBe(
      true,
    );
    expect(fs.existsSync(path.join(second, ".claude"))).toBe(false);
  });
  it("only writes go.mod for projects with checks", () => {
    const folder = createWorkspace(temp(), operator, "mentor");
    expect(operator.checks).toEqual([]);
    expect(fs.existsSync(path.join(folder, "go.mod"))).toBe(false);
    expect(fs.existsSync(path.join(folder, "AGENTS.md"))).toBe(true);
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
  it("adds only missing files to an attached folder", () => {
    const folder = temp();
    fs.writeFileSync(path.join(folder, "README.md"), "mine\n");
    fs.writeFileSync(path.join(folder, "main.go"), "package main\n");
    const result = addMissingFiles(folder, reporter, "mentor");
    expect(result.skipped).toEqual(["README.md"]);
    expect(result.written).toContain("AGENTS.md");
    expect(result.written).toContain("steps/02-fetch-page.md");
    expect(result.written).not.toContain("go.mod");
    expect(fs.readFileSync(path.join(folder, "README.md"), "utf8")).toBe(
      "mine\n",
    );
    expect(fs.existsSync(path.join(folder, "go.mod"))).toBe(false);
    const again = addMissingFiles(folder, reporter, "pair");
    expect(again.written).toEqual([]);
  });
});
