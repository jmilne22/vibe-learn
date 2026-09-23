import fs from "node:fs/promises";
import path from "node:path";
import net from "node:net";
import { spawn, type ChildProcess } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { killTree, TaskError, type ProcessContext } from "./process";
export interface Server {
  url: string;
  stop(graceful?: boolean): Promise<void>;
}
export async function startServer(
  executable: string,
  args: string[],
  cwd: string,
  ctx: ProcessContext,
): Promise<Server> {
  const port = await new Promise<number>((resolve, reject) => {
    const socket = net.createServer();
    socket.once("error", reject);
    socket.listen(0, "127.0.0.1", () => {
      const address = socket.address() as net.AddressInfo;
      socket.close(() => resolve(address.port));
    });
  });
  const url = `http://127.0.0.1:${port}`;
  ctx.log(`\nStart temporary server on ${url}\n`);
  const child: ChildProcess = spawn(
    executable,
    ["-listen", `127.0.0.1:${port}`, ...args],
    {
      cwd,
      env: ctx.env,
      detached: process.platform !== "win32",
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let exited = false;
  let code: number | null = null;
  let error = "";
  const done = new Promise<void>((resolve) => {
    child.once("error", (e) => {
      error = e.message;
      exited = true;
      resolve();
    });
    child.once("close", (c) => {
      code = c;
      exited = true;
      resolve();
    });
  });
  child.stdout?.on("data", (b) => ctx.log(String(b)));
  child.stderr?.on("data", (b) => ctx.log(String(b)));
  const abort = () => killTree(child);
  ctx.signal.addEventListener("abort", abort, { once: true });
  async function stop(graceful = false): Promise<void> {
    try {
      if (!exited) {
        if (graceful && process.platform !== "win32") child.kill("SIGINT");
        else killTree(child);
        let timedOut = false;
        const timeout = setTimeout(() => {
          timedOut = true;
          killTree(child);
        }, 5500);
        await done;
        clearTimeout(timeout);
        if (graceful && timedOut)
          throw new TaskError(
            "failed",
            "Graceful shutdown exceeded its five-second budget.",
          );
        if (graceful && process.platform !== "win32" && code !== 0)
          throw new TaskError("failed", `Graceful shutdown exited ${code}.`);
      }
    } finally {
      ctx.signal.removeEventListener("abort", abort);
    }
  }
  try {
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      ctx.signal.throwIfAborted();
      if (exited)
        throw new TaskError(
          "failed",
          `Server exited before readiness (${error || code}). Check build target and required flags.`,
        );
      try {
        const response = await fetch(`${url}/healthz`, {
          signal: AbortSignal.any([ctx.signal, AbortSignal.timeout(750)]),
        });
        if (response.status === 200) {
          await response.body?.cancel();
          return { url, stop };
        }
        await response.body?.cancel();
      } catch {
        /* Readiness is bounded and observed, not a fixed startup sleep. */
      }
      await delay(50, undefined, { signal: ctx.signal });
    }
    throw new TaskError(
      "failed",
      "Server did not become healthy within 15 seconds.",
    );
  } catch (e) {
    await stop();
    throw e;
  }
}
function expect(
  condition: unknown,
  description: string,
  ctx: ProcessContext,
): asserts condition {
  if (!condition) throw new TaskError("failed", description);
  ctx.log(`✓ ${description}\n`);
}
async function request(
  url: string,
  ctx: ProcessContext,
  method = "GET",
  body?: string,
): Promise<{ status: number; body: string }> {
  const response = await fetch(url, {
    method,
    body,
    signal: AbortSignal.any([ctx.signal, AbortSignal.timeout(5000)]),
  });
  return { status: response.status, body: await response.text() };
}
function parseResponse(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    throw new TaskError(
      "failed",
      "Expected a JSON response from the public interface.",
    );
  }
}
export async function relaySuite(
  executable: string,
  dir: string,
  part: string,
  ctx: ProcessContext,
): Promise<string[]> {
  const output = path.join(dir, "events.jsonl");
  const previous = { previous: "retained" };
  await fs.writeFile(output, JSON.stringify(previous) + "\n");
  const server = await startServer(
    executable,
    part === "http" ? [] : ["-out", output],
    dir,
    ctx,
  );
  const unchecked: string[] = [];
  try {
    const event = {
      id: "suite-1",
      service: "checkout",
      level: "info",
      message: "  order placed  ",
    };
    for (const [label, value] of Object.entries({
      malformed: "{",
      array: "[]",
      null: "null",
      missing: JSON.stringify({ level: "info" }),
      unknown: JSON.stringify({ ...event, extra: true }),
      uppercase: JSON.stringify({ ...event, level: "INFO" }),
      blank: JSON.stringify({ ...event, message: " \t\n" }),
      nonstring: JSON.stringify({ ...event, id: 4 }),
      trailing: JSON.stringify(event) + "{}",
    })) {
      const result = await request(server.url + "/events", ctx, "POST", value);
      expect(
        result.status === 400 && result.body.length > 0,
        `Reject ${label} input with 400 and an explanation`,
        ctx,
      );
    }
    expect(
      (await request(server.url + "/missing", ctx)).status === 404,
      "Unknown route returns 404",
      ctx,
    );
    expect(
      (await request(server.url + "/events", ctx)).status === 405,
      "Wrong method returns 405",
      ctx,
    );
    const oversized = await request(
      server.url + "/events",
      ctx,
      "POST",
      JSON.stringify({ ...event, message: "x".repeat(17000) }),
    );
    expect(
      oversized.status === 413 || oversized.status === 400,
      "Oversized input is rejected",
      ctx,
    );
    const accepted = await request(
      server.url + "/events",
      ctx,
      "POST",
      JSON.stringify(event),
    );
    expect(accepted.status === 202, "Valid event is accepted with 202", ctx);
    if (part !== "http") {
      let rows: Record<string, unknown>[] = [];
      const deadline = Date.now() + 7000;
      while (Date.now() < deadline) {
        const raw = await fs.readFile(output, "utf8");
        try {
          rows = raw
            .trim()
            .split("\n")
            .map((l) => JSON.parse(l) as Record<string, unknown>);
        } catch {
          rows = [];
        }
        if (rows.some((r) => r.id === event.id)) break;
        await delay(50, undefined, { signal: ctx.signal });
      }
      expect(
        rows[0]?.previous === previous.previous,
        "Existing file contents are preserved",
        ctx,
      );
      const written = rows.filter((r) => r.id === event.id);
      expect(
        written.length === 1 &&
          Object.entries(event).every(([k, v]) => written[0]?.[k] === v),
        "Accepted event is written exactly once with original values",
        ctx,
      );
      const timestamps = Object.entries(written[0]!).filter(
        ([k]) => !Object.hasOwn(event, k),
      );
      expect(
        timestamps.length === 1 &&
          typeof timestamps[0]?.[1] === "string" &&
          /^\d{4}-\d{2}-\d{2}T.*Z$/.test(timestamps[0][1]) &&
          Number.isFinite(Date.parse(timestamps[0][1])),
        "Record contains one server timestamp in UTC (any documented field name)",
        ctx,
      );
      const stats = await request(server.url + "/stats", ctx);
      const data = parseResponse(stats.body) as Record<string, unknown>;
      expect(
        stats.status === 200 &&
          data.accepted_total === 1 &&
          data.exported_total === 1 &&
          data.queue_depth === 0,
        "Statistics reflect the accepted and exported event",
        ctx,
      );
    }
    if (part === "final" && process.platform !== "win32") {
      for (let n = 0; n < 20; n++)
        expect(
          (
            await request(
              server.url + "/events",
              ctx,
              "POST",
              JSON.stringify({ ...event, id: `drain-${n}` }),
            )
          ).status === 202,
          `Drain fixture ${n} accepted`,
          ctx,
        );
      await server.stop(true);
      const rows = (await fs.readFile(output, "utf8"))
        .trim()
        .split("\n")
        .map((l) => JSON.parse(l) as Record<string, unknown>);
      expect(
        Array.from(
          { length: 20 },
          (_, n) => rows.filter((r) => r.id === `drain-${n}`).length === 1,
        ).every(Boolean),
        "All acknowledged drain fixtures survive graceful shutdown",
        ctx,
      );
    } else if (part === "final")
      unchecked.push(
        "SIGINT shutdown check is not run on Windows; perform the documented shutdown experiment.",
      );
    return unchecked;
  } finally {
    await server.stop();
  }
}
export async function tsdbSuite(
  executable: string,
  dir: string,
  part: string,
  ctx: ProcessContext,
): Promise<string[]> {
  const dataDir = path.join(dir, "data");
  await fs.mkdir(dataDir, { recursive: true });
  let server = await startServer(executable, ["-data-dir", dataDir], dir, ctx);
  const queryPath =
    "/api/v1/query?" +
    new URLSearchParams({
      match: 'up{host="a"}',
      start: "1000",
      end: "2000",
    }).toString();
  const samples = [1000, 2000].map((t) => ({
    labels: { __name__: "up", host: "a" },
    t,
    v: t / 1000,
  }));
  const expected = JSON.stringify({
    series: [
      {
        labels: { __name__: "up", host: "a" },
        samples: [
          [1000, 1],
          [2000, 2],
        ],
      },
    ],
  });
  async function verifyQuery(): Promise<void> {
    const result = await request(server.url + queryPath, ctx);
    const parsed = parseResponse(result.body) as {
      series?: { labels?: Record<string, string>; samples?: unknown }[];
    };
    expect(
      result.status === 200 &&
        parsed.series?.length === 1 &&
        parsed.series[0]?.labels?.host === "a" &&
        parsed.series[0]?.labels?.__name__ === "up" &&
        JSON.stringify(parsed.series[0]?.samples) ===
          JSON.stringify([
            [1000, 1],
            [2000, 2],
          ]),
      `Query returns the two accepted samples (target ${expected})`,
      ctx,
    );
  }
  try {
    expect(
      (
        await request(
          server.url + "/api/v1/write",
          ctx,
          "POST",
          samples.map((s) => JSON.stringify(s)).join("\n"),
        )
      ).status === 204,
      "Atomic valid batch returns 204",
      ctx,
    );
    await verifyQuery();
    const invalid = [3000, 1500]
      .map((t) =>
        JSON.stringify({ labels: { __name__: "up", host: "a" }, t, v: 3 }),
      )
      .join("\n");
    const rejected = await request(
      server.url + "/api/v1/write",
      ctx,
      "POST",
      invalid,
    );
    expect(
      rejected.status === 400 && /2/.test(rejected.body),
      "Out-of-order batch returns 400 identifying line 2",
      ctx,
    );
    const all = await request(
      server.url + queryPath.replace("end=2000", "end=9000"),
      ctx,
    );
    const body = parseResponse(all.body) as {
      series?: { samples?: unknown[] }[];
    };
    expect(
      body.series?.[0]?.samples?.length === 2,
      "Rejected batch makes no partial writes",
      ctx,
    );
    expect(
      (await request(server.url + "/missing", ctx)).status === 404,
      "Unknown route returns 404",
      ctx,
    );
    expect(
      (await request(server.url + "/api/v1/write", ctx)).status === 405,
      "Wrong method returns 405",
      ctx,
    );
    expect(
      (
        await request(
          server.url + "/api/v1/query?match=bad{&start=1&end=2",
          ctx,
        )
      ).status === 400,
      "Invalid selector returns 400",
      ctx,
    );
    if (part === "final") {
      const batch = Array.from({ length: 250 }, (_, n) =>
        JSON.stringify({
          labels: { __name__: "load", host: "b" },
          t: 10000 + n,
          v: n / 8,
        }),
      );
      expect(
        (
          await request(
            server.url + "/api/v1/write",
            ctx,
            "POST",
            batch.join("\n"),
          )
        ).status === 204,
        "Accept a 250-sample series across chunk boundaries",
        ctx,
      );
      const response = await request(
        server.url +
          "/api/v1/query?" +
          new URLSearchParams({
            match: 'load{host="b"}',
            start: "10000",
            end: "10249",
          }),
        ctx,
      );
      const result = parseResponse(response.body) as {
        series?: { samples?: unknown }[];
      };
      expect(
        response.status === 200 &&
          result.series?.length === 1 &&
          JSON.stringify(result.series[0]?.samples) ===
            JSON.stringify(
              Array.from({ length: 250 }, (_, n) => [10000 + n, n / 8]),
            ),
        "All 250 samples round-trip exactly in time order",
        ctx,
      );
      const absent = parseResponse(
        (
          await request(
            server.url +
              "/api/v1/query?" +
              new URLSearchParams({ match: "absent", start: "0", end: "1" }),
            ctx,
          )
        ).body,
      ) as { series?: unknown[] };
      expect(
        Array.isArray(absent.series) && absent.series.length === 0,
        "No matching series returns an empty array",
        ctx,
      );
      const reversed = await request(
        server.url +
          "/api/v1/query?" +
          new URLSearchParams({ match: "up", start: "2000", end: "1000" }),
        ctx,
      );
      expect(reversed.status === 400, "Reversed query bounds return 400", ctx);
    }
    if (part !== "http") {
      await server.stop(); // Abrupt process termination tests replay, not power-loss durability.
      server = await startServer(executable, ["-data-dir", dataDir], dir, ctx);
      await verifyQuery();
      ctx.log("✓ Accepted samples survive process termination and restart\n");
    }
    return [];
  } finally {
    await server.stop();
  }
}
