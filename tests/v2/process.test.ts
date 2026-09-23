import { it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { command, fingerprint, TaskError } from "../../src/main/process";
import { maelstromPlan } from "../../src/main/runner";
it("streams output, rejects failed commands, and distinguishes missing tools", async () => {
  let output = "";
  const ctx = {
    signal: new AbortController().signal,
    log: (s: string) => {
      output += s;
    },
  };
  await command(
    process.execPath,
    ["-e", 'console.log("hello")'],
    process.cwd(),
    ctx,
  );
  expect(output).toContain("hello");
  await expect(
    command(process.execPath, ["-e", "process.exit(3)"], process.cwd(), ctx),
  ).rejects.toMatchObject({ status: "failed" });
  await expect(
    command("vibe-nonexistent-binary-123", [], process.cwd(), ctx),
  ).rejects.toMatchObject({ status: "missing-tool" });
});
it("cancels a long running process promptly", async () => {
  const controller = new AbortController();
  const task = command(
    process.execPath,
    ["-e", "setInterval(()=>{},1000)"],
    process.cwd(),
    { signal: controller.signal, log: () => {} },
  );
  setTimeout(() => controller.abort(new Error("Cancelled")), 150);
  await expect(task).rejects.toThrow("Cancelled");
});
it("fingerprints source changes while ignoring generated outputs", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "vibe-hash-"));
  await fs.writeFile(path.join(dir, "main.go"), "package main");
  const first = await fingerprint(dir);
  await fs.mkdir(path.join(dir, "bin"));
  await fs.writeFile(path.join(dir, "bin", "main.go"), "generated");
  expect(await fingerprint(dir)).toBe(first);
  await fs.writeFile(path.join(dir, "main.go"), "package different");
  expect(await fingerprint(dir)).not.toBe(first);
  await fs.rm(dir, { recursive: true });
});
it("uses independent Maelstrom stages including partition runs and repetitions", () => {
  expect(maelstromPlan("3c").repeats).toBe(3);
  expect(maelstromPlan("4").repeats).toBe(3);
  expect(maelstromPlan("6b").partitions).toBe(true);
  expect(maelstromPlan("5a").folder).toBe("kafka");
  expect(() => maelstromPlan("unknown")).toThrow(TaskError);
});
