import { z } from "zod";

// App code published from main, alongside the content updates on GitHub Pages.
export const APP_UPDATE_URL = "https://vibe-learn.ai/updates/app/latest.json";
export const MAX_APP_BUNDLE_BYTES = 80_000_000;
export const AppManifestSchema = z.object({
  formatVersion: z.literal(1),
  revision: z.string().regex(/^[a-f0-9]{64}$/),
  commit: z.string().regex(/^[a-f0-9]{40}$/),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  publishedAt: z.iso.datetime({ offset: true }),
  // Electron plus the installed packages the main process loads; code for a different runtime needs an installer.
  runtime: z.string().regex(/^[a-f0-9]{64}$/),
});
export type AppManifest = z.infer<typeof AppManifestSchema>;
/** The manifest is signed as the exact text that is published. */
export const AppEnvelopeSchema = z.object({
  manifest: z.string().max(4000),
  signature: z.string().max(200),
});
export type AppEnvelope = z.infer<typeof AppEnvelopeSchema>;
export const AppStatusSchema = z.object({
  version: z.string(),
  source: z.enum(["installed", "downloaded", "development"]),
  commit: z.string().optional(),
  publishedAt: z.string().optional(),
  pending: z.boolean(),
  warning: z.string().optional(),
});
export type AppStatus = z.infer<typeof AppStatusSchema>;
export const AppUpdateResultSchema = z.object({
  result: z.enum(["updated", "current", "installer"]),
  status: AppStatusSchema,
});
export type AppUpdateResult = z.infer<typeof AppUpdateResultSchema>;
