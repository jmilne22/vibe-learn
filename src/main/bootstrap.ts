// Package entry point. Runs the newest downloaded app code when it is valid for
// this installation, and the installed code otherwise.
import { app } from "electron";
import Module from "node:module";
import path from "node:path";
import {
  appUpdateKey,
  markFailed,
  markHealthy,
  markLaunching,
  readShell,
  selectUpdate,
  type Boot,
} from "./app-update";
import { profileDir } from "./profile";

const boot: Boot = { healthy() {}, fail() {} };
(globalThis as { vibeBoot?: Boot }).vibeBoot = boot;
const load = Module.createRequire(__filename);
let entry = path.join(__dirname, "index.js");
if (app.isPackaged && process.env.VIBE_APP_UPDATES !== "off") {
  const directory = path.join(profileDir(), "app-update");
  try {
    const shell = readShell(path.join(process.resourcesPath, "learning"));
    const choice = shell
      ? selectUpdate(directory, shell, appUpdateKey())
      : { kind: "none" as const };
    if (choice.kind === "failed") boot.failed = true;
    if (choice.kind === "load") {
      const { revision, version, commit, publishedAt } = choice.manifest;
      // Downloaded code uses the packages installed with the app.
      process.env.NODE_PATH = [
        path.join(app.getAppPath(), "node_modules"),
        process.env.NODE_PATH,
      ]
        .filter(Boolean)
        .join(path.delimiter);
      (Module as unknown as { _initPaths(): void })._initPaths();
      Object.assign(boot, {
        revision,
        version,
        commit,
        publishedAt,
        healthy: () => markHealthy(directory),
        fail: () => markFailed(directory, revision),
      });
      markLaunching(directory, revision);
      entry = path.join(choice.root, "main/index.js");
    }
  } catch {
    // A damaged update folder must never stop the installed app from starting.
  }
}
try {
  load(entry);
} catch (error) {
  if (!boot.revision) throw error;
  boot.fail();
  app.relaunch();
  app.exit(0);
}
