import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
export class TaskError extends Error {
  constructor(
    public status: "failed" | "error" | "missing-tool",
    message: string,
  ) {
    super(message);
  }
}
export function killTree(child: ChildProcess): void {
  if (!child.pid) return;
  if (process.platform === "win32")
    spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
      windowsHide: true,
    });
  else {
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch {
      child.kill("SIGKILL");
    }
  }
}
export interface ProcessContext {
  signal: AbortSignal;
  log: (text: string) => void;
  env?: NodeJS.ProcessEnv;
}
export async function command(
  executable: string,
  args: string[],
  cwd: string,
  ctx: ProcessContext,
  allowedFailure = false,
): Promise<string> {
  ctx.signal.throwIfAborted();
  ctx.log(`\n$ ${path.basename(executable)} ${args.join(" ")}\n`);
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd,
      env: ctx.env || process.env,
      windowsHide: true,
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    let settled = false;
    const append = (data: Buffer) => {
      const chunk = data.toString();
      output = (output + chunk).slice(-4_000_000);
      ctx.log(chunk);
    };
    child.stdout?.on("data", append);
    child.stderr?.on("data", append);
    const abort = () => killTree(child);
    ctx.signal.addEventListener("abort", abort, { once: true });
    child.once("error", (error: NodeJS.ErrnoException) => {
      settled = true;
      ctx.signal.removeEventListener("abort", abort);
      reject(
        new TaskError(
          error.code === "ENOENT" ? "missing-tool" : "error",
          `${executable}: ${error.message}`,
        ),
      );
    });
    child.once("close", (code) => {
      ctx.signal.removeEventListener("abort", abort);
      if (settled) return;
      if (ctx.signal.aborted) reject(ctx.signal.reason);
      else if (code !== 0 && !allowedFailure)
        reject(
          new TaskError(
            /rustup could not choose|no default is configured|toolchain .* is not installed|C compiler|cgo:.*compiler|requires cgo|exec:.*not found|executable file not found|linker .* not found|could not execute process.*rustc/i.test(
              output,
            )
              ? "missing-tool"
              : /could not compile|failed to parse manifest|no matching package|failed to get .* dependency|build failed|syntax error|undefined:|no required module provides|go.mod file not found|error loading module|module lookup disabled|proxy.golang.org/i.test(
                    output,
                  )
                ? "error"
                : "failed",
            `${path.basename(executable)} exited ${code}. See the output above.`,
          ),
        );
      else resolve(output);
    });
  });
}
const ignored = new Set([
  ".git",
  "node_modules",
  "target",
  "vendor",
  ".vibe",
  "bin",
  "build",
  "dist",
  "out",
  "store",
  ".cache",
]);
export async function fingerprint(
  root: string,
  signal?: AbortSignal,
): Promise<string> {
  const hash = crypto.createHash("sha256");
  let count = 0;
  async function walk(dir: string): Promise<void> {
    const entries = await fs.promises.readdir(dir, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      signal?.throwIfAborted();
      if (ignored.has(entry.name)) continue;
      const filename = path.join(dir, entry.name);
      const relative = path.relative(root, filename);
      if (entry.isSymbolicLink()) {
        hash.update(relative + (await fs.promises.readlink(filename)));
        continue;
      }
      if (entry.isDirectory()) {
        await walk(filename);
        continue;
      }
      // Source/configuration only: generated binaries and datasets are not source revisions.
      if (
        !/\.(go|mod|sum|md|yaml|yml|json|toml|sh|py|ts|js|rs|c|h)$/.test(
          entry.name,
        ) &&
        !/^(Dockerfile|Makefile|VERSION)$/.test(entry.name)
      )
        continue;
      if (++count > 20000)
        throw new TaskError(
          "error",
          "Workspace has over 20,000 source files. Attach the project folder, not its parent.",
        );
      const stat = await fs.promises.stat(filename);
      if (stat.size > 20_000_000)
        throw new TaskError(
          "error",
          `Source file too large to fingerprint: ${relative}`,
        );
      hash.update(relative + "\0");
      hash.update(await fs.promises.readFile(filename));
    }
  }
  await walk(root);
  return hash.digest("hex");
}
