import fs from "node:fs";
import path from "node:path";
import { gitInfo, writeAppUpdate } from "./app-update-package";

// Runs in CI after `npm run build`, on main only. Pull requests never publish.
const privateKey = process.env.APP_UPDATE_SIGNING_KEY;
if (!privateKey) {
  console.log(
    "::warning::APP_UPDATE_SIGNING_KEY is not set, so no app update was published.",
  );
} else {
  const root = path.resolve(".");
  const { version } = JSON.parse(
    fs.readFileSync(path.join(root, "package.json"), "utf8"),
  ) as { version: string };
  const manifest = writeAppUpdate({
    appDir: path.join(root, "build/app"),
    lockRoot: root,
    destination: path.join(root, "dist/updates/app"),
    privateKey,
    version,
    ...gitInfo(root),
  });
  console.log(
    `Published app update ${manifest.version} (${manifest.commit.slice(0, 7)}).`,
  );
}
