import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { builtinModules } from "node:module";
import { execFileSync } from "node:child_process";
import {
  AppManifestSchema,
  MAX_APP_BUNDLE_BYTES,
  type AppManifest,
} from "../src/shared/app-update";

type Lock = {
  packages: Record<
    string,
    {
      version?: string;
      dependencies?: Record<string, string>;
      optionalDependencies?: Record<string, string>;
    }
  >;
};
const sha256 = (data: string) =>
  crypto.createHash("sha256").update(data).digest("hex");
const walk = (dir: string): string[] =>
  fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) =>
      entry.isDirectory()
        ? walk(path.join(dir, entry.name))
        : [path.join(dir, entry.name)],
    );

/**
 * Fingerprint Electron and every installed package the built main and preload
 * code can load. Downloaded code only runs on an installation with the same one.
 */
export function appRuntime(appDir: string, lockRoot: string): string {
  const lock = JSON.parse(
    fs.readFileSync(path.join(lockRoot, "package-lock.json"), "utf8"),
  ) as Lock;
  const queue: string[] = [];
  for (const part of ["main", "preload"])
    for (const file of walk(path.join(appDir, part)))
      for (const [, spec] of fs
        .readFileSync(file, "utf8")
        .matchAll(/require\(["']([^"'.][^"']*)["']\)/g)) {
        const name = spec!
          .split("/")
          .slice(0, spec!.startsWith("@") ? 2 : 1)
          .join("/");
        if (
          !spec!.startsWith("node:") &&
          !builtinModules.includes(name) &&
          name !== "electron"
        )
          queue.push(name);
      }
  const included = new Set<string>();
  const seen = new Set<string>();
  while (queue.length) {
    const name = queue.pop()!;
    if (seen.has(name)) continue;
    seen.add(name);
    const keys = Object.keys(lock.packages).filter(
      (key) =>
        key === `node_modules/${name}` ||
        key.startsWith(`node_modules/${name}/node_modules/`),
    );
    if (!keys.length)
      throw new Error(
        `${name} is required by the app but missing from package-lock.json.`,
      );
    for (const key of keys) {
      included.add(key);
      const entry = lock.packages[key]!;
      queue.push(
        ...Object.keys({
          ...entry.dependencies,
          ...entry.optionalDependencies,
        }),
      );
    }
  }
  return sha256(
    JSON.stringify({
      format: 1,
      electron: lock.packages["node_modules/electron"]?.version,
      packages: [...included]
        .sort()
        .map((key) => [key, lock.packages[key]!.version]),
    }),
  );
}

export const gitInfo = (root: string) => ({
  commit: execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).trim(),
  publishedAt: execFileSync("git", ["log", "-1", "--format=%cI"], {
    cwd: root,
    encoding: "utf8",
  }).trim(),
});

/** Write a signed app update (latest.json plus <revision>.json) to destination. */
export function writeAppUpdate(options: {
  appDir: string;
  lockRoot: string;
  destination: string;
  privateKey: crypto.KeyObject | string;
  version: string;
  commit: string;
  publishedAt: string;
}): AppManifest {
  const files: Record<string, string> = {};
  for (const part of ["main", "preload", "renderer"])
    for (const file of walk(path.join(options.appDir, part)))
      files[path.relative(options.appDir, file).split(path.sep).join("/")] = fs
        .readFileSync(file)
        .toString("base64");
  const bundle = JSON.stringify({ formatVersion: 1, files });
  if (Buffer.byteLength(bundle) > MAX_APP_BUNDLE_BYTES)
    throw new Error("The app update exceeds the download limit.");
  const manifest = AppManifestSchema.parse({
    formatVersion: 1,
    revision: sha256(bundle),
    commit: options.commit,
    version: options.version,
    publishedAt: options.publishedAt,
    runtime: appRuntime(options.appDir, options.lockRoot),
  });
  const text = JSON.stringify(manifest);
  const signature = crypto
    .sign(null, Buffer.from(text), options.privateKey)
    .toString("base64");
  fs.rmSync(options.destination, { recursive: true, force: true });
  fs.mkdirSync(options.destination, { recursive: true });
  fs.writeFileSync(
    path.join(options.destination, `${manifest.revision}.json`),
    bundle,
  );
  fs.writeFileSync(
    path.join(options.destination, "latest.json"),
    JSON.stringify({ manifest: text, signature }),
  );
  return manifest;
}
