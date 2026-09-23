import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  root: "src/renderer",
  base: "./",
  plugins: [react()],
  publicDir: "../../build/content",
  server: { port: 5173, strictPort: true },
  build: { outDir: "../../dist", emptyOutDir: true },
});
