import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: "src/renderer",
  base: "./",
  plugins: [
    react(),
    {
      name: "write-nojekyll",
      closeBundle() {
        fs.writeFileSync(path.resolve("dist/.nojekyll"), "");
      },
    },
  ],
  publicDir: "../../build/content",
  server: { port: 5173, strictPort: true },
  build: { outDir: "../../dist", emptyOutDir: true },
});
