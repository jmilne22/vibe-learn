import { describe, it, expect, vi } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import http from "node:http";
import { ContentLibrary } from "../../src/main/content-library";
import { validateDownloadedCatalog } from "../../src/content/validate-catalog";
import { compileCatalog } from "../../src/content/compile";
import { fixtureCourse } from "./fixtures/course";
import { type Catalog } from "../../src/shared/model";
import { type ContentManifest } from "../../src/shared/content-update";

const bundled = JSON.stringify({ formatVersion: 2, items: [] });
const makePackage = (
  name = "Updated course",
  date = "2026-09-24T00:00:00Z",
) => {
  const catalog: Catalog = {
    formatVersion: 2,
    items: [{ ...structuredClone(fixtureCourse), title: name }],
  };
  const data = JSON.stringify(catalog);
  const manifest: ContentManifest = {
    formatVersion: 1,
    minimumAppVersion: "2.0.2",
    publishedAt: date,
    revision: crypto.createHash("sha256").update(data).digest("hex"),
  };
  return { manifest, data };
};
async function withLibrary(
  run: (
    library: ContentLibrary,
    directory: string,
    set: (pkg: ReturnType<typeof makePackage>) => void,
  ) => Promise<void>,
) {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "vibe-content-update-"),
  );
  let pkg = makePackage();
  const fetcher = vi.fn<typeof fetch>(
    async (input) =>
      new Response(
        String(input).endsWith("latest.json")
          ? JSON.stringify(pkg.manifest)
          : pkg.data,
      ),
  );
  try {
    const library = await ContentLibrary.open({
      bundled,
      directory,
      appVersion: "2.0.2",
      fetcher,
    });
    expect(fetcher).not.toHaveBeenCalled();
    await run(library, directory, (value) => {
      pkg = value;
    });
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}

