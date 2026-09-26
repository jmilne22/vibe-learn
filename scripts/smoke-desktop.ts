import {
  _electron as electron,
  expect,
  type ElectronApplication,
} from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { fixtureCourse } from "../tests/v2/fixtures/course";
import type { Catalog, AppState, Command } from "../src/shared/model";
import type { AppStatus } from "../src/shared/app-update";
import { gitInfo, writeAppUpdate } from "./app-update-package";
async function main(): Promise<void> {
  const packaged = process.argv.includes("--packaged");
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "vibe-smoke-"));
  const workspace = path.join(root, "my-code");
  await fs.mkdir(workspace);
  await fs.writeFile(
    path.join(workspace, "go.mod"),
    "module smoke\n\ngo 1.22\n",
  );
  const source =
    'package smoke\nimport "testing"\nfunc TestAddition(t *testing.T) { if 2+2 != 4 { t.Fatal("addition") } }\n';
  await fs.writeFile(path.join(workspace, "addition_test.go"), source);
  let executablePath = packaged
    ? process.env.VIBE_PACKAGED_EXECUTABLE
    : process.env.ELECTRON_PATH;
  if (packaged && !executablePath) {
    const parent = path.resolve(
      "out",
      `Vibe Learn-${process.platform}-${process.arch}`,
    );
    executablePath =
      process.platform === "darwin"
        ? path.join(parent, "Vibe Learn.app/Contents/MacOS/vibe-learn")
        : path.join(
            parent,
            process.platform === "win32" ? "vibe-learn.exe" : "vibe-learn",
          );
  }
  const env = {
    ...process.env,
    VIBE_USER_DATA_DIR: path.join(root, "profile"),
    ELECTRON_DISABLE_SECURITY_WARNINGS: "true",
  } as Record<string, string>;
  if (!packaged) {
    const catalog = JSON.parse(
      await fs.readFile("build/content/catalog.json", "utf8"),
    ) as Catalog;
    catalog.items.push({
      ...fixtureCourse,
      title: "Course activities · preview",
    });
    env.VIBE_DEV_CATALOG = path.join(root, "test-catalog.json");
    await fs.writeFile(env.VIBE_DEV_CATALOG, JSON.stringify(catalog));
  }
  delete env.ELECTRON_RUN_AS_NODE;
  // Packaged runs trust a throwaway key so the smoke can sign its own app update.
  const updateKeys = crypto.generateKeyPairSync("ed25519");
  if (packaged)
    env.VIBE_APP_UPDATE_PUBLIC_KEY = updateKeys.publicKey
      .export({ type: "spki", format: "der" })
      .toString("base64");
  // Empty PATH proves packaged basic Go checks use the bundled toolchain, not a host installation.
  if (packaged) {
    env.PATH = "";
    env.GOPROXY = "off";
    env.GOSUMDB = "off";
  }
  const launch = () =>
    electron.launch({
      executablePath,
      args: [
        ...(process.platform === "linux" ? ["--no-sandbox"] : []),
        ...(packaged ? [] : [path.resolve(".")]),
      ],
      env,
      timeout: 30000,
    });
  let app: ElectronApplication | undefined;
  try {
    app = await launch();
    expect(await app.evaluate(({ app }) => app.isPackaged)).toBe(packaged);
    let page = await app.firstWindow();
    await expect(
      page.getByRole("heading", { name: "Continue", exact: true }),
    ).toBeVisible();
    const call = (input: Command) =>
      page.evaluate((command) => window.learning!.invoke(command), input);
    const catalog = (await call({ type: "catalog" })) as Catalog;
    const relay = catalog.items.find((i) => i.id === "project:ingest-relay")!;
    const operator = catalog.items.find(
      (i) => i.id === "project:relay-operator",
    )!;
    expect(operator.checks).toEqual([]);
    await page.evaluate(
      ({ itemId, stageId }) => {
        location.hash = `/read/${encodeURIComponent(itemId)}/${stageId}`;
      },
      { itemId: relay.id, stageId: relay.stages[0]!.id },
    );
    await page.getByRole("button", { name: "Notes", exact: true }).click();
    await page
      .getByRole("textbox", { name: "Notes", exact: true })
      .fill("Keep my reasoning and my tests.");
    await page.getByRole("button", { name: "Save notes", exact: true }).click();
    await expect(page.getByText("Saved locally")).toBeVisible();
    await page.getByRole("button", { name: "Close panel" }).click();
    await page.getByRole("button", { name: "☆ Bookmark", exact: true }).click();
    await page.getByRole("button", { name: "Copy stage context" }).click();
    expect(
      await app.evaluate(({ clipboard }) => clipboard.readText()),
    ).toContain("Build an ingest relay");
    await app.evaluate(({ dialog }, folder) => {
      dialog.showOpenDialog = (async () => ({
        canceled: false,
        filePaths: [folder],
      })) as typeof dialog.showOpenDialog;
    }, workspace);
    await call({
      type: "workspace",
      itemId: relay.id,
      action: "attach",
      mode: "mentor",
    });
    await page.getByRole("button", { name: "Workspace", exact: true }).click();
    await page
      .getByRole("button", { name: "Run your tests", exact: true })
      .click();
    await expect
      .poll(
        async () => ((await call({ type: "state" })) as AppState).runs.length,
      )
      .toBe(1);
    const runId = ((await call({ type: "state" })) as AppState).runs[0]!.id;
    await expect
      .poll(
        async () =>
          ((await call({ type: "state" })) as AppState).runs.find(
            (r) => r.id === runId,
          )?.status,
        { timeout: 120000 },
      )
      .toBe("passed");
    await expect(
      page.locator("summary").filter({ hasText: "Your tests · passed" }),
    ).toBeVisible();
    const state = (await call({ type: "state" })) as AppState;
    expect(state.runs[0]?.sourceHash).toMatch(/^[a-f0-9]{64}$/);
    expect(
      await fs.readFile(path.join(workspace, "addition_test.go"), "utf8"),
    ).toBe(source);
    const reporter = catalog.items.find(
      (i) => i.id === "project:cloud-reporter",
    )!;
    const parent = path.join(root, "projects");
    await fs.mkdir(parent);
    await app.evaluate(({ dialog }, folder) => {
      dialog.showOpenDialog = (async () => ({
        canceled: false,
        filePaths: [folder],
      })) as typeof dialog.showOpenDialog;
    }, parent);
    const created = (await call({
      type: "workspace",
      itemId: reporter.id,
      action: "create",
      mode: "mentor",
    })) as { path: string };
    // Compare names, not full paths: Windows may report the temp directory in
    // its 8.3 short form (RUNNER~1) on one side and long form on the other.
    expect(path.basename(created.path)).toBe("cloud-reporter");
    const folder = path.join(parent, "cloud-reporter");
    expect(
      await fs.readFile(path.join(folder, "steps/02-fetch-page.md"), "utf8"),
    ).toContain("<details>");
    for (const file of [
      "README.md",
      "AGENTS.md",
      "NOTES.md",
      "go.mod",
      ".claude/settings.local.json",
    ])
      await fs.access(path.join(folder, file));
    await expect(
      call({ type: "run", itemId: operator.id, checkId: "go-test" }),
    ).rejects.toThrow();
    await expect(
      call({
        type: "progress",
        itemId: relay.id,
        stageId: "not-a-stage",
        scroll: 0,
      }),
    ).rejects.toThrow();
    const backup = path.join(root, "export.json");
    await app.evaluate(({ dialog }, file) => {
      dialog.showSaveDialog = (async () => ({
        canceled: false,
        filePath: file,
      })) as typeof dialog.showSaveDialog;
    }, backup);
    await call({ type: "backup" });
    expect(
      JSON.parse(await fs.readFile(backup, "utf8")).state.notes[0].text,
    ).toContain("reasoning");
    await fs.mkdir("build/screenshots", { recursive: true });
    await page.screenshot({ path: "build/screenshots/desktop.png" });
    await page.getByRole("button", { name: "Close panel" }).click();
    await page.evaluate(() => {
      location.hash = "/read/project%3Aingest-relay/session-2";
    });
    await expect(page.locator("article")).toContainText("Put it behind HTTP");
    await expect
      .poll(
        async () =>
          ((await call({ type: "state" })) as AppState).progress.find(
            (p) => p.itemId === relay.id,
          )?.stageId,
      )
      .toBe("session-2");
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all(
        [...document.images].map((image) => image.decode().catch(() => {})),
      );
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
    });
    await page.evaluate(() =>
      window.scrollTo(
        0,
        (document.documentElement.scrollHeight - innerHeight) * 0.55,
      ),
    );
    await expect
      .poll(
        async () =>
          ((await call({ type: "state" })) as AppState).progress.find(
            (p) => p.itemId === relay.id,
          )?.scroll || 0,
      )
      .toBeGreaterThan(0.5);
    await page
      .getByRole("navigation")
      .getByRole("link", { name: "Projects" })
      .click();
    const position = (
      (await call({ type: "state" })) as AppState
    ).progress.find((p) => p.itemId === relay.id)!;
    expect(position.stageId).toBe("session-2");
    expect(position.scroll).toBeCloseTo(0.55, 1);
    if (!packaged) {
      await page.evaluate(() => {
        location.hash = "/courses/course%3Afixture/exercises";
      });
      await page
        .getByRole("button", { name: "Prepare exercise", exact: true })
        .click();
      await expect(
        page.getByRole("button", { name: "Run checks", exact: true }),
      ).toBeEnabled();
      await page
        .getByRole("button", { name: "Run checks", exact: true })
        .click();
      await expect(
        page.getByRole("heading", { name: "Last run: failed" }),
      ).toBeVisible({ timeout: 120000 });
      const folder = ((await call({ type: "state" })) as AppState)
        .exerciseWorkspaces[0]!.path;
      await fs.writeFile(
        path.join(folder, "addition.go"),
        "package addition\nfunc Add(a,b int) int {return a+b}\n",
      );
      await page
        .getByRole("button", { name: "Run checks", exact: true })
        .click();
      await expect(
        page.getByRole("heading", { name: "Last run: passed" }),
      ).toBeVisible({ timeout: 120000 });
      await page.getByText("Hint 1", { exact: true }).click();
      await page.evaluate(() => window.scrollTo(0, 0));
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
      await page.screenshot({
        path: "build/screenshots/desktop-exercise.png",
        fullPage: true,
      });
      await page.evaluate(() => {
        location.hash = "/courses/course%3Afixture/flashcards";
      });
      await page.getByRole("button", { name: "Reveal answer" }).click();
      await page.screenshot({
        path: "build/screenshots/desktop-flashcard-browse.png",
        fullPage: true,
      });
      await page.getByRole("button", { name: /Review available/ }).click();
      await page.getByRole("button", { name: "Reveal answer" }).click();
      await page.screenshot({
        path: "build/screenshots/desktop-flashcard-review.png",
        fullPage: true,
      });
      await page.getByRole("button", { name: "Good", exact: true }).click();
      await expect(page.getByText("What is -1 + 1?")).toBeVisible();
      await page.getByRole("button", { name: "Reveal answer" }).click();
      await page.getByRole("button", { name: "Easy", exact: true }).click();
      await expect(
        page.getByRole("heading", { name: "Review complete" }),
      ).toBeVisible();
      expect(
        ((await call({ type: "state" })) as AppState).reviews,
      ).toHaveLength(2);
      await call({ type: "backup" });
      expect(
        JSON.parse(await fs.readFile(backup, "utf8")).state.reviews,
      ).toHaveLength(2);
    }
    // Serve an update through the same main-process fetch path without using the public channel.
    const updatedCatalog = structuredClone(catalog);
    updatedCatalog.items.push({
      id: "project:download-fixture",
      kind: "project",
      title: "Downloaded project",
      description: "Content update smoke fixture",
      source: "tests",
      version: "1",
      stages: [
        {
          id: "overview",
          title: "Overview",
          html: "<h1>Downloaded project</h1>",
          text: "Downloaded project",
        },
      ],
      related: [],
      checks: [],
      prerequisites: [],
    });
    const contentData = JSON.stringify(updatedCatalog);
    const contentManifest = {
      formatVersion: 1,
      minimumAppVersion: "2.0.2",
      publishedAt: new Date(Date.now() + 60000).toISOString(),
      revision: crypto.createHash("sha256").update(contentData).digest("hex"),
    };
    await app.evaluate(
      (_electron, payload) => {
        globalThis.fetch = (async (input) => {
          const url = String(input);
          if (url === "https://vibe-learn.ai/updates/latest.json")
            return new Response(JSON.stringify(payload.manifest));
          if (
            url ===
            `https://vibe-learn.ai/updates/${payload.manifest.revision}.json`
          )
            return new Response(payload.data);
          throw new Error(`Unexpected update URL: ${url}`);
        }) as typeof fetch;
      },
      { manifest: contentManifest, data: contentData },
    );
    await page.getByRole("link", { name: "Settings & backups" }).click();
    const beforeContentUpdate = (await call({ type: "state" })) as AppState;
    await page
      .getByRole("button", { name: "Update content", exact: true })
      .click();
    await expect(
      page.getByText("Content updated.", { exact: true }),
    ).toBeVisible();
    expect(await call({ type: "state" })).toEqual(beforeContentUpdate);
    await page.screenshot({ path: "build/screenshots/content-updates.png" });
    expect(
      await fs.readFile(path.join(workspace, "addition_test.go"), "utf8"),
    ).toBe(source);
    await page
      .getByRole("navigation")
      .getByRole("link", { name: "Projects", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Downloaded project", exact: true }),
    ).toBeVisible();
    await app.evaluate(() => {
      globalThis.fetch = async () =>
        new Response("Unavailable", { status: 503 });
    });
    await page.getByRole("link", { name: "Settings & backups" }).click();
    await page
      .getByRole("button", { name: "Update content", exact: true })
      .click();
    await expect(
      page.getByText(/Content server returned HTTP 503/),
    ).toBeVisible();
    expect(
      ((await call({ type: "catalog" })) as Catalog).items.some(
        (i) => i.id === "project:download-fixture",
      ),
    ).toBe(true);
    if (packaged) {
      // Publish this build's own code with a marker, then update through Settings.
      const updateApp = path.join(root, "update-app");
      await fs.cp("build/app", updateApp, { recursive: true });
      const index = path.join(updateApp, "renderer/index.html");
      await fs.writeFile(
        index,
        (await fs.readFile(index, "utf8")).replace(
          "<head>",
          '<head><meta name="vibe-smoke-update" content="downloaded">',
        ),
      );
      const server = path.join(root, "update-server");
      const manifest = writeAppUpdate({
        appDir: updateApp,
        lockRoot: ".",
        destination: server,
        privateKey: updateKeys.privateKey,
        version: "9.9.9",
        commit: gitInfo(".").commit,
        publishedAt: new Date(Date.now() + 60000).toISOString(),
      });
      await app.evaluate(
        (_electron, payload) => {
          globalThis.fetch = (async (input) => {
            const url = String(input);
            if (url === "https://vibe-learn.ai/updates/app/latest.json")
              return new Response(payload.latest);
            if (
              url ===
              `https://vibe-learn.ai/updates/app/${payload.revision}.json`
            )
              return new Response(payload.bundle);
            throw new Error(`Unexpected update URL: ${url}`);
          }) as typeof fetch;
        },
        {
          revision: manifest.revision,
          latest: await fs.readFile(path.join(server, "latest.json"), "utf8"),
          bundle: await fs.readFile(
            path.join(server, `${manifest.revision}.json`),
            "utf8",
          ),
        },
      );
      await page
        .getByRole("button", { name: "Dismiss notification", exact: true })
        .click();
      const beforeAppUpdate = (await call({ type: "state" })) as AppState;
      await page
        .getByRole("button", { name: "Update app", exact: true })
        .click();
      await expect(
        page.getByText("App update downloaded. Restart to use it.", {
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Restart now", exact: true }),
      ).toBeVisible();
      expect(await call({ type: "state" })).toEqual(beforeAppUpdate);
      await page.screenshot({ path: "build/screenshots/app-updates.png" });
    } else {
      await expect(
        page.getByRole("button", { name: "Update app", exact: true }),
      ).toBeDisabled();
    }
    await page.getByRole("button", { name: "Switch theme" }).click();
    await app.close();
    app = undefined;
    app = await launch();
    page = await app.firstWindow();
    await expect(page.getByRole("heading", { name: "Continue" })).toBeVisible();
    expect(
      ((await call({ type: "catalog" })) as Catalog).items.some(
        (i) => i.id === "project:download-fixture",
      ),
    ).toBe(true);
    const restored = (await call({ type: "state" })) as AppState;
    expect(restored.notes[0]?.text).toBe("Keep my reasoning and my tests.");
    expect(restored.bookmarks).toHaveLength(1);
    if (!packaged) {
      expect(restored.reviews).toHaveLength(2);
      expect(restored.exerciseWorkspaces).toHaveLength(1);
      expect(
        restored.runs.filter((r) => r.kind === "exercise").map((r) => r.status),
      ).toEqual(["failed", "passed"]);
    }
    expect(restored.runs[0]?.status).toBe("passed");
    expect(
      restored.progress.find((p) => p.itemId === relay.id)?.scroll,
    ).toBeCloseTo(0.55, 1);
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    if (packaged) {
      // The restart ran the downloaded code and recorded it as healthy.
      await expect(page.locator('meta[name="vibe-smoke-update"]')).toHaveCount(
        1,
      );
      expect(((await call({ type: "app-status" })) as AppStatus).source).toBe(
        "downloaded",
      );
      await expect
        .poll(() =>
          fs.access(path.join(root, "profile/app-update/launching.json")).then(
            () => true,
            () => false,
          ),
        )
        .toBe(false);
      await page.getByRole("link", { name: "Settings & backups" }).click();
      await expect(page.getByText(/Version 9\.9\.9 · updated/)).toBeVisible();
      await page.screenshot({ path: "build/screenshots/app-updated.png" });
    }
    console.log(
      `${packaged ? "Packaged" : "Development"} desktop smoke passed: SQLite restart, content update/recovery, ${packaged ? "signed app update and restart, " : ""}notes, bookmarks, validated IPC, clipboard, untouched learner code, ${packaged ? "bundled offline" : "local"} Go execution.`,
    );
  } finally {
    await app?.close();
    await fs.rm(root, { recursive: true, force: true });
  }
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
