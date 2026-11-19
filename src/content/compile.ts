import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";
import { load } from "cheerio";
import { z } from "zod";
import {
  CatalogSchema,
  ProjectLanguageSchema,
  ProjectSupportFilesSchema,
  type Catalog,
  type Project,
  type Stage,
} from "../shared/model";
import { htmlToMarkdown } from "./markdown-out";
import { clean, escape, htmlText, markdown } from "./render";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const read = (p: string): string => fs.readFileSync(p, "utf8");
const digest = (v: string): string =>
  crypto.createHash("sha256").update(v).digest("hex").slice(0, 16);

const MarkdownProjectManifest = z.object({
  title: z.string().min(1),
  description: z.string().default("Build, experiment, and understand the result."),
  language: ProjectLanguageSchema.default("go"),
  prerequisites: z.array(z.string()).default([]),
  supportFiles: z.array(z.string()).default([]),
});

const HTML_PROJECTS = [
  "go-telemetry-ingest-take-home",
  "relay-operator",
  "gossip-glomers",
  "tiny-tsdb",
  "cloud-reporter",
  "kubernetes-admission-lab",
];

function within(dir: string, file: string): boolean {
  const relative = path.relative(dir, file);
  return (
    relative !== "" &&
    !relative.startsWith(".." + path.sep) &&
    relative !== ".." &&
    !path.isAbsolute(relative)
  );
}

function embedLocalImage(
  assetRoot: string,
  assetPath: string,
  src: string,
): string {
  if (src.includes("\\") || !within(assetRoot, assetPath))
    throw new Error(`Project illustration escapes its asset directory: ${src}`);
  if (!fs.existsSync(assetPath))
    throw new Error(`Missing project illustration: ${src}`);
  if (!within(fs.realpathSync(assetRoot), fs.realpathSync(assetPath)))
    throw new Error(`Project illustration escapes its asset directory: ${src}`);
  const mime = {
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
  }[path.extname(assetPath).toLowerCase()];
  if (!mime) throw new Error(`Unsupported project illustration: ${src}`);
  return `data:${mime};base64,${fs.readFileSync(assetPath).toString("base64")}`;
}

function stage(
  id: string,
  title: string,
  html: string,
  rawMarkdown?: string,
): Stage {
  const sanitized = clean(html);
  return {
    id,
    title,
    html: sanitized,
    markdown: rawMarkdown ?? "",
    text: htmlText(sanitized),
  };
}

