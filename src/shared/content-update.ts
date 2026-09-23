import { z } from "zod";

// Raise this when authored content starts requiring new runtime behaviour.
export const MINIMUM_CONTENT_APP_VERSION = "2.0.2";
export const CONTENT_UPDATE_URL =
  "https://jmilne22.github.io/vibe-learn/updates/latest.json";
export const MAX_CATALOG_BYTES = 30_000_000;
export const ContentManifestSchema = z.object({
  formatVersion: z.literal(1),
  minimumAppVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
  publishedAt: z.iso.datetime({ offset: true }),
  revision: z.string().regex(/^[a-f0-9]{64}$/),
});
export type ContentManifest = z.infer<typeof ContentManifestSchema>;
export const ContentStatusSchema = z.object({
  revision: z.string(),
  source: z.enum(["bundled", "downloaded"]),
  publishedAt: z.string().optional(),
  warning: z.string().optional(),
});
export type ContentStatus = z.infer<typeof ContentStatusSchema>;
export const ContentUpdateResultSchema = z.object({
  updated: z.boolean(),
  status: ContentStatusSchema,
});
export function versionAtLeast(current: string, required: string): boolean {
  const a = current.split(".").map(Number),
    b = required.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if (!Number.isInteger(a[i])) return false;
    if (a[i]! !== b[i]!) return a[i]! > b[i]!;
  }
  return true;
}
