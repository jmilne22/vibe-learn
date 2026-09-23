import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { CatalogSchema, type Catalog } from "../shared/model";
import { validateDownloadedCatalog } from "../content/validate-catalog";
import {
  ContentManifestSchema,
  CONTENT_UPDATE_URL,
  MAX_CATALOG_BYTES,
  versionAtLeast,
  type ContentManifest,
  type ContentStatus,
} from "../shared/content-update";

const hash = (text: string) =>
  crypto.createHash("sha256").update(text).digest("hex");
type Package = { manifest: ContentManifest; data: string };

export class ContentLibrary {
  catalog: Catalog;
  status: ContentStatus;
  private current?: Package;
  private updating = false;
  private constructor(
    bundled: string,
    private directory: string,
    private appVersion: string,
    private fetcher: typeof fetch,
    private updateUrl: string,
  ) {
    this.catalog = CatalogSchema.parse(JSON.parse(bundled));
    this.status = { revision: hash(bundled), source: "bundled" };
  }
  static async open(options: {
    bundled: string;
    directory: string;
    appVersion: string;
    bundledManifest?: unknown;
    fetcher?: typeof fetch;
    updateUrl?: string;
  }): Promise<ContentLibrary> {
    const library = new ContentLibrary(
      options.bundled,
      options.directory,
      options.appVersion,
      options.fetcher ?? ((...args) => fetch(...args)),
      options.updateUrl ?? CONTENT_UPDATE_URL,
    );
    const bundledManifest = ContentManifestSchema.safeParse(
      options.bundledManifest,
    );
    if (
      bundledManifest.success &&
      bundledManifest.data.revision === library.status.revision
    )
      library.status.publishedAt = bundledManifest.data.publishedAt;
    for (const name of ["current.json", "previous.json"]) {
      try {
        const cached = JSON.parse(
          await library.readLimited(path.join(options.directory, name)),
        ) as Package;
        const manifest = library.checkManifest(cached.manifest);
        if (
          library.status.publishedAt &&
          Date.parse(manifest.publishedAt) <
            Date.parse(library.status.publishedAt)
        )
          break;
        const catalog = library.checkPackage(manifest, cached.data);
        library.current = { manifest, data: cached.data };
        library.catalog = catalog;
        library.status = {
          revision: manifest.revision,
          publishedAt: manifest.publishedAt,
          source: "downloaded",
          ...(library.status.warning
            ? { warning: library.status.warning }
            : {}),
        };
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT")
          library.status.warning =
            "Saved content could not be loaded. Using the last available copy.";
      }
    }
    return library;
  }
  private checkManifest(value: unknown): ContentManifest {
    const result = ContentManifestSchema.safeParse(value);
    if (!result.success)
      throw new Error(
        "The content update format is unsupported. Download the latest Vibe Learn.",
      );
    if (!versionAtLeast(this.appVersion, result.data.minimumAppVersion))
      throw new Error(
        `This content needs Vibe Learn ${result.data.minimumAppVersion} or newer. Download the latest app.`,
      );
    return result.data;
  }
  private checkPackage(manifest: ContentManifest, data: string): Catalog {
    if (
      typeof data !== "string" ||
      Buffer.byteLength(data) > MAX_CATALOG_BYTES ||
      hash(data) !== manifest.revision
    )
      throw new Error(
        "The content download is incomplete or damaged. Try updating again.",
      );
    return validateDownloadedCatalog(data);
  }
  private async readLimited(file: string): Promise<string> {
    if ((await fs.stat(file)).size > MAX_CATALOG_BYTES * 2 + 10000)
      throw new Error("Saved content is too large.");
    return fs.readFile(file, "utf8");
  }
  private async download(url: string, limit: number): Promise<string> {
    const response = await this.fetcher(url, {
      signal: AbortSignal.timeout(30000),
      redirect: "error",
      cache: "no-store",
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(
        `Content server returned HTTP ${response.status}. Try again later.`,
      );
    }
    if (Number(response.headers.get("content-length")) > limit) {
      await response.body?.cancel();
      throw new Error("Content download is too large.");
    }
    if (!response.body)
      throw new Error("The content server returned an empty response.");
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        bytes += part.value.byteLength;
        if (bytes > limit) throw new Error("Content download is too large.");
        chunks.push(part.value);
      }
    } finally {
      await reader.cancel();
    }
    return Buffer.concat(chunks).toString("utf8");
  }
  private async atomicWrite(name: string, data: string): Promise<void> {
    const temporary = path.join(
      this.directory,
      `${name}.${crypto.randomUUID()}.tmp`,
    );
    try {
      await fs.writeFile(temporary, data, { flag: "wx" });
      await fs.rename(temporary, path.join(this.directory, name));
    } finally {
      await fs.rm(temporary, { force: true });
    }
  }
  async update(): Promise<{ updated: boolean; status: ContentStatus }> {
    if (this.updating)
      throw new Error("A content update is already in progress.");
    this.updating = true;
    try {
      const manifest = this.checkManifest(
        JSON.parse(await this.download(this.updateUrl, 16000)),
      );
      if (manifest.revision === this.status.revision && !this.status.warning)
        return { updated: false, status: this.status };
      if (
        this.status.publishedAt &&
        Date.parse(manifest.publishedAt) < Date.parse(this.status.publishedAt)
      )
        return { updated: false, status: this.status };
      const data = await this.download(
        new URL(`${manifest.revision}.json`, this.updateUrl).toString(),
        MAX_CATALOG_BYTES,
      );
      const catalog = this.checkPackage(manifest, data);
      await fs.mkdir(this.directory, { recursive: true });
      if (this.current)
        await this.atomicWrite("previous.json", JSON.stringify(this.current));
      await this.atomicWrite(
        "current.json",
        JSON.stringify({ manifest, data }),
      );
      this.current = { manifest, data };
      this.catalog = catalog;
      this.status = {
        revision: manifest.revision,
        publishedAt: manifest.publishedAt,
        source: "downloaded",
      };
      return { updated: true, status: this.status };
    } catch (error) {
      if (
        error instanceof TypeError ||
        (error instanceof Error &&
          ["TimeoutError", "AbortError"].includes(error.name))
      )
        throw new Error(
          "Could not download content. Check your connection and try again.",
        );
      if (
        error instanceof SyntaxError ||
        (error instanceof Error && error.name === "ZodError")
      )
        throw new Error(
          "The published content could not be read. Try again later.",
        );
      throw error;
    } finally {
      this.updating = false;
    }
  }
}
