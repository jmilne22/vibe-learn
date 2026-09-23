import { build } from "vite";
import fs from "node:fs";
void build({ configFile: "vite.config.ts" })
  .then(() => {
    fs.writeFileSync("dist/.nojekyll", "");
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