export function compileCatalog(base = root): Catalog {
  const items: Project[] = [];
  const sources = new Map<string, { itemId: string; stageId: string }>();
  const addSource = (key: string, itemId: string, stageId: string) =>
    sources.set(key, { itemId, stageId });
  const projectsDir = path.join(base, "content/projects");

  // 1. Existing HTML project briefs
  for (const file of HTML_PROJECTS) {
    const location = path.join(projectsDir, file + ".html");
    if (!fs.existsSync(location)) continue;
    const document = read(location);
    const $ = load(document);
    const main = $("main").first();
    main.find("script,style,nav,footer,.toolbar").remove();
    const title = main.find("h1").first().text();
    const supportFiles = ProjectSupportFilesSchema.parse(
      main
        .find("pre[data-workspace-file]")
        .toArray()
        .map((el) => {
          const name = $(el).attr("data-workspace-file");
          const contents = $(el).children("code").text().trimEnd();
          if (!contents.trim())
            throw new Error(
              `Supplied file ${name} in ${location} needs a non-empty <code> block`,
            );
          return { path: name, contents: contents + "\n" };
        }),
    );
    const stages: Stage[] = [];
    const sessions = main.find("section.session");
    sessions.each((index, el) => {
      const section = $(el);
      const id =
        section.attr("id") ||
        section.attr("aria-labelledby") ||
        `step-${index + 1}`;
      stages.push(
        stage(
          id,
          section.find("h2,h3").first().text() || `Step ${index + 1}`,
          $.html(el),
        ),
      );
      section.remove();
    });
    stages.unshift(stage("overview", "Overview & setup", main.html() || ""));
    const slug =
      file === "go-telemetry-ingest-take-home" ? "ingest-relay" : file;
    const id = `project:${slug}`;
    if (file === "go-telemetry-ingest-take-home") {
      const reference = load(
        read(path.join(projectsDir, "go-scratch-exercises.html")),
      );
      reference("main").find("script,style,nav,footer,.toolbar").remove();
      stages.push(
        stage(
          "go-experiments",
          "Optional Go experiments",
          reference("main").html() || "",
        ),
      );
      addSource("take-home/go-scratch-exercises.html", id, "go-experiments");
    }
    const item: Project = {
      id,
      slug,
      title,
      language: "go",
      ...(supportFiles.length ? { supportFiles } : {}),
      description:
        main.find("header p").not(".eyebrow,.meta").first().text() ||
        "Build, experiment, and understand the result.",
      stages,
      related: [],
      prerequisites: [],
      source: `take-home/${file}.html`,
      version: "",
    };
    if (file === "kubernetes-admission-lab") {
      stages[0]!.title = "Step 0 — Read the assigned article";
      item.prerequisites = [
        "Read the assigned article first. Then use Go, Docker, k3d, kubectl, k9s, Go Task, OpenSSL and curl. Workspace creation adds the Taskfile and the doctor.go diagnostics.",
        "Guided experiments on a local cluster, and Go tests that you run yourself in your terminal.",
      ];
    } else if (file === "relay-operator") {
      item.prerequisites = [
        "A workspace with a working Ingest Relay.",
        "Go, a container runtime, kind, kubectl, Kubebuilder and Helm. Do the guided checks on your own local cluster.",
      ];
      item.related.push({
        itemId: "project:ingest-relay",
        label: "Build the Ingest Relay",
      });
    } else if (file === "gossip-glomers") {
      item.prerequisites = [
        "Go, a compatible JDK, Maelstrom, Graphviz and gnuplot. The overview gives the setup commands.",
      ];
    } else if (file === "cloud-reporter") {
      item.prerequisites = [
        "Go. Live GitHub requests need internet access. The local HTTP tests work offline.",
      ];
    } else {
      item.prerequisites = [
        "Go. Learner tests with the race detector also need a supported C compiler.",
      ];
    }
    items.push(item);
    addSource(`take-home/${file}.html`, id, "overview");
  }

  // 2. Folder-based Markdown projects (content/projects/<slug>/project.yaml)
  if (fs.existsSync(projectsDir)) {
    for (const entry of fs.readdirSync(projectsDir).sort()) {
      if (entry === "assets") continue;
      const dir = path.join(projectsDir, entry);
      if (!fs.statSync(dir).isDirectory()) continue;
      const manifestFile = path.join(dir, "project.yaml");
      if (!fs.existsSync(manifestFile)) continue;
      const config = MarkdownProjectManifest.parse(
        yaml.load(read(manifestFile)),
      );
      const slug = entry;
      const id = `project:${slug}`;
      const readmePath = path.join(dir, "README.md");
      if (!fs.existsSync(readmePath))
        throw new Error(`Missing README.md in ${dir}`);
      const readmeMd = read(readmePath);
      const stages: Stage[] = [
        stage("overview", "Overview & setup", markdown(readmeMd), readmeMd),
      ];
      const stepsDir = path.join(dir, "steps");
      if (fs.existsSync(stepsDir) && fs.statSync(stepsDir).isDirectory()) {
        for (const stepFile of fs
          .readdirSync(stepsDir)
          .filter((f) => f.endsWith(".md"))
          .sort()) {
          const md = read(path.join(stepsDir, stepFile));
          const stem = path
            .basename(stepFile, ".md")
            .replace(/^\d+-/, "");
          const title =
            md.match(/^#{1,2}\s+(.+)$/m)?.[1]?.trim() || stem;
          stages.push(stage(stem, title, markdown(md), md));
          addSource(`${slug}/steps/${stepFile}`, id, stem);
        }
      }
      const supportFiles = config.supportFiles.length
        ? ProjectSupportFilesSchema.parse(
            config.supportFiles.map((name) => {
              const filePath = path.join(dir, name);
              if (!within(dir, filePath) || !fs.existsSync(filePath))
                throw new Error(`Missing support file ${name} in ${dir}`);
              return { path: name, contents: read(filePath) };
            }),
          )
        : [];
      items.push({
        id,
        slug,
        title: config.title,
        description: config.description,
        language: config.language,
        stages,
        related: [],
        prerequisites: config.prerequisites,
        ...(supportFiles.length ? { supportFiles } : {}),
        source: `markdown/${slug}`,
        version: "",
      });
      addSource(`${slug}/README.md`, id, "overview");
    }
  }

  // 3. Resolve authored relative links, anchors, embedded images, and stage Markdown
  const anchors = new Map<string, string>();
  for (const item of items)
    for (const s of item.stages) {
      const $ = load(s.html);
      $("[id]").each((_, el) => {
        anchors.set(`${item.id}#${$(el).attr("id")}`, s.id);
      });
    }

  for (const item of items) {
    const isHtmlProject = item.source.startsWith("take-home/");
    const namespace = isHtmlProject ? "take-home" : item.slug;
    for (const s of item.stages) {
      const $ = load(s.html);
      $("a[href]").each((_, el) => {
        const a = $(el);
        const href = a.attr("href")!;
        if (/^(https?:|mailto:)/.test(href)) return;
        const [file = "", hash = ""] = href.split("#");
        const key = `${namespace}/${file.replace(/^\.\//, "")}`;
        const target = file
          ? sources.get(key) ||
            sources.get(`${namespace}/${path.basename(file)}`)
          : { itemId: item.id, stageId: s.id };
        if (target) {
          const stageId = hash
            ? anchors.get(`${target.itemId}#${hash}`) || target.stageId
            : target.stageId;
          a.attr(
            "href",
            `#/read/${encodeURIComponent(target.itemId)}/${encodeURIComponent(stageId)}${hash ? "?anchor=" + encodeURIComponent(hash) : ""}`,
          );
        } else if (file === "index.html" && namespace === "take-home")
          a.attr("href", "#/projects");
        else a.removeAttr("href");
      });

      $("img[src]").each((_, el) => {
        const img = $(el);
        const src = img.attr("src")!;
        if (/^https?:/.test(src)) {
          img.replaceWith(
            `<p>${escape(img.attr("alt") || "External illustration")}</p>`,
          );
          return;
        }
        if (isHtmlProject) {
          const stem =
            s.id === "go-experiments"
              ? "go-scratch-exercises"
              : path.basename(item.source, ".html");
          const assetRoot = path.resolve(projectsDir, "assets", stem);
          const assetPath = path.resolve(projectsDir, src);
          img.attr("src", embedLocalImage(assetRoot, assetPath, src));
        } else {
          const assetRoot = path.resolve(projectsDir, item.slug, "assets");
          const assetPath = path.resolve(projectsDir, item.slug, src);
          img.attr("src", embedLocalImage(assetRoot, assetPath, src));
        }
      });

      s.html = clean($("body").html() || "");
      s.text = htmlText(s.html);
      if (!s.markdown) {
        s.markdown = htmlToMarkdown(s.html, (href) =>
          /^(https?:|mailto:|#\/read\/)/.test(href) ? href : null,
        );
      }
    }
  }

  for (const item of items) item.version = digest(JSON.stringify(item));
  const catalog = CatalogSchema.parse({ formatVersion: 3, items });
  const ids = new Set<string>();
  for (const item of catalog.items) {
    if (ids.has(item.id)) throw new Error(`Duplicate item ${item.id}`);
    ids.add(item.id);
    if (new Set(item.stages.map((s) => s.id)).size !== item.stages.length)
      throw new Error(`Duplicate stage in ${item.id}`);
    for (const link of item.related)
      if (
        !catalog.items.some(
          (i) =>
            i.id === link.itemId &&
            (!link.stageId || i.stages.some((s) => s.id === link.stageId)),
        )
      )
        throw new Error(`Broken related link in ${item.id}`);
  }
  return catalog;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const catalog = compileCatalog();
  if (!process.argv.includes("--check")) {
    const outDir = path.join(root, "build/content");
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(
      path.join(outDir, "catalog.json"),
      JSON.stringify(catalog),
    );
  }
  console.log(
    `Validated ${catalog.items.length} projects, ${catalog.items.reduce((n, i) => n + i.stages.length, 0)} sections.`,
  );
}
