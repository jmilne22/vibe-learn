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

describe("admission lab content and offline illustrations", () => {
  it("starts with reading, stays guided, and exports useful text and support files", () => {
    expect(project.checks).toEqual([]);
    expect(project.stages.map((s) => s.id)).toEqual([
      "overview", "doctor", "first-pod", "mutation", "admission", "diagnosis", "rehearsal", "readiness",
    ]);
    const $ = load(project.stages[0]!.html);
    expect($("h2").first().text()).toBe("Step 0 — Read the assigned article");
    expect($("pre,img")).toHaveLength(0);
    expect(project.stages[0]!.title).toBe("Step 0 — Read the assigned article");
    const files = workspaceFiles(project, "mentor");
    expect(files.find((f) => f.path === "Taskfile.yml")?.contents).toContain("python3 doctor.py");
    expect(files.find((f) => f.path === "doctor.py")?.contents).toContain("def main(argv=None)");
    expect(files.some((f) => f.path === "main.py")).toBe(false);
    expect(files.some((f) => f.path === "go.mod")).toBe(false);
    const text = files.map((f) => f.contents).join("\n");
    expect(text).toContain("def main(argv=None)");
    expect(text).toContain("python3 doctor.py");
    expect(text).toContain("Import it into the k3d node runtimes");
    expect(text).toContain("<details>");
    expect(text).not.toContain("data:image/");
    expect(text).not.toMatch(/NixOS|nix-shell|pacman/);
  });

  it("exercises the shipped doctor against missing tools, faults, and ready clusters", () => {
    const doctor = workspaceFiles(project, "mentor").find((f) => f.path === "doctor.py")!.contents;
    expect(doctor).toContain("def main");
    execFileSync("python3", ["tests/v2/fixtures/admission-doctor.py"], {
      input: doctor,
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 10000,
    });
  });

  it("embeds all images and preserves them through downloaded-content sanitization", () => {
    const data = JSON.stringify(catalog);
    expect(Buffer.byteLength(data)).toBeLessThan(MAX_CATALOG_BYTES);
    const downloaded = validateDownloadedCatalog(data).items.find((i) => i.id === projectId)!;
    expect(workspaceFiles(downloaded, "mentor").find((f) => f.path === "Taskfile.yml")?.contents)
      .toContain("python3 doctor.py");
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
