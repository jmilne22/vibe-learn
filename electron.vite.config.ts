import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import path from "node:path";
import react from "@vitejs/plugin-react";
export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: "build/app/main",
      rollupOptions: { input: "src/main/index.ts" },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: "build/app/preload",
      rollupOptions: {
        input: "src/preload/index.ts",
        output: { format: "cjs" },
      },
    },
  },
  renderer: {
    root: "src/renderer",
    plugins: [
      react(),
      {
        name: "dev-csp",
        apply: "serve",
        transformIndexHtml: (html) =>
          html.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, ""),
      },
    ],
    build: {
      outDir: path.resolve("build/app/renderer"),
      // The CSP has no font-src, so fonts must stay as files rather than data: URIs.
      assetsInlineLimit: (file) => (/\.woff2?$/.test(file) ? false : undefined),
    },
  },
});
