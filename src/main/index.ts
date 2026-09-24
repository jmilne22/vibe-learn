import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  net,
  protocol,
  session,
  shell,
} from "electron";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  CommandSchema,
  type Workspace,
  type ExerciseWorkspace,
  type Run,
} from "../shared/model";
import { prepareExercise } from "./exercises";
import { reviewCard } from "./review";
import { Store } from "./store";
import { Runner } from "./runner";
import { ContentLibrary } from "./content-library";
const profile =
  process.env.VIBE_USER_DATA_DIR ||
  path.join(
    app.getPath("appData"),
    app.isPackaged ? "Vibe Learn 2" : "Vibe Learn 2 Dev",
  );
app.setPath("userData", profile);
protocol.registerSchemesAsPrivileged([
  {
    scheme: "vibe",
    privileges: { standard: true, secure: true, supportFetchAPI: true },
  },
]);
let window: BrowserWindow | null = null;
let store: Store;
let runner: Runner;
let closing = false;
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", () => {
    window?.restore();
    window?.focus();
  });
  void app
    .whenReady()
    .then(start)
    .catch((error) => {
      dialog.showErrorBox("Vibe Learn could not start", String(error));
      app.exit(1);
    });
}
async function start(): Promise<void> {
  const resources = app.isPackaged
    ? path.join(process.resourcesPath, "learning")
    : path.join(app.getAppPath(), "build/content");
  const bundled = fs.readFileSync(
    (!app.isPackaged && process.env.VIBE_DEV_CATALOG) ||
      path.join(resources, "catalog.json"),
    "utf8",
  );
  const manifestPath = path.join(resources, "updates/latest.json");
  const library = await ContentLibrary.open({
    bundled,
    directory: path.join(profile, "content"),
    appVersion: app.getVersion(),
    bundledManifest: fs.existsSync(manifestPath)
      ? JSON.parse(fs.readFileSync(manifestPath, "utf8"))
      : undefined,
  });
  let catalog = library.catalog;
  let updatingContent = false;
  store = await Store.open(path.join(profile, "learning.sqlite"));
  const changed = () => window?.webContents.send("learning:changed");
  const bundledGo = path.join(
    resources,
    "go/bin",
    process.platform === "win32" ? "go.exe" : "go",
  );
  runner = new Runner(
    store,
    path.join(profile, "runs"),
    fs.existsSync(bundledGo) ? bundledGo : "go",
    changed,
  );
  const rendererRoot = path.resolve(__dirname, "../renderer");
  protocol.handle("vibe", (request) => {
    const url = new URL(request.url);
    if (url.hostname !== "app")
      return new Response("Not found", { status: 404 });
    let target: string;
    try {
      target = path.resolve(
        rendererRoot,
        "." +
          decodeURIComponent(
            url.pathname === "/" ? "/index.html" : url.pathname,
          ),
      );
    } catch {
      return new Response("Invalid path", { status: 400 });
    }
    if (!target.startsWith(rendererRoot + path.sep))
      return new Response("Not found", { status: 404 });
    return net.fetch(pathToFileURL(target).toString());
  });
  session.defaultSession.setPermissionRequestHandler(
    (_webContents, _permission, callback) => callback(false),
  );
  session.defaultSession.setPermissionCheckHandler(() => false);
  ipcMain.handle("learning:invoke", async (event, raw: unknown) => {
    if (
      !window ||
      event.sender !== window.webContents ||
      event.senderFrame !== window.webContents.mainFrame
    )
      throw new Error("Untrusted caller");
    const input = CommandSchema.parse(raw);
    if (input.type === "catalog") return catalog;
    if (input.type === "state") return store.state();
    if (input.type === "content-status") return library.status;
    if (input.type === "update-content") {
      if (updatingContent)
        throw new Error("A content update is already in progress.");
      if (store.state().runs.some((run) => run.status === "running"))
        throw new Error(
          "Wait for the current run to finish before updating content.",
        );
      updatingContent = true;
      try {
        const result = await library.update();
        catalog = library.catalog;
        return result;
      } finally {
        updatingContent = false;
      }
    }
    if (updatingContent && (input.type === "run" || input.type === "exercise"))
      throw new Error(
        "Wait for the content update to finish before starting an activity.",
      );
    const item =
      "itemId" in input
        ? catalog.items.find((i) => i.id === input.itemId)
        : undefined;
    if ("itemId" in input && !item)
      throw new Error("Unknown course or project");
    if ("stageId" in input && !item!.stages.some((s) => s.id === input.stageId))
      throw new Error("Unknown section");
    switch (input.type) {
      case "progress":
        store.put("progress", input.itemId, {
          itemId: input.itemId,
          stageId: input.stageId,
          scroll: input.scroll,
          updatedAt: new Date().toISOString(),
        });
        break;
      case "note":
        store.put("notes", input.itemId, {
          itemId: input.itemId,
          text: input.text,
          updatedAt: new Date().toISOString(),
        });
        break;
      case "bookmark":
        store.bookmark(input.itemId, input.stageId);
        break;
      case "workspace": {
        const existing = store.get<Workspace>("workspaces", input.itemId);
        if (input.action === "open") {
          if (!existing) throw new Error("Attach a workspace first");
          const error = await shell.openPath(existing.path);
          if (error) throw new Error(error);
          return existing;
        }
        const selected = await dialog.showOpenDialog(window, {
          title:
            input.action === "create"
              ? "Choose the parent folder for a new workspace"
              : "Attach your existing project folder",
          properties: ["openDirectory", "createDirectory"],
        });
        if (selected.canceled || !selected.filePaths[0]) return null;
        let folder = fs.realpathSync(selected.filePaths[0]);
        if (input.action === "create") {
          folder = path.join(
            folder,
            item!.id.replace(/[^a-zA-Z0-9-]/g, "-") + "-" + Date.now(),
          );
          fs.mkdirSync(folder); // New folders only; never replace files in an attached repository.
          if (item!.checks.length)
            fs.writeFileSync(
              path.join(folder, "go.mod"),
              "module vibe.local/workspace\n\ngo 1.22\n",
            );
          fs.writeFileSync(
            path.join(folder, "VIBE-PROJECT.md"),
            `# ${item!.title}\n\n${item!.description}\n\n${item!.stages[0]!.text}\n`,
          );
        }
        const workspace: Workspace = {
          itemId: input.itemId,
          path: folder,
          buildTarget: ".",
          maelstromPath: "",
        };
        store.put("workspaces", input.itemId, workspace);
        changed();
        return workspace;
      }
      case "review": {
        if (item?.kind !== "course")
          throw new Error("Flashcards belong to courses.");
        const card = item.flashcards.find((c) => c.id === input.cardId);
        if (!card) throw new Error("Unknown flashcard.");
        const result = reviewCard(
          store,
          item.id,
          card,
          input.cardVersion,
          input.expectedUpdatedAt,
          input.grade,
        );
        changed();
        return result;
      }
      case "exercise": {
        if (item?.kind !== "course")
          throw new Error("Exercises belong to courses.");
        const exercise = item.exercises.find((e) => e.id === input.exerciseId);
        if (!exercise) throw new Error("Unknown exercise.");
        const key = `${item.id}/${exercise.id}`;
        const existing = store.get<ExerciseWorkspace>(
          "exerciseWorkspaces",
          key,
        );
        if (input.action === "run") {
          if (!existing)
            throw new Error("Prepare or attach the exercise folder first.");
          return runner.start(
            item,
            {
              id: `exercise:${exercise.id}`,
              title: exercise.title,
              kind: "exercise",
              suiteVersion: exercise.version,
              description: "Provided exercise checks",
              unchecked: [],
            },
            {
              itemId: item.id,
              path: existing.path,
              buildTarget: ".",
              maelstromPath: "",
            },
            exercise,
          );
        }
        if (
          input.action === "open" ||
          (input.action === "prepare" && existing)
        ) {
          if (!existing) throw new Error("Prepare an exercise folder first.");
          const error = await shell.openPath(existing.path);
          if (error) throw new Error(error);
          return existing;
        }
        const selected = await dialog.showOpenDialog(window, {
          title:
            input.action === "attach"
              ? "Attach an existing exercise folder"
              : "Choose where to create a fresh exercise folder",
          properties: ["openDirectory", "createDirectory"],
        });
        if (selected.canceled || !selected.filePaths[0]) return null;
        const workspace: ExerciseWorkspace =
          input.action === "attach"
            ? {
                itemId: item.id,
                exerciseId: exercise.id,
                path: fs.realpathSync(selected.filePaths[0]),
                version: exercise.version,
              }
            : prepareExercise(selected.filePaths[0], item.id, exercise);
        store.put("exerciseWorkspaces", key, workspace);
        changed();
        return workspace;
      }
      case "configure": {
        const workspace = store.get<Workspace>("workspaces", input.itemId);
        if (!workspace) throw new Error("Attach a workspace first");
        if (
          path.isAbsolute(input.buildTarget) ||
          input.buildTarget.split(/[\\/]/).includes("..")
        )
          throw new Error(
            "Build target must be within your attached workspace (for example ./cmd/relay).",
          );
        store.put("workspaces", input.itemId, {
          ...workspace,
          buildTarget: input.buildTarget,
          maelstromPath: input.maelstromPath,
        });
        break;
      }
      case "run": {
        const check = item!.checks.find((c) => c.id === input.checkId);
        const workspace = store.get<Workspace>("workspaces", input.itemId);
        if (!check)
          throw new Error("This project has no such automated check.");
        if (!workspace) throw new Error("Attach a workspace first.");
        return runner.start(item!, check, workspace);
      }
      case "cancel":
        runner.cancel(input.runId);
        return null;
      case "artifacts": {
        const run = store.get<Run>("runs", input.runId);
        const folder = run?.artifactDir;
        if (
          !folder ||
          path.resolve(folder) !== path.join(profile, "runs", input.runId)
        )
          throw new Error("Artifacts are not available on this machine.");
        const error = await shell.openPath(folder);
        if (error) throw new Error(error);
        return null;
      }
      case "copy":
        clipboard.writeText(input.text);
        return null;
      case "backup": {
        const target = await dialog.showSaveDialog(window, {
          defaultPath: `vibe-learn-${new Date().toISOString().slice(0, 10)}.json`,
          filters: [{ name: "JSON backup", extensions: ["json"] }],
        });
        if (!target.canceled && target.filePath)
          fs.writeFileSync(
            target.filePath,
            JSON.stringify(store.backup(), null, 2),
          );
        return null;
      }
      case "export-notes": {
        const note = store.state().notes.find((n) => n.itemId === input.itemId);
        const target = await dialog.showSaveDialog(window, {
          defaultPath: item!.id.replace(":", "-") + "-notes.md",
          filters: [{ name: "Markdown", extensions: ["md"] }],
        });
        if (!target.canceled && target.filePath)
          fs.writeFileSync(
            target.filePath,
            `# ${item!.title}\n\n${note?.text || ""}\n`,
          );
        return null;
      }
      case "import": {
        const target = await dialog.showOpenDialog(window, {
          properties: ["openFile"],
          filters: [{ name: "Vibe Learn JSON export", extensions: ["json"] }],
        });
        if (target.canceled || !target.filePaths[0]) return null;
        if (fs.statSync(target.filePaths[0]).size > 30_000_000)
          throw new Error("Backup exceeds 30 MB.");
        const result = await store.import(
          JSON.parse(fs.readFileSync(target.filePaths[0], "utf8")),
          path.join(profile, `before-import-${Date.now()}.sqlite`),
        );
        changed();
        return result;
      }
    }
    changed();
    return null;
  });
  createWindow();
}
function createWindow(): void {
  window = new BrowserWindow({
    width: 1320,
    height: 900,
    minWidth: 760,
    minHeight: 540,
    title: "Vibe Learn",
    backgroundColor: "#f5f2ea",
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  const devUrl = !app.isPackaged
    ? process.env.ELECTRON_RENDERER_URL
    : undefined;
  window.webContents.on("will-navigate", (event, url) => {
    if (!(
      url.startsWith("vibe://app/") ||
      (devUrl && new URL(url).origin === new URL(devUrl).origin)
    ))
      event.preventDefault();
  });
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  window.on("closed", () => {
    window = null;
  });
  void window.loadURL(devUrl || "vibe://app/");
}
app.on("activate", () => {
  if (!window && store) createWindow();
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
app.on("before-quit", (event) => {
  if (closing || !runner) return;
  event.preventDefault();
  closing = true;
  void runner.close().finally(() => {
    store.close();
    app.quit();
  });
});
