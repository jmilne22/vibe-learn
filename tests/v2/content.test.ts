import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { compileCatalog } from "../../src/content/compile";
import { markdown } from "../../src/content/render";
import { load } from "cheerio";
const catalog = compileCatalog();
describe("content compatibility and independent paths", () => {
  it("ships the course alongside four independent projects, with optional experiments inside the relay", () => {
    expect(catalog.items.map((i) => i.id)).toEqual([
      "course:go-infrastructure",
      "project:ingest-relay",
      "project:relay-operator",
      "project:gossip-glomers",
      "project:tiny-tsdb",
    ]);
    expect(
      catalog.items.find((i) => i.id === "project:ingest-relay")!.stages,
    ).toHaveLength(9);
    expect(
      catalog.items.find((i) => i.id === "project:gossip-glomers")!.stages,
    ).toHaveLength(15);
    expect(
      catalog.items.find((i) => i.id === "project:relay-operator")!.checks,
    ).toEqual([]);
    expect(
      catalog.items.find((i) => i.id === "project:relay-operator")!
        .prerequisites[0],
    ).toContain("Relay");
  });
  it("resolves every generated internal route and preserves project requirement anchors", () => {
    for (const item of catalog.items)
      for (const stage of item.stages) {
        const $ = load(stage.html);
        $('a[href^="#/read/"]').each((_, el) => {
          const href = $(el).attr("href")!;
          const [itemId, stageId] = href
            .slice("#/read/".length)
            .split("?")[0]!
            .split("/")
            .map(decodeURIComponent);
          expect(
            catalog.items
              .find((i) => i.id === itemId)
              ?.stages.some((s) => s.id === stageId),
            href,
          ).toBe(true);
        });
        expect($("script, input, button, iframe")).toHaveLength(0);
      }
    const operator = catalog.items.find(
      (i) => i.id === "project:relay-operator",
    )!;
    expect(operator.stages.map((s) => s.html).join("")).toContain('id="REC-7"');
  });
  it("can compile a new Markdown course without any retired course content", () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), "vibe-content-"));
    try {
      fs.cpSync("content/projects", path.join(base, "content/projects"), {
        recursive: true,
      });
      const dir = path.join(base, "courses/new-course");
      fs.mkdirSync(path.join(dir, "content/lessons"), { recursive: true });
      fs.mkdirSync(path.join(dir, "content/assets"), { recursive: true });
      fs.writeFileSync(
        path.join(dir, "course.yaml"),
        "course:\n  name: New course\n  slug: new-course\nmodules:\n  - id: intro\n    title: Introduction\n",
      );
      fs.writeFileSync(
        path.join(dir, "content/lessons/moduleintro.md"),
        "## Introduction\n\n![Diagram](diagram.svg)\n\n<details><summary>Hint</summary>Try a smaller example.</details>",
      );
      fs.writeFileSync(
        path.join(dir, "content/assets/diagram.svg"),
        '<svg xmlns="http://www.w3.org/2000/svg"/>',
      );
      const course = compileCatalog(base).items.find(
        (i) => i.id === "course:new-course",
      )!;
      expect(course.stages[0]?.html).toContain("data:image/svg+xml;base64,");
      expect(course.stages[0]?.html).toContain("<summary>Hint</summary>");
      expect(course.checks).toEqual([]);
    } finally {
      fs.rmSync(base, { recursive: true, force: true });
    }
  });
  it("preserves prediction interactions while removing scripts and dangerous links", () => {
    const result = markdown(
      '<predict prompt="Predict">\n```go\nfmt.Println(2)\n```\n```\n2\n```\n</predict>\n<script>alert(1)</script>\n<a href="javascript:alert(1)">bad</a>',
    );
    expect(result).toContain("<details>");
    expect(result).toContain("fmt.Println");
    expect(result).not.toContain("javascript:");
    expect(result).not.toContain("<script");
  });
});
