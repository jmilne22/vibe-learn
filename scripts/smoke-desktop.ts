import {
  _electron as electron,
  expect,
  type ElectronApplication,
} from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fixtureCourse } from "../tests/v2/fixtures/course";
import type { Catalog, AppState, Command } from "../src/shared/model";
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
    await call({ type: "workspace", itemId: relay.id, action: "attach" });
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
    await page.getByRole("button", { name: "Switch theme" }).click();
    await app.close();
    app = undefined;
    app = await launch();
    page = await app.firstWindow();
    await expect(page.getByRole("heading", { name: "Continue" })).toBeVisible();
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
    console.log(
      `${packaged ? "Packaged" : "Development"} desktop smoke passed: SQLite restart, notes, bookmarks, validated IPC, clipboard, untouched learner code, ${packaged ? "bundled offline" : "local"} Go execution.`,
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
