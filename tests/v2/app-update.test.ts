import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import {
  AppUpdater,
  markHealthy,
  markLaunching,
  selectUpdate,
  type Boot,
  type Shell,
} from "../../src/main/app-update";
import { appRuntime, writeAppUpdate } from "../../scripts/app-update-package";

const keys = crypto.generateKeyPairSync("ed25519");
const publicKey = keys.publicKey
  .export({ type: "spki", format: "der" })
  .toString("base64");
const url = "https://updates.test/app/latest.json";
const commit = "a".repeat(40);
let root: string, appDir: string, server: string, profile: string;
let shell: Shell;
let requests: string[];

const write = (file: string, text: string) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
};
const lock = (zod = "4.1.0") =>
  JSON.stringify({
    packages: {
      "": {},
      "node_modules/electron": { version: "43.0.0" },
      "node_modules/zod": { version: zod },
      "node_modules/react": { version: "19.2.0" },
    },
  });
const publish = (publishedAt = "2026-09-24T12:00:00Z", marker = "new") => {
  write(path.join(appDir, "renderer/index.html"), `<p>${marker}</p>`);
  return writeAppUpdate({
    appDir,
    lockRoot: root,
    destination: server,
    privateKey: keys.privateKey,
    version: "2.1.0",
    commit,
    publishedAt,
  });
};
const fetcher = (async (input: string | URL | Request) => {
  const address = String(input);
  requests.push(address);
  const file = path.join(server, path.basename(new URL(address).pathname));
  return fs.existsSync(file)
    ? new Response(fs.readFileSync(file))
    : new Response("missing", { status: 404 });
}) as typeof fetch;
const noBoot: Boot = { healthy() {}, fail() {} };
const updater = (boot = noBoot, target = shell) =>
  new AppUpdater({
    directory: path.join(profile, "app-update"),
    shell: target,
    version: "2.0.3",
    boot,
    fetcher,
    url,
    publicKey,
  });

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "vibe-app-update-"));
  appDir = path.join(root, "build/app");
  server = path.join(root, "server");
  profile = path.join(root, "profile");
  write(path.join(root, "package-lock.json"), lock());
  write(
    path.join(appDir, "main/index.js"),
    'const z = require("zod"); require("node:fs"); require("electron");',
  );
  write(path.join(appDir, "preload/index.js"), 'require("electron");');
  shell = {
    appRuntime: appRuntime(appDir, root),
    publishedAt: "2026-09-01T00:00:00Z",
    commit: "b".repeat(40),
  };
  requests = [];
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe("app updates", () => {
  it("installs a signed update that the next start runs", async () => {
    const manifest = publish();
    const result = await updater().update();
    expect(result.result).toBe("updated");
    expect(result.status.pending).toBe(true);
    const directory = path.join(profile, "app-update");
    const choice = selectUpdate(directory, shell, publicKey);
    expect(choice).toMatchObject({ kind: "load" });
    expect(
      fs.readFileSync(
        path.join(directory, manifest.revision, "renderer/index.html"),
        "utf8",
      ),
    ).toBe("<p>new</p>");
    markLaunching(directory, manifest.revision);
    markHealthy(directory);
    expect(selectUpdate(directory, shell, publicKey).kind).toBe("load");
  });

  it("falls back to the installed app after an update fails to start", async () => {
    const manifest = publish();
    await updater().update();
    const directory = path.join(profile, "app-update");
    markLaunching(directory, manifest.revision);
    expect(selectUpdate(directory, shell, publicKey).kind).toBe("failed");
    expect(selectUpdate(directory, shell, publicKey).kind).toBe("failed");
    const failed = updater({ ...noBoot, failed: true });
    expect(failed.status.warning).toMatch(/could not start/);
  });

  it("rejects updates signed with another key", async () => {
    publish();
    const other = crypto.generateKeyPairSync("ed25519").publicKey;
    const wrong = new AppUpdater({
      directory: path.join(profile, "app-update"),
      shell,
      version: "2.0.3",
      boot: noBoot,
      fetcher,
      url,
      publicKey: other
        .export({ type: "spki", format: "der" })
        .toString("base64"),
    });
    await expect(wrong.update()).rejects.toThrow(/not signed/);
    expect(fs.existsSync(path.join(profile, "app-update"))).toBe(false);
  });

  it("rejects a damaged download without replacing the current update", async () => {
    const manifest = publish();
    fs.appendFileSync(path.join(server, `${manifest.revision}.json`), " ");
    await expect(updater().update()).rejects.toThrow(/damaged/);
    expect(fs.existsSync(path.join(profile, "app-update/current.json"))).toBe(
      false,
    );
  });

  it("asks for an installer when the runtime differs", async () => {
    publish();
    const result = await updater(noBoot, {
      ...shell,
      appRuntime: "c".repeat(64),
    }).update();
    expect(result.result).toBe("installer");
    expect(requests).toEqual([url]);
  });

  it("reports current for code that is not newer than what is running", async () => {
    publish("2026-08-01T00:00:00Z");
    expect((await updater().update()).result).toBe("current");
    publish();
    const first = updater();
    expect((await first.update()).result).toBe("updated");
    expect((await first.update()).result).toBe("current");
  });

  it("ignores a saved update once a newer installer is present", async () => {
    publish();
    await updater().update();
    const directory = path.join(profile, "app-update");
    expect(
      selectUpdate(
        directory,
        { ...shell, publishedAt: "2026-10-01T00:00:00Z" },
        publicKey,
      ).kind,
    ).toBe("none");
    expect(
      selectUpdate(
        directory,
        { ...shell, appRuntime: "d".repeat(64) },
        publicKey,
      ).kind,
    ).toBe("none");
  });

  it("refuses bundles with files outside the app folders", async () => {
    const bundle = JSON.stringify({
      formatVersion: 1,
      files: {
        "main/index.js": "",
        "preload/index.js": "",
        "renderer/index.html": "",
        "main/../../escape.js": "",
      },
    });
    const revision = crypto.createHash("sha256").update(bundle).digest("hex");
    const text = JSON.stringify({
      formatVersion: 1,
      revision,
      commit,
      version: "2.1.0",
      publishedAt: "2026-09-24T12:00:00Z",
      runtime: shell.appRuntime,
    });
    fs.mkdirSync(server, { recursive: true });
    fs.writeFileSync(path.join(server, `${revision}.json`), bundle);
    fs.writeFileSync(
      path.join(server, "latest.json"),
      JSON.stringify({
        manifest: text,
        signature: crypto
          .sign(null, Buffer.from(text), keys.privateKey)
          .toString("base64"),
      }),
    );
    await expect(updater().update()).rejects.toThrow(/unexpected file/);
    expect(fs.existsSync(path.join(root, "escape.js"))).toBe(false);
  });

  it("is unavailable in development builds", async () => {
    const dev = new AppUpdater({
      directory: path.join(profile, "app-update"),
      version: "2.0.3",
      boot: noBoot,
      fetcher,
      url,
      publicKey,
    });
    expect(dev.status.source).toBe("development");
    await expect(dev.update()).rejects.toThrow(/installed app/);
  });

  it("fingerprints only the packages the main process can load", () => {
    const before = appRuntime(appDir, root);
    write(
      path.join(root, "package-lock.json"),
      lock().replace('"19.2.0"', '"19.3.0"'),
    );
    expect(appRuntime(appDir, root)).toBe(before);
    write(path.join(root, "package-lock.json"), lock("4.2.0"));
    expect(appRuntime(appDir, root)).not.toBe(before);
  });
});
