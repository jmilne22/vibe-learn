import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import {
  APP_UPDATE_URL,
  AppEnvelopeSchema,
  AppManifestSchema,
  MAX_APP_BUNDLE_BYTES,
  type AppEnvelope,
  type AppManifest,
  type AppStatus,
  type AppUpdateResult,
} from "../shared/app-update";

// Ed25519 key whose private half is only available to the main-branch CI publish step.
const PUBLIC_KEY =
  "MCowBQYDK2VwAyEAojXoyTy+8+Vbg/0bH7W/7/NqT0N61bcwsCeEGCMnmzQ=";
/** Tests sign fixtures with their own key. */
export const appUpdateKey = () =>
  process.env.VIBE_APP_UPDATE_PUBLIC_KEY || PUBLIC_KEY;

/** Written into the installed resources when the app is packaged. */
export interface Shell {
  appRuntime: string;
  publishedAt: string;
  commit: string;
}
/** What the startup bootstrap chose, shared with the main process. */
export interface Boot {
  revision?: string;
  version?: string;
  commit?: string;
  publishedAt?: string;
  failed?: boolean;
  healthy(): void;
  fail(): void;
}
export const boot = (): Boot =>
  (globalThis as { vibeBoot?: Boot }).vibeBoot ?? {
    healthy() {},
    fail() {},
  };

export function readShell(resources: string): Shell | undefined {
  try {
    const shell = JSON.parse(
      fs.readFileSync(path.join(resources, "runtime.json"), "utf8"),
    ) as Partial<Shell>;
    return shell.appRuntime && shell.publishedAt && shell.commit
      ? (shell as Shell)
      : undefined;
  } catch {
    return undefined;
  }
}

export function verifyEnvelope(value: unknown, publicKey: string): AppManifest {
  const envelope = AppEnvelopeSchema.parse(value);
  const key = crypto.createPublicKey({
    key: Buffer.from(publicKey, "base64"),
    format: "der",
    type: "spki",
  });
  if (
    !crypto.verify(
      null,
      Buffer.from(envelope.manifest),
      key,
      Buffer.from(envelope.signature, "base64"),
    )
  )
    throw new Error("The app update is not signed by Vibe Learn.");
  return AppManifestSchema.parse(JSON.parse(envelope.manifest));
}

const readJson = (file: string): unknown =>
  JSON.parse(fs.readFileSync(file, "utf8"));
const revisionIn = (file: string) => {
  try {
    return (readJson(file) as { revision?: string }).revision;
  } catch {
    return undefined;
  }
};
const newer = (a: string, b: string) => Date.parse(a) > Date.parse(b);

export type Selection =
  | { kind: "none" }
  | { kind: "failed" }
  | { kind: "load"; manifest: AppManifest; root: string };
/**
 * Decide at startup whether to run downloaded code. An update is skipped when
 * it is older than the installed app, built for a different runtime, or failed
 * to reach a loaded window last time.
 */
export function selectUpdate(
  directory: string,
  shell: Shell,
  publicKey: string,
): Selection {
  let manifest: AppManifest;
  try {
    manifest = verifyEnvelope(
      readJson(path.join(directory, "current.json")),
      publicKey,
    );
  } catch {
    return { kind: "none" };
  }
  if (
    manifest.runtime !== shell.appRuntime ||
    !newer(manifest.publishedAt, shell.publishedAt)
  )
    return { kind: "none" };
  if (revisionIn(path.join(directory, "failed.json")) === manifest.revision)
    return { kind: "failed" };
  if (
    revisionIn(path.join(directory, "launching.json")) === manifest.revision
  ) {
    markFailed(directory, manifest.revision);
    return { kind: "failed" };
  }
  const root = path.join(directory, manifest.revision);
  if (!fs.existsSync(path.join(root, "main/index.js"))) return { kind: "none" };
  return { kind: "load", manifest, root };
}
export const markLaunching = (directory: string, revision: string) =>
  fs.writeFileSync(
    path.join(directory, "launching.json"),
    JSON.stringify({ revision }),
  );
export const markHealthy = (directory: string) =>
  fs.rmSync(path.join(directory, "launching.json"), { force: true });
export function markFailed(directory: string, revision: string): void {
  fs.writeFileSync(
    path.join(directory, "failed.json"),
    JSON.stringify({ revision }),
  );
  markHealthy(directory);
}

const FILE = /^(main|preload|renderer)\/[\w.@-]+(\/[\w.@-]+)*$/;
function bundleFiles(data: string): Map<string, Buffer> {
  const bundle = JSON.parse(data) as {
    formatVersion?: unknown;
    files?: unknown;
  };
  if (
    bundle.formatVersion !== 1 ||
    !bundle.files ||
    typeof bundle.files !== "object"
  )
    throw new Error("The app update format is unsupported.");
  const files = new Map<string, Buffer>();
  for (const [name, content] of Object.entries(bundle.files)) {
    if (
      !FILE.test(name) ||
      name.split("/").some((part) => /^\.+$/.test(part)) ||
      typeof content !== "string"
    )
      throw new Error("The app update contains an unexpected file.");
    files.set(name, Buffer.from(content, "base64"));
  }
  for (const required of [
    "main/index.js",
    "preload/index.js",
    "renderer/index.html",
  ])
    if (!files.has(required))
      throw new Error("The app update is incomplete. Try updating again.");
  return files;
}

