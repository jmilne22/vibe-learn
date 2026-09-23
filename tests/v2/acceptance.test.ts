import { it, expect } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { command } from "../../src/main/process";
import { relaySuite, tsdbSuite } from "../../src/main/acceptance";
it("checks relay and TSDB public contracts without depending on learner package layouts or timestamp names", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "vibe-contract-"));
  let log = "";
  const ctx = {
    env: { ...process.env, CGO_ENABLED: "0" },
    signal: new AbortController().signal,
    log: (s: string) => {
      log += s;
    },
  };
  try {
    for (const [kind, timestamp, broken] of [
      ["relay", "arrived", ""],
      ["relay", "received_at", ""],
      ["relay", "arrived", "status"],
      ["tsdb", "", ""],
    ]) {
      const folder = await fs.mkdtemp(path.join(root, "case-"));
      const binary = path.join(
        folder,
        process.platform === "win32" ? "server.exe" : "server",
      );
      await command(
        "go",
        [
          "build",
          "-ldflags",
          `-X main.kind=${kind} -X main.timestamp=${timestamp} -X main.broken=${broken}`,
          "-o",
          binary,
          "tests/v2/fixtures/server.go",
        ],
        process.cwd(),
        ctx,
      );
      if (broken)
        await expect(
          relaySuite(binary, folder, "final", ctx),
        ).rejects.toMatchObject({ status: "failed" });
      else if (kind === "relay") await relaySuite(binary, folder, "final", ctx);
      else await tsdbSuite(binary, folder, "final", ctx);
    }
    expect(log).toContain("250 samples");
    expect(log).toContain("any documented field name");
  } catch (error) {
    throw new Error(String(error) + "\n" + log);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}, 120000);