describe("downloaded content", () => {
  it("rejects streamed oversized manifests, malformed JSON, and timeouts without installing anything", async () => {
    const directory = await fs.mkdtemp(
      path.join(os.tmpdir(), "vibe-bad-download-"),
    );
    try {
      for (const fetcher of [
        async () => new Response("x".repeat(16001)),
        async () => new Response("{truncated"),
        async () => {
          throw new DOMException("deadline", "TimeoutError");
        },
      ]) {
        const library = await ContentLibrary.open({
          bundled,
          directory,
          appVersion: "2.0.2",
          fetcher,
        });
        await expect(library.update()).rejects.toThrow();
        expect(library.catalog.items).toEqual([]);
        expect(await fs.readdir(directory)).toEqual([]);
      }
    } finally {
      await fs.rm(directory, { recursive: true, force: true });
    }
  });
  it("allows only one concurrent update", async () => {
    const directory = await fs.mkdtemp(
      path.join(os.tmpdir(), "vibe-concurrent-update-"),
    );
    let respond!: (response: Response) => void;
    const waiting = new Promise<Response>((resolve) => {
      respond = resolve;
    });
    try {
      const library = await ContentLibrary.open({
        bundled,
        directory,
        appVersion: "2.0.2",
        fetcher: async () => waiting,
      });
      const pending = library.update();
      await expect(library.update()).rejects.toThrow("already in progress");
      respond(new Response("unavailable", { status: 503 }));
      await expect(pending).rejects.toThrow("503");
    } finally {
      await fs.rm(directory, { recursive: true, force: true });
    }
  });

  it("accepts the published catalog and sanitizes downloaded HTML", () => {
    expect(
      validateDownloadedCatalog(JSON.stringify(compileCatalog())).items,
    ).toHaveLength(5);
    const pkg = makePackage();
    const data = JSON.parse(pkg.data) as Catalog;
    data.items[0]!.stages[0]!.html =
      '<h2>Safe</h2><script>bad()</script><a href="javascript:bad()">link</a>';
    const stage = validateDownloadedCatalog(JSON.stringify(data)).items[0]!
      .stages[0]!;
    expect(stage.html).not.toMatch(/<script|javascript:/);
    expect(stage.text).toContain("Safe");
  });
  it("persists a verified update, skips unchanged content, and opens offline after restart", async () => {
    await withLibrary(async (library, directory) => {
      const learnerFile = path.join(directory, "learner.go");
      await fs.writeFile(learnerFile, "my code");
      expect((await library.update()).updated).toBe(true);
      expect(library.catalog.items[0]?.title).toBe("Updated course");
      expect((await library.update()).updated).toBe(false);
      const offline = vi.fn<typeof fetch>(async () => {
        throw new TypeError("offline");
      });
      const restarted = await ContentLibrary.open({
        bundled,
        directory,
        appVersion: "2.0.2",
        fetcher: offline,
      });
      expect(restarted.catalog).toEqual(library.catalog);
      expect(offline).not.toHaveBeenCalled();
      await expect(restarted.update()).rejects.toThrow("Check your connection");
      expect(restarted.catalog).toEqual(library.catalog);
      expect(await fs.readFile(learnerFile, "utf8")).toBe("my code");
    });
  });
  it("retains the current catalog for corrupt, incompatible, and unsupported updates", async () => {
    await withLibrary(async (library, directory, set) => {
      await library.update();
      const original = await fs.readFile(
        path.join(directory, "current.json"),
        "utf8",
      );
      const bad = makePackage("Newer");
      bad.data += "broken";
      set(bad);
      await expect(library.update()).rejects.toThrow("damaged");
      const incompatible = makePackage("Requires app");
      incompatible.manifest.minimumAppVersion = "3.0.0";
      set(incompatible);
      await expect(library.update()).rejects.toThrow("3.0.0");
      const schema = makePackage("New schema");
      schema.manifest.formatVersion = 2 as 1;
      set(schema);
      await expect(library.update()).rejects.toThrow("unsupported");
      expect(
        await fs.readFile(path.join(directory, "current.json"), "utf8"),
      ).toBe(original);
      expect(library.catalog.items[0]?.title).toBe("Updated course");
    });
  });
  it("keeps the last successful update if writing the next update fails", async () => {
    await withLibrary(async (library, directory, set) => {
      await library.update();
      const original = await fs.readFile(
        path.join(directory, "current.json"),
        "utf8",
      );
      set(makePackage("Next"));
      const renameFile = fs.rename.bind(fs);
      const rename = vi
        .spyOn(fs, "rename")
        .mockImplementationOnce(renameFile)
        .mockRejectedValueOnce(new Error("disk full"));
      try {
        await expect(library.update()).rejects.toThrow("disk full");
      } finally {
        rename.mockRestore();
      }
      expect(
        await fs.readFile(path.join(directory, "current.json"), "utf8"),
      ).toBe(original);
      expect(library.catalog.items[0]?.title).toBe("Updated course");
      expect(
        (await fs.readdir(directory)).some((file) => file.endsWith(".tmp")),
      ).toBe(false);
    });
  });
  it("recovers the previous catalog from a corrupt cache and prefers a newer bundled catalog", async () => {
    await withLibrary(async (library, directory, set) => {
      await library.update();
      set(makePackage("Second", "2026-09-25T00:00:00Z"));
      await library.update();
      await fs.writeFile(path.join(directory, "current.json"), "truncated");
      const recovered = await ContentLibrary.open({
        bundled,
        directory,
        appVersion: "2.0.2",
      });
      expect(recovered.catalog.items[0]?.title).toBe("Updated course");
      expect(recovered.status.warning).toBeTruthy();
      const newer = makePackage("Bundled later", "2026-10-01T00:00:00Z");
      const upgraded = await ContentLibrary.open({
        bundled: newer.data,
        bundledManifest: newer.manifest,
        directory,
        appVersion: "2.0.3",
      });
      expect(upgraded.catalog.items[0]?.title).toBe("Bundled later");
      expect(upgraded.status.source).toBe("bundled");
    });
  });
  it("rejects unsafe paths, duplicate IDs and unknown built-in suite versions", () => {
    const catalog = JSON.parse(makePackage().data) as Catalog;
    const course = catalog.items[0]!;
    if (course.kind !== "course") throw new Error("Expected fixture course");
    course.exercises[0]!.files[0]!.path = "../outside.go";
    expect(() => validateDownloadedCatalog(JSON.stringify(catalog))).toThrow();
    course.exercises[0]!.files[0]!.path = "go.mod";
    course.exercises[0]!.checkFiles.push({
      path: "GO.MOD",
      contents: "overlap",
    });
    expect(() => validateDownloadedCatalog(JSON.stringify(catalog))).toThrow(
      "Duplicate",
    );
    course.exercises[0]!.checkFiles.pop();
    course.stages.push({ ...course.stages[0]! });
    expect(() => validateDownloadedCatalog(JSON.stringify(catalog))).toThrow(
      "Duplicate",
    );
    course.stages.pop();
    course.checks.push({
      id: "go-test",
      kind: "learner",
      title: "New suite",
      suiteVersion: "future",
      description: "",
      unchecked: [],
    });
    expect(() => validateDownloadedCatalog(JSON.stringify(catalog))).toThrow(
      "newer app",
    );
  });
  it("uses bounded HTTP downloads and keeps content when the server fails", async () => {
    const pkg = makePackage();
    let mode = "ok";
    const server = http.createServer((req, res) => {
      if (mode === "error") {
        res.writeHead(503).end();
        return;
      }
      if (mode === "redirect") {
        res.writeHead(302, { Location: "/other" }).end();
        return;
      }
      if (mode === "large") {
        res.writeHead(200, { "Content-Length": "999999999" }).end();
        return;
      }
      res.end(
        req.url?.endsWith("latest.json")
          ? JSON.stringify(pkg.manifest)
          : pkg.data,
      );
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("Missing server address");
    const directory = await fs.mkdtemp(
      path.join(os.tmpdir(), "vibe-download-"),
    );
    try {
      const library = await ContentLibrary.open({
        bundled,
        directory,
        appVersion: "2.0.2",
        updateUrl: `http://127.0.0.1:${address.port}/updates/latest.json`,
      });
      expect((await library.update()).updated).toBe(true);
      for (const failure of ["error", "redirect", "large"]) {
        mode = failure;
        await expect(library.update()).rejects.toThrow();
        expect(library.catalog.items[0]?.title).toBe("Updated course");
      }
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await fs.rm(directory, { recursive: true, force: true });
    }
  });
});
