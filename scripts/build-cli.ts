import fs from "node:fs";
import path from "node:path";
import { build } from "vite";

async function main() {
  await build({
    configFile: false,
    build: {
      ssr: "src/cli/index.ts",
      outDir: "build/cli",
      emptyOutDir: true,
      target: "node24",
      rollupOptions: {
        output: {
          format: "es",
          entryFileNames: "index.js",
        },
      },
    },
    ssr: {
      noExternal: true,
    },
  });
  const out = path.resolve("build/cli/index.js");
  const contents = fs.readFileSync(out, "utf8");
  if (!contents.startsWith("#!/usr/bin/env node")) {
    fs.writeFileSync(out, `#!/usr/bin/env node\n${contents}`, "utf8");
  }
  fs.chmodSync(out, 0o755);
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

