import { it, expect } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { setTimeout as delay } from "node:timers/promises";
import { Store } from "../../src/main/store";
import { Runner, maelstromValid } from "../../src/main/runner";
import { type Item, type Run } from "../../src/shared/model";
const check = {
  id: "go-test",
  title: "Your tests",
  kind: "learner" as const,
  suiteVersion: "1",
  description: "",
  unchecked: [],
};
const item: Item = {
  id: "course:test",
  kind: "course",
  exercises: [],
  flashcards: [],
  title: "Test",
  description: "",
  stages: [{ id: "one", title: "One", text: "", html: "" }],
  related: [],
  prerequisites: [],
  checks: [check],
  version: "1",
  source: "test",
};
it("reads the root Maelstrom verdict regardless of field order or nested verdicts", () => {
  expect(maelstromValid("{:valid? true :checker {:valid? false}}")).toBe(true);
  expect(maelstromValid("{:checker {:valid? true} :valid? false}")).toBe(false);
  expect(maelstromValid("{:checker {:valid? true}}")).toBe(false);
});
it("records real Go runs, missing tools, assertion failures, cancellation, timeouts and source changes without modifying code", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "vibe-runner-"));
  const workspace = path.join(root, "workspace");
  await fs.mkdir(workspace);
  const store = await Store.open(path.join(root, "state.sqlite"));
  const target = {
    itemId: item.id,
    path: workspace,
    buildTarget: ".",
    maelstromPath: "",
  };
  await fs.writeFile(
    path.join(workspace, "go.mod"),
    "module check\n\ngo 1.22\n",
  );
  const filename = path.join(workspace, "sample_test.go");
  const source =
    'package check\nimport "testing"\nfunc TestWorks(t *testing.T) {}\n';
  await fs.writeFile(filename, source);
  const runner = new Runner(store, path.join(root, "runs"), "go", () => {});
  const finish = async (id: string): Promise<Run> => {
    for (let n = 0; n < 2400; n++) {
      const run = store.state().runs.find((r) => r.id === id)!;
      if (run.status !== "running") return run;
      await delay(50);
    }
    throw new Error("Run did not finish");
  };
  try {
    const passed = await finish(runner.start(item, check, target));
    expect(passed.status, passed.output).toBe("passed");
    expect(await fs.readFile(filename, "utf8")).toBe(source);
    await fs.writeFile(
      filename,
      source.replace("{}", '{ t.Fatal("intentional failure") }'),
    );
    const failed = await finish(runner.start(item, check, target));
    expect(failed.status).toBe("failed");
    await fs.writeFile(filename, "package check\n");
    const empty = await finish(runner.start(item, check, target));
    expect(empty.status).toBe("error");
    expect(empty.unchecked.join()).toContain("No passing test");
    expect(check.unchecked).toEqual([]);
    const missing = new Runner(
      store,
      path.join(root, "runs"),
      "vibe-missing-go",
      () => {},
    );
    expect((await finish(missing.start(item, check, target))).status).toBe(
      "missing-tool",
    );
    await missing.close();
    await fs.writeFile(
      filename,
      'package check\nimport("testing";"time")\nfunc TestSlow(t *testing.T){time.Sleep(30*time.Second)}\n',
    );
    const id = runner.start(item, check, target);
    await delay(1000);
    await fs.appendFile(filename, "// Changed while running\n");
    runner.cancel(id);
    const cancelled = await finish(id);
    expect(cancelled.status).toBe("cancelled");
    expect(cancelled.sourceChanged).toBe(true);
    const limited = new Runner(
      store,
      path.join(root, "runs"),
      "go",
      () => {},
      200,
    );
    const timeout = await finish(limited.start(item, check, target));
    expect(timeout.status).toBe("timed-out");
    await limited.close();
    expect(
      JSON.parse(
        await fs.readFile(
          path.join(passed.artifactDir!, "result.json"),
          "utf8",
        ),
      ).sourceHash,
    ).toBe(passed.sourceHash);
  } finally {
    await runner.close();
    store.close();
    await fs.rm(root, { recursive: true, force: true });
  }
}, 180000);
