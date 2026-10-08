import fs from "node:fs";
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { load } from "cheerio";
import { compileCatalog } from "../../src/content/compile";
import { validateDownloadedCatalog } from "../../src/content/validate-catalog";
import { workspaceFiles } from "../../src/main/workspace";
import { MAX_CATALOG_BYTES } from "../../src/shared/content-update";

const projectId = "project:kubernetes-admission-lab";
const source = "content/projects/kubernetes-admission-lab.html";
const catalog = compileCatalog();
const project = catalog.items.find((item) => item.id === projectId)!;

function go(dir: string, command: string, args: string[]): string {
  return execFileSync(command, args, {
    cwd: dir,
    env: { ...process.env, CGO_ENABLED: "0", GOFLAGS: "-mod=mod", GOTOOLCHAIN: "local" },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 120000,
  });
}

// Runs check in a temporary Go module that holds files, then removes the module.
function withModule(files: Record<string, string>, check: (dir: string) => void) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vibe-admission-go-"));
  try {
    fs.writeFileSync(path.join(dir, "go.mod"), "module example.com/admission-lab\n\ngo 1.22\n");
    for (const [name, contents] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), contents);
    check(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

describe("admission lab content and offline illustrations", () => {
  it("starts with reading, stays guided, and exports useful text and support files", () => {
    expect(project.checks).toEqual([]);
    expect(project.stages.map((s) => s.id)).toEqual([
      "overview", "doctor", "first-pod", "upstream", "mutation", "admission", "diagnosis", "rehearsal", "readiness",
    ]);
    const $ = load(project.stages[0]!.html);
    expect($("h2").first().text()).toBe("Step 0 — Read the assigned article");
    expect($("pre,img")).toHaveLength(0);
    expect(project.stages[0]!.title).toBe("Step 0 — Read the assigned article");
    const files = workspaceFiles(project, "mentor");
    expect(files.find((f) => f.path === "Taskfile.yml")?.contents).toContain("go run doctor.go");
    const doctor = files.find((f) => f.path === "doctor.go")?.contents;
    expect(doctor).toMatch(/^\/\/go:build ignore\n/);
    expect(doctor).toContain("func doctorMain(");
    for (const name of ["doctor.py", "main.go", "main.py", "go.mod"])
      expect(files.some((f) => f.path === name), name).toBe(false);
    const text = files.map((f) => f.contents).join("\n");
    expect(text).toContain("Import it into the k3d node runtimes");
    expect(text).toContain("<details>");
    expect(text).not.toContain("data:image/");
    expect(text).not.toMatch(/NixOS|nix-shell|pacman/);
    // The article and the upstream stage are Python; everything the learner runs is Go.
    const learnerRuns = [
      ...(project.kind === "project" ? project.supportFiles ?? [] : []).map((f) => f.contents),
      ...project.stages.filter((s) => !["overview", "upstream"].includes(s.id)).map((s) => s.html),
    ].join("\n");
    expect(learnerRuns).not.toMatch(/python3?\b|pytest|pip install|FastAPI|uvicorn/i);
  });

  it("exercises the shipped doctor against missing tools, faults, and ready clusters", () => {
    const doctor = workspaceFiles(project, "mentor").find((f) => f.path === "doctor.go")!.contents;
    const fixture = fs.readFileSync("tests/v2/fixtures/admission_doctor_test.go", "utf8");
    // Drop the tag that keeps the helper out of a module, so the fixture can test it.
    const untag = (text: string) => text.replace(/^\/\/go:build ignore\n/, "");
    withModule({ "doctor.go": untag(doctor), "admission_doctor_test.go": untag(fixture) }, (dir) =>
      go(dir, "go", ["test", "./..."]));
  });

  it("ships reference Go solutions and helpers that build, vet and pass their tests", () => {
    const $ = load(fs.readFileSync(source, "utf8"));
    const code = (name: string) => {
      const block = $(`pre[data-file="${name}"] code`);
      expect(block, name).toHaveLength(1);
      return block.text() + "\n";
    };
    const helpers = ["doctor.go", "register.go", "workloads.go"];
    const files = Object.fromEntries(
      ["main.go", "main_test.go", ...helpers].map((name) => [name, code(name)]),
    );
    for (const name of helpers) expect(files[name], name).toMatch(/^\/\/go:build ignore\n/);
    // The ignore tag keeps the helpers out of the learner's module. Vet checks them by name.
    withModule(files, (dir) => {
      expect(go(dir, "gofmt", ["-l", "."]).trim()).toBe("");
      go(dir, "go", ["vet", "./..."]);
      go(dir, "go", ["test", "./..."]);
      for (const name of helpers) go(dir, "go", ["vet", name]);
    });
    withModule({ "main.go": code("baseline-main.go") }, (dir) => go(dir, "go", ["vet", "./..."]));
  });

  it("embeds all images and preserves them through downloaded-content sanitization", () => {
    const data = JSON.stringify(catalog);
    expect(Buffer.byteLength(data)).toBeLessThan(MAX_CATALOG_BYTES);
    const downloaded = validateDownloadedCatalog(data).items.find((i) => i.id === projectId)!;
    expect(workspaceFiles(downloaded, "mentor").find((f) => f.path === "Taskfile.yml")?.contents)
      .toContain("go run doctor.go");
    const $ = load(downloaded.stages.map((s) => s.html).join(""));
    expect($("img")).toHaveLength(8);
    $("img").each((_, el) => {
      const src = $(el).attr("src")!;
      expect(src).toMatch(/^data:image\/svg\+xml;base64,/);
      expect($(el).attr("alt")!.length).toBeGreaterThan(30);
      const svg = Buffer.from(src.split(",")[1]!, "base64").toString();
      expect(svg).not.toMatch(/<script|<foreignObject|(?:href|src)=["']https?:/);
      if (svg.includes("@keyframes")) {
        expect(svg).toContain("4.8s linear 1");
        expect(svg).toContain("prefers-reduced-motion:reduce");
        expect(svg).not.toContain("infinite");
      }
    });
    expect($("script,iframe,object,button")).toHaveLength(0);
  });

  it("reports missing images and rejects cross-project paths and symlink escapes", () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), "vibe-project-assets-"));
    try {
      fs.cpSync("content/projects", path.join(base, "content/projects"), { recursive: true });
      const original = fs.readFileSync(source, "utf8");
      const image = "assets/kubernetes-admission-lab/image-to-pod-animated.svg";
      for (const [replacement, message] of [
        ["assets/kubernetes-admission-lab/missing.svg", "Missing project illustration"],
        ["assets/kubernetes-admission-lab/../../cloud-reporter.html", "escapes its asset directory"],
        ["assets/relay-operator/diagram.svg", "escapes its asset directory"],
      ]) {
        fs.writeFileSync(path.join(base, source), original.replace(image, replacement!));
        expect(() => compileCatalog(base)).toThrow(message);
      }
      fs.writeFileSync(path.join(base, source), original);
      const asset = path.join(base, "content/projects", image);
      fs.unlinkSync(asset);
      fs.symlinkSync(path.join(base, "content/projects/cloud-reporter.html"), asset);
      expect(() => compileCatalog(base)).toThrow("escapes its asset directory");
    } finally {
      fs.rmSync(base, { recursive: true, force: true });
    }
  });
});
