import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { validateDownloadedCatalog } from "./validate-catalog";
import type { Catalog } from "../shared/model";
import {
  ContentManifestSchema,
  MINIMUM_CONTENT_APP_VERSION,
  MAX_CATALOG_BYTES,
} from "../shared/content-update";

export function writeContentPackage(
  catalog: Catalog,
  destination: string,
  root: string,
): void {
  const data = JSON.stringify(catalog);
  if (Buffer.byteLength(data) > MAX_CATALOG_BYTES)
    throw new Error("Published catalog exceeds the 30 MB download limit.");
  validateDownloadedCatalog(data);
  const revision = crypto.createHash("sha256").update(data).digest("hex");
  const publishedAt = execFileSync("git", ["log", "-1", "--format=%cI"], {
    cwd: root,
    encoding: "utf8",
  }).trim();
  const manifest = ContentManifestSchema.parse({
    formatVersion: 1,
    minimumAppVersion: MINIMUM_CONTENT_APP_VERSION,
    publishedAt,
    revision,
  });
  fs.mkdirSync(destination, { recursive: true });
  fs.writeFileSync(path.join(destination, "catalog.json"), data);
  const updates = path.join(destination, "updates");
  fs.rmSync(updates, { recursive: true, force: true });
  fs.mkdirSync(updates);
  fs.writeFileSync(path.join(updates, `${revision}.json`), data);
  fs.writeFileSync(path.join(updates, "latest.json"), JSON.stringify(manifest));
}
