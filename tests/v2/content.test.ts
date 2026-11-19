import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { compileCatalog } from "../../src/content/compile";
import { markdown } from "../../src/content/render";
import { load } from "cheerio";

const catalog = compileCatalog();

describe("curated project catalog", () => {
  it("ships six curated projects, with optional Go experiments inside the relay", () => {
    expect(catalog.formatVersion).toBe(3);
    expect(catalog.items.map((i) => i.id)).toEqual([
      "project:ingest-relay",
      "project:relay-operator",
      "project:gossip-glomers",
      "project:tiny-tsdb",
      "project:cloud-reporter",
      "project:kubernetes-admission-lab",
    ]);
    expect(
      catalog.items.find((i) => i.id === "project:ingest-relay")!.stages,
    ).toHaveLength(9);
    expect(
      catalog.items.find((i) => i.id === "project:gossip-glomers")!.stages,
    ).toHaveLength(15);
    expect(
      catalog.items.find((i) => i.id === "project:relay-operator")!
        .prerequisites[0],
    ).toContain("Relay");
  });

  it("keeps cloud-reporter stages and metadata intact", () => {
    const reporter = catalog.items.find(
      (i) => i.id === "project:cloud-reporter",
    )!;
    expect(reporter.slug).toBe("cloud-reporter");
    expect(reporter.language).toBe("go");
    expect(reporter.related).toEqual([]);
    expect(reporter.stages.map((s) => s.id)).toEqual([
      "overview",
      "fetch-page",
      "pagination",
      "aggregate",
      "formats",
      "failures",
      "review",
    ]);
  });

  it("resolves every generated internal route, precomputes markdown, and preserves anchors", () => {
    for (const item of catalog.items)
      for (const stage of item.stages) {
        expect(stage.markdown.trim().length, `${item.id}/${stage.id}`).toBeGreaterThan(0);
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

  it("gives every curated project brief a glossary, embedded diagrams and a mentor prompt per step", () => {
    for (const item of catalog.items) {
      const [overview, ...steps] = item.stages;
      expect(overview!.html, item.id).toContain("<h3>Glossary</h3>");
      for (const step of steps)
        expect(step.html, `${item.id}/${step.id}`).toContain(
          "<h3>AI mentor prompt</h3>",
        );
      const images = load(item.stages.map((s) => s.html).join(""))("img");
      expect(images.length, item.id).toBeGreaterThan(0);
      images.each((_, el) => {
        expect(el.attribs.src, item.id).toMatch(
          /^data:image\/svg\+xml;base64,/,
        );
        expect(el.attribs.alt?.trim(), item.id).toBeTruthy();
      });
    }
    const experiments = catalog.items
      .find((i) => i.id === "project:ingest-relay")!
      .stages.find((s) => s.id === "go-experiments")!;
    expect(experiments.html).toContain('src="data:image/svg+xml;base64,');
  });

  it("compiles a Markdown project folder with steps, embedded assets, and support files", () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), "vibe-md-project-"));
    try {
      fs.cpSync("content/projects", path.join(base, "content/projects"), {
        recursive: true,
      });
      const dir = path.join(base, "content/projects/mini-redis");
      fs.mkdirSync(path.join(dir, "steps"), { recursive: true });
      fs.mkdirSync(path.join(dir, "assets"), { recursive: true });
      fs.writeFileSync(
        path.join(dir, "project.yaml"),
        [
          "title: Mini Redis",
          "description: Build a RESP server in Python.",
          "language: python",
          "prerequisites:",
          "  - Python 3.12+ and uv",
          "supportFiles:",
          "  - doctor.py",
        ].join("\n") + "\n",
      );
      fs.writeFileSync(
        path.join(dir, "README.md"),
        "# Mini Redis\n\n### Glossary\n\n- **RESP**: Redis wire protocol.\n\n![Flow](assets/flow.svg)\n",
      );
      fs.writeFileSync(
        path.join(dir, "steps/02-ping.md"),
        "## Step 1 — Reply to PING\n\n<details><summary>Hint</summary>Start a TCP socket.</details>\n\n### AI mentor prompt\n\n> Ask me how RESP encodes +PONG.\n",
      );
      fs.writeFileSync(
        path.join(dir, "assets/flow.svg"),
        '<svg xmlns="http://www.w3.org/2000/svg"/>',
      );
      fs.writeFileSync(path.join(dir, "doctor.py"), "print('ok')\n");

      const compiled = compileCatalog(base).items.find(
        (i) => i.slug === "mini-redis",
      )!;
      expect(compiled.id).toBe("project:mini-redis");
      expect(compiled.language).toBe("python");
      expect(compiled.stages.map((s) => s.id)).toEqual(["overview", "ping"]);
      expect(compiled.stages[0]?.html).toContain("data:image/svg+xml;base64,");
      expect(compiled.stages[1]?.markdown).toContain("## Step 1 — Reply to PING");
      expect(compiled.supportFiles).toEqual([
        { path: "doctor.py", contents: "print('ok')\n" },
      ]);
    } finally {
      fs.rmSync(base, { recursive: true, force: true });
    }
  });

  it("sanitizes scripts and dangerous links in Markdown", () => {
    const result = markdown(
      '```go\nfmt.Println(2)\n```\n<script>alert(1)</script>\n<a href="javascript:alert(1)">bad</a>',
    );
    expect(result).toContain("fmt.Println");
    expect(result).not.toContain("javascript:");
    expect(result).not.toContain("<script");
  });
});