export class AppUpdater {
  status: AppStatus;
  private updating = false;
  private pending?: AppManifest;
  constructor(
    private options: {
      directory: string;
      shell?: Shell;
      version: string;
      boot: Boot;
      fetcher?: typeof fetch;
      url?: string;
      publicKey?: string;
    },
  ) {
    const { shell, boot, version } = options;
    this.status = !shell
      ? { version, source: "development", pending: false }
      : boot.revision
        ? {
            version: boot.version ?? version,
            source: "downloaded",
            commit: boot.commit,
            publishedAt: boot.publishedAt,
            pending: false,
          }
        : {
            version,
            source: "installed",
            commit: shell.commit,
            publishedAt: shell.publishedAt,
            pending: false,
          };
    if (boot.failed)
      this.status.warning =
        "The downloaded app update could not start, so the installed version is running.";
  }
  private async download(url: string, limit: number): Promise<string> {
    const response = await (this.options.fetcher ?? fetch)(url, {
      signal: AbortSignal.timeout(60000),
      redirect: "error",
      cache: "no-store",
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(
        `Update server returned HTTP ${response.status}. Try again later.`,
      );
    }
    if (Number(response.headers.get("content-length")) > limit) {
      await response.body?.cancel();
      throw new Error("App update is too large.");
    }
    if (!response.body)
      throw new Error("The update server returned an empty response.");
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        bytes += part.value.byteLength;
        if (bytes > limit) throw new Error("App update is too large.");
        chunks.push(part.value);
      }
    } finally {
      await reader.cancel();
    }
    return Buffer.concat(chunks).toString("utf8");
  }
  async update(): Promise<AppUpdateResult> {
    const { shell, directory, boot } = this.options;
    if (!shell)
      throw new Error(
        "App updates apply to the installed app. In development, pull the latest code with git.",
      );
    if (this.updating) throw new Error("An app update is already in progress.");
    this.updating = true;
    try {
      const url = this.options.url ?? APP_UPDATE_URL;
      const envelope = JSON.parse(
        await this.download(url, 16000),
      ) as AppEnvelope;
      const manifest = verifyEnvelope(
        envelope,
        this.options.publicKey ?? appUpdateKey(),
      );
      const latest =
        this.pending?.publishedAt ?? boot.publishedAt ?? shell.publishedAt;
      if (
        manifest.revision === (this.pending?.revision ?? boot.revision) ||
        !newer(manifest.publishedAt, latest)
      )
        return { result: "current", status: this.status };
      if (manifest.runtime !== shell.appRuntime)
        return { result: "installer", status: this.status };
      const data = await this.download(
        new URL(`${manifest.revision}.json`, url).toString(),
        MAX_APP_BUNDLE_BYTES,
      );
      if (
        crypto.createHash("sha256").update(data).digest("hex") !==
        manifest.revision
      )
        throw new Error(
          "The app update download is incomplete or damaged. Try updating again.",
        );
      const files = bundleFiles(data);
      await fsp.mkdir(directory, { recursive: true });
      const staging = path.join(
        directory,
        `${manifest.revision}.${crypto.randomUUID()}.tmp`,
      );
      const root = path.join(directory, manifest.revision);
      try {
        for (const [name, content] of files) {
          const target = path.join(staging, name);
          await fsp.mkdir(path.dirname(target), { recursive: true });
          await fsp.writeFile(target, content);
        }
        await fsp.rm(root, { recursive: true, force: true });
        await fsp.rename(staging, root);
      } finally {
        await fsp.rm(staging, { recursive: true, force: true });
      }
      const temporary = path.join(
        directory,
        `current.${crypto.randomUUID()}.tmp`,
      );
      await fsp.writeFile(temporary, JSON.stringify(envelope), { flag: "wx" });
      await fsp.rename(temporary, path.join(directory, "current.json"));
      // Keep the running version's files: its window is still served from them.
      for (const name of await fsp.readdir(directory))
        if (
          /^[a-f0-9]{64}$/.test(name) &&
          name !== manifest.revision &&
          name !== boot.revision
        )
          await fsp.rm(path.join(directory, name), {
            recursive: true,
            force: true,
          });
      this.pending = manifest;
      this.status = { ...this.status, pending: true };
      delete this.status.warning;
      return { result: "updated", status: this.status };
    } catch (error) {
      if (
        error instanceof TypeError ||
        (error instanceof Error &&
          ["TimeoutError", "AbortError"].includes(error.name))
      )
        throw new Error(
          "Could not download the app update. Check your connection and try again.",
        );
      if (
        error instanceof SyntaxError ||
        (error instanceof Error && error.name === "ZodError")
      )
        throw new Error(
          "The published app update could not be read. Try again later.",
        );
      throw error;
    } finally {
      this.updating = false;
    }
  }
}
