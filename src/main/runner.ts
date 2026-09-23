import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {
  type Item,
  type Exercise,
  type Check,
  type Workspace,
  type Run,
} from "../shared/model";
import { runExercise } from "./exercises";
import { Store } from "./store";
import {
  command,
  fingerprint,
  TaskError,
  type ProcessContext,
} from "./process";
import { relaySuite, tsdbSuite } from "./acceptance";
export class Runner {
  private active = new Map<
    string,
    { controller: AbortController; done: Promise<void> }
  >();
  constructor(
    private store: Store,
    private runRoot: string,
    private go: string,
    private changed: () => void,
    private timeoutMs = 600000,
  ) {}
  start(
    item: Item,
    check: Check,
    workspace: Workspace,
    exercise?: Exercise,
  ): string {
    if (this.active.size)
      throw new Error(
        "A task is already running. Cancel it or wait for it to finish.",
      );
    if (!fs.existsSync(workspace.path))
      throw new Error("Workspace folder is missing. Reattach it.");
    const id = crypto.randomUUID();
    const controller = new AbortController();
    const run: Run = {
      id,
      itemId: item.id,
      checkId: check.id,
      title: check.title,
      kind: check.kind,
      status: "running",
      startedAt: new Date().toISOString(),
      sourceHash: "pending",
      sourceChanged: false,
      suiteVersion: check.suiteVersion,
      contentVersion: item.version,
      output: "",
      unchecked: [...check.unchecked],
    };
    this.store.putRun(run);
    const done = Promise.resolve().then(() =>
      this.execute(run, check, workspace, controller, exercise),
    );
    this.active.set(id, { controller, done });
    this.changed();
    return id;
  }
  cancel(id: string): void {
    this.active.get(id)?.controller.abort(new Error("Cancelled by learner."));
  }
  async close(): Promise<void> {
    for (const entry of this.active.values())
      entry.controller.abort(new Error("Application is closing."));
    await Promise.all([...this.active.values()].map((a) => a.done));
  }
  private async execute(
    run: Run,
    check: Check,
    workspace: Workspace,
    controller: AbortController,
    exercise?: Exercise,
  ): Promise<void> {
    let timeout = false;
    let dirty = false;
    let stream: fs.WriteStream | undefined;
    const deadline = setTimeout(() => {
      timeout = true;
      controller.abort(new Error("Task exceeded its 10-minute limit."));
    }, this.timeoutMs);
    const publish = setInterval(() => {
      if (dirty) {
        this.store.putRun(run);
        this.changed();
        dirty = false;
      }
    }, 200);
    const log = (text: string) => {
      run.output = (run.output + text).slice(-128000);
      stream?.write(text);
      dirty = true;
    };
    try {
      const dir = path.join(this.runRoot, run.id);
      fs.mkdirSync(dir, { recursive: true });
      run.artifactDir = dir;
      stream = fs.createWriteStream(path.join(dir, "output.log"));
      stream.on("error", (e) => controller.abort(e));
      const env: NodeJS.ProcessEnv = {
        ...process.env,
        CGO_ENABLED: check.id === "go-race" ? "1" : "0",
        GOTOOLCHAIN: "local",
        GOCACHE: path.join(this.runRoot, "..", "go-cache"),
        GOMODCACHE: path.join(this.runRoot, "..", "go-mod-cache"),
      };
      const bundledRoot = path.resolve(path.dirname(this.go), "..");
      if (
        path.isAbsolute(this.go) &&
        fs.existsSync(path.join(bundledRoot, "src"))
      )
        env.GOROOT = bundledRoot;
      const ctx: ProcessContext = { signal: controller.signal, log, env };
      run.sourceHash = await fingerprint(workspace.path, controller.signal);
      if (!exercise) await command(this.go, ["version"], workspace.path, ctx);
      if (exercise) {
        await runExercise(exercise, workspace.path, dir, this.go, ctx);
      } else if (check.kind === "learner") {
        await command(this.go, ["vet", "./..."], workspace.path, ctx);
        const output = await command(
          this.go,
          [
            "test",
            "-json",
            "-count=1",
            ...(check.id === "go-race" ? ["-race"] : []),
            "./...",
          ],
          workspace.path,
          ctx,
        );
        const events = output.split("\n").flatMap((line) => {
          try {
            return [JSON.parse(line) as { Action?: string; Test?: string }];
          } catch {
            return [];
          }
        });
        if (!events.some((e) => e.Action === "pass" && e.Test)) {
          run.unchecked.push(
            "No passing test cases were reported; an empty suite is not evidence of behavior.",
          );
          throw new TaskError(
            "error",
            "No executed tests found. Write tests in this workspace before running this action.",
          );
        }
      } else if (check.kind === "acceptance") {
        const binary = path.join(
          dir,
          process.platform === "win32" ? "program.exe" : "program",
        );
        await command(
          this.go,
          ["build", "-o", binary, workspace.buildTarget],
          workspace.path,
          ctx,
        );
        const [kind, part] = check.id.split("-");
        const extra = await (kind === "relay" ? relaySuite : tsdbSuite)(
          binary,
          dir,
          part!,
          ctx,
        );
        run.unchecked.push(...extra);
      } else
        await runMaelstrom(
          check.id.replace("maelstrom-", ""),
          workspace,
          dir,
          this.go,
          ctx,
          run,
        );
      run.status = "passed";
      log(
        exercise
          ? "\nExercise checks passed for this saved source. You can revisit any exercise at any time.\n"
          : "\nRequested checks passed. Read the unchecked requirements below; this is not an overall project grade.\n",
      );
    } catch (error) {
      run.status = timeout
        ? "timed-out"
        : controller.signal.aborted
          ? "cancelled"
          : error instanceof TaskError
            ? error.status
            : "error";
      log(`\n${error instanceof Error ? error.message : String(error)}\n`);
    } finally {
      clearTimeout(deadline);
      clearInterval(publish);
      try {
        run.sourceChanged =
          run.sourceHash !== "pending" &&
          (await fingerprint(workspace.path)) !== run.sourceHash;
      } catch {
        run.sourceChanged = true;
      }
      if (run.sourceChanged)
        log(
          "\nSource changed during execution. Rerun against a stable revision before relying on this result.\n",
        );
      run.finishedAt = new Date().toISOString();
      try {
        if (stream && !stream.destroyed)
          await new Promise<void>((resolve) => {
            stream!.once("close", resolve);
            stream!.end(resolve);
          });
        if (run.artifactDir)
          fs.writeFileSync(
            path.join(run.artifactDir, "result.json"),
            JSON.stringify(run, null, 2),
          );
      } catch (error) {
        run.status = "error";
        run.output += `\nCould not save artifacts: ${String(error)}`;
      } finally {
        this.active.delete(run.id);
        this.store.putRun(run);
        this.changed();
      }
    }
  }
}
export function maelstromPlan(stage: string): {
  folder: string;
  args: string[];
  repeats: number;
  partitions: boolean;
} {
  const base = ["--time-limit", "20", "--rate", "1000"];
  let folder = "txn";
  let args: string[] = [];
  let repeats = 1;
  let partitions = false;
  if (stage === "1") {
    folder = "echo";
    args = ["-w", "echo", "--node-count", "1", "--time-limit", "10"];
  } else if (stage === "2") {
    folder = "unique-ids";
    args = [
      "-w",
      "unique-ids",
      "--node-count",
      "3",
      "--time-limit",
      "30",
      "--rate",
      "1000",
      "--availability",
      "total",
      "--nemesis",
      "partition",
    ];
  } else if (/^3[a-e]$/.test(stage)) {
    folder = "broadcast";
    args = [
      "-w",
      "broadcast",
      "--time-limit",
      "20",
      "--rate",
      /[de]$/.test(stage) ? "100" : "10",
      "--node-count",
      stage === "3a" ? "1" : /[de]$/.test(stage) ? "25" : "5",
    ];
    if (stage === "3c") {
      args.push("--nemesis", "partition");
      repeats = 3;
    }
    if (/[de]$/.test(stage)) {
      args.push("--latency", "100");
      partitions = true;
    }
  } else if (stage === "4") {
    folder = "counter";
    args = [
      "-w",
      "g-counter",
      "--node-count",
      "3",
      "--time-limit",
      "20",
      "--rate",
      "100",
      "--nemesis",
      "partition",
    ];
    repeats = 3;
  } else if (/^5[a-c]$/.test(stage)) {
    folder = "kafka";
    args = [
      "-w",
      "kafka",
      ...base,
      "--node-count",
      stage === "5a" ? "1" : "2",
      "--concurrency",
      "2n",
    ];
  } else if (/^6[a-c]$/.test(stage)) {
    args = [
      "-w",
      "txn-rw-register",
      ...base,
      "--node-count",
      stage === "6a" ? "1" : "2",
      "--concurrency",
      "2n",
      "--consistency-models",
      stage === "6c" ? "read-committed" : "read-uncommitted",
      "--availability",
      "total",
    ];
    if (stage === "6b") partitions = true;
    if (stage === "6c") args.push("--nemesis", "partition");
  } else throw new TaskError("error", "Unknown Maelstrom stage.");
  return { folder, args, repeats, partitions };
}
async function runMaelstrom(
  stage: string,
  workspace: Workspace,
  dir: string,
  go: string,
  ctx: ProcessContext,
  run: Run,
): Promise<void> {
  if (process.platform === "win32")
    throw new TaskError(
      "missing-tool",
      "Run the documented Maelstrom commands in Linux/WSL. Native Windows execution is not configured.",
    );
  const script = path.resolve(
    workspace.maelstromPath || path.join(workspace.path, "maelstrom/maelstrom"),
  );
  const jar = path.join(path.dirname(script), "maelstrom.jar");
  if (!fs.existsSync(jar))
    throw new TaskError(
      "missing-tool",
      "Choose the extracted Maelstrom launcher path in workspace settings (maelstrom.jar must be alongside it).",
    );
  await command("java", ["-version"], dir, ctx);
  await command("dot", ["-V"], dir, ctx);
  await command("gnuplot", ["--version"], dir, ctx);
  const plan = maelstromPlan(stage);
  const source = path.join(workspace.path, plan.folder);
  if (!fs.existsSync(source))
    throw new TaskError(
      "error",
      `Attach the Gossip Glomers root containing ${plan.folder}/, not a single stage directory.`,
    );
  const binary = path.join(dir, "node");
  await command(go, ["build", "-o", binary, "."], source, ctx);
  const invocations = Array.from({ length: plan.repeats }, () => plan.args);
  if (plan.partitions)
    invocations.push([...plan.args, "--nemesis", "partition"]);
  for (const [index, args] of invocations.entries()) {
    const attempt = path.join(dir, `attempt-${index + 1}`);
    fs.mkdirSync(attempt);
    // Launch the existing jar with each run's own working directory so store/latest never overwrites another run.
    await command(
      "java",
      [
        "-Djava.awt.headless=true",
        "-jar",
        jar,
        "test",
        "--bin",
        binary,
        ...args,
      ],
      attempt,
      ctx,
    );
    const resultFile = path.join(attempt, "store/latest/results.edn");
    if (!fs.existsSync(resultFile))
      throw new TaskError(
        "error",
        "Maelstrom did not produce results.edn; inspect its output.",
      );
    const result = fs.readFileSync(resultFile, "utf8");
    // Only the root verdict counts; nested checker results may disagree.
    if (!maelstromValid(result))
      throw new TaskError(
        "failed",
        "Maelstrom did not report a valid execution. Inspect results.edn and histories.",
      );
  }
  if (["3d", "3e", "5c"].includes(stage))
    run.unchecked.push(
      "Compare performance budgets and the 5b baseline in saved results.edn; automated runs here establish harness validity, not those comparisons.",
    );
  run.unchecked.push(
    "Race-instrumented workload runs remain a separate learner check.",
  );
}

export function maelstromValid(edn: string): boolean {
  const tokens = edn.match(/"(?:\\.|[^"\\])*"|[{}[\]()]|[^\s,{}[\]()]+/g) || [];
  let depth = 0;
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;
    if ("{[(".includes(token)) depth++;
    else if ("}])".includes(token)) depth--;
    else if (depth === 1 && token === ":valid?")
      return tokens[i + 1] === "true";
  }
  return false;
}
