import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";
import { load } from "cheerio";
import { z } from "zod";
import {
  CatalogSchema,
  type Catalog,
  type Item,
  type Stage,
  type Check,
} from "../shared/model";
import { activities } from "./activities";
import { writeContentPackage } from "./publish";
import { clean, escape, htmlText, markdown } from "./render";
const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const read = (p: string): string => fs.readFileSync(p, "utf8");
const digest = (v: string): string =>
  crypto.createHash("sha256").update(v).digest("hex").slice(0, 16);
const text = z.union([z.string(), z.number()]).transform(String);
const ModuleSchema = z.object({
  id: text.optional(),
  title: z.string(),
  file: z.string().optional(),
});
const CourseManifest = z.object({
  course: z.object({
    name: z.string(),
    slug: z.string(),
    description: z.string().default(""),
  }),
  modules: z.array(ModuleSchema),
  projects: z
    .array(
      z.object({
        id: text,
        title: z.string(),
        file: z.string(),
        description: z.string().default(""),
        afterModule: z.number().optional(),
      }),
    )
    .default([]),
});
function stage(
  id: string,
  title: string,
  html: string,
  moduleId?: string,
): Stage {
  return { id, title, html: clean(html), text: htmlText(html), moduleId };
}
export function compileCatalog(base = root): Catalog {
  const items: Item[] = [];
  const sources = new Map<string, { itemId: string; stageId: string }>();
  const addSource = (key: string, itemId: string, stageId: string) =>
    sources.set(key, { itemId, stageId });
  const courseRoot = path.join(base, "courses");
  for (const slug of fs.existsSync(courseRoot)
    ? fs.readdirSync(courseRoot).sort()
    : []) {
    const dir = path.join(courseRoot, slug);
    if (!fs.existsSync(path.join(dir, "course.yaml"))) continue;
    const config = CourseManifest.parse(
      yaml.load(read(path.join(dir, "course.yaml"))),
    );
    const id = `course:${slug}`;
    const stages: Stage[] = [];
    const lessons = path.join(dir, "content/lessons");
    for (const [index, mod] of config.modules.entries()) {
      const moduleId = mod.id ?? String(index);
      const stem = mod.file || `module${moduleId}`;
      const location = path.join(lessons, stem);
      const files =
        fs.existsSync(location) && fs.statSync(location).isDirectory()
          ? fs
              .readdirSync(location)
              .filter((f) => f.endsWith(".md"))
              .sort()
              .map((f) => path.join(location, f))
          : [location + ".md"];
      for (const [n, file] of files.entries()) {
        if (!fs.existsSync(file)) throw new Error(`Missing lesson: ${file}`);
        const md = read(file);
        const title = md.match(/^##?\s+(.+)$/m)?.[1] || mod.title;
        const stageId = `${stem}-${path.basename(file, ".md")}`;
        stages.push(stage(stageId, title, markdown(md), moduleId));
        addSource(`${slug}/${stem}-${n + 1}.html`, id, stageId);
        addSource(`${slug}/${path.relative(lessons, file)}`, id, stageId);
        if (n === 0) addSource(`${slug}/${stem}.html`, id, stageId);
      }
    }
    const item: Item = {
      id,
      kind: "course",
      ...activities(dir, stages),
      title: config.course.name,
      description: config.course.description,
      stages,
      related: [],
      prerequisites: [],
      checks: [],
      source: `courses/${slug}`,
      version: "",
    };
    items.push(item);
    addSource(`${slug}/index.html`, id, stages[0]!.id);
    for (const project of config.projects) {
      const projectId = `project:${slug}-${project.id}`;
      const file = path.join(lessons, project.file + ".md");
      if (!fs.existsSync(file)) throw new Error(`Missing project: ${file}`);
      const related =
        project.afterModule === undefined
          ? []
          : stages
              .filter(
                (s) =>
                  s.moduleId === String(project.afterModule) &&
                  !s.id.endsWith("-examples"),
              )
              .slice(0, 1)
              .map((s) => ({ itemId: id, stageId: s.id, label: modLabel(s) }));
      const p: Item = {
        id: projectId,
        kind: "project",
        title: project.title,
        description: project.description,
        stages: [stage("brief", project.title, markdown(read(file)))],
        related,
        prerequisites: [],
        checks: [],
        source: `courses/${slug}/${project.file}.md`,
        version: "",
      };
      // Operator and privileged container work stay guided; other projects may run learner tests explicitly.
      if (!/operator|container/i.test(project.title))
        p.checks.push(learnerCheck());
      items.push(p);
      addSource(`${slug}/${project.file}.html`, projectId, "brief");
      addSource(`${slug}/${project.file}.md`, projectId, "brief");
      item.related.push({ itemId: projectId, label: project.title });
    }
  }
  const projectFiles = [
    "go-telemetry-ingest-take-home",
    "relay-operator",
    "gossip-glomers",
    "tiny-tsdb",
    "cloud-reporter",
  ];
  for (const file of projectFiles) {
    const document = read(path.join(base, "content/projects", file + ".html"));
    const $ = load(document);
    const main = $("main").first();
    main.find("script,style,nav,footer,.toolbar").remove();
    const title = main.find("h1").first().text();
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
    const id = `project:${file === "go-telemetry-ingest-take-home" ? "ingest-relay" : file}`;
    if (file === "go-telemetry-ingest-take-home") {
      const reference = load(
        read(path.join(base, "content/projects/go-scratch-exercises.html")),
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
    const item: Item = {
      id,
      kind: "project",
      title,
      description:
        main.find("header p").not(".eyebrow,.meta").first().text() ||
        "Build, experiment, and understand the result.",
      stages,
      related: [],
      checks: [],
      prerequisites: [],
      source: `take-home/${file}.html`,
      version: "",
    };
    if (file === "relay-operator")
      item.prerequisites = [
        "A working Ingest Relay workspace",
        "Go, container runtime, kind, kubectl, Kubebuilder, and Helm. Perform the guided checks in your own local cluster.",
      ];
    else if (file === "gossip-glomers") {
      item.prerequisites = [
        "Go, a compatible JDK, Maelstrom, Graphviz, and gnuplot. See setup commands in the overview.",
      ];
      item.checks = maelstromChecks(stages);
    } else if (file === "cloud-reporter") {
      item.prerequisites = [
        "Go. Internet access for live GitHub requests; local HTTP tests work offline.",
      ];
      item.checks = [learnerCheck()];
    } else {
      item.prerequisites = [
        "Go. Race-enabled learner tests also need a supported C compiler.",
      ];
      item.checks = [
        learnerCheck(),
        {
          ...learnerCheck(),
          id: "go-race",
          title: "Your tests · race detector",
          description: "Run your own tests with the Go race detector.",
        },
        ...acceptanceChecks(file === "tiny-tsdb" ? "tsdb" : "relay"),
      ];
    }
    if (file === "relay-operator")
      item.related.push({
        itemId: "project:ingest-relay",
        label: "Build the Ingest Relay",
      });
    items.push(item);
    addSource(`take-home/${file}.html`, id, "overview");
  }
  // Resolve authored relative links and anchors against the compiled catalog.
  const anchors = new Map<string, string>();
  for (const item of items)
    for (const s of item.stages) {
      const $ = load(s.html);
      $("[id]").each((_, el) => {
        anchors.set(`${item.id}#${$(el).attr("id")}`, s.id);
      });
    }
  for (const item of items)
    for (const s of item.stages) {
      const $ = load(s.html);
      const namespace = item.source.startsWith("take-home/")
        ? "take-home"
        : item.source.split("/")[1]!;
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
        const asset = path.resolve(
          base,
          "courses",
          namespace,
          "content/assets",
          path.basename(src),
        );
        const assetRoot =
          path.resolve(base, "courses", namespace, "content/assets") + path.sep;
        if (asset.startsWith(assetRoot) && fs.existsSync(asset)) {
          const ext = path.extname(asset);
          const mime =
            ext === ".svg"
              ? "image/svg+xml"
              : ext === ".png"
                ? "image/png"
                : "image/jpeg";
          img.attr(
            "src",
            `data:${mime};base64,${fs.readFileSync(asset).toString("base64")}`,
          );
        } else img.remove();
      });
      s.html = clean($("body").html() || "");
      s.text = htmlText(s.html);
    }
  for (const item of items) item.version = digest(JSON.stringify(item));
  const catalog = CatalogSchema.parse({ formatVersion: 2, items });
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
function modLabel(s: Stage): string {
  return `Related lesson: ${s.title}`;
}
function learnerCheck(): Check {
  return {
    id: "go-test",
    title: "Your tests",
    kind: "learner",
    suiteVersion: "go-test-v1",
    description:
      "Run go vet and your own go test suite. No tests is reported as unchecked.",
    unchecked: [
      "Passing your tests does not certify all project requirements.",
    ],
  };
}
function acceptanceChecks(kind: "relay" | "tsdb"): Check[] {
  return ["http", "storage", "final"].map((part) => ({
    id: `${kind}-${part}`,
    title:
      part === "final"
        ? "Final acceptance checks"
        : part === "http"
          ? "Checkpoint · HTTP contract"
          : "Checkpoint · storage behavior",
    kind: "acceptance",
    suiteVersion: `${kind}-1`,
    description:
      "Build your executable and exercise its public interface in a temporary directory. Your source and tests are not modified.",
    stageId:
      part === "http"
        ? "session-2"
        : part === "storage"
          ? kind === "relay"
            ? "session-4"
            : "session-3"
          : undefined,
    unchecked:
      kind === "relay"
        ? [
            "Internal batching, deterministic overload, injected write failures, and ownership require your tests and design review.",
          ]
        : [
            "Compression limits, block sealing, WAL corruption handling, retention boundaries, and storage failure injection require your tests and review.",
          ],
  }));
}
function maelstromChecks(stages: Stage[]): Check[] {
  return stages
    .filter((s) => s.id.startsWith("challenge-"))
    .map((s) => ({
      id: `maelstrom-${s.id.replace("challenge-", "")}`,
      title: `Maelstrom · ${s.title}`,
      kind: "maelstrom",
      suiteVersion: "maelstrom-0.2.3-v1",
      stageId: s.id,
      description:
        "Build the stage binary and run the documented workload. Histories and reports are retained per run.",
      unchecked: [
        "Passing sampled histories is not a proof of all executions; inspect results and explain tradeoffs.",
      ],
    }));
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const catalog = compileCatalog();
  if (!process.argv.includes("--check")) {
    writeContentPackage(catalog, path.join(root, "build/content"), root);
  }
  console.log(
    `Validated ${catalog.items.length} items, ${catalog.items.reduce((n, i) => n + i.stages.length, 0)} sections.`,
  );
}
