import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
const destination = path.resolve("build/learning");
writable(destination);
fs.rmSync(destination, { recursive: true, force: true });
fs.mkdirSync(destination, { recursive: true });
fs.copyFileSync(
  "build/content/catalog.json",
  path.join(destination, "catalog.json"),
);
const goRoot = execFileSync("go", ["env", "GOROOT"], {
  encoding: "utf8",
}).trim();
fs.cpSync(goRoot, path.join(destination, "go"), {
  recursive: true,
  filter: (source) =>
    !/^(doc|test|api|misc)(\/|$)/.test(path.relative(goRoot, source)),
});
writable(destination);
fs.writeFileSync(
  path.join(destination, "runtime.json"),
  JSON.stringify({
    go: execFileSync("go", ["version"], { encoding: "utf8" }).trim(),
    platform: process.platform,
    arch: process.arch,
  }),
);
console.log(
  "Prepared course catalog and local Go toolchain. No learner workspace was touched.",
);

function writable(dir: string): void {
  if (!fs.existsSync(dir)) return;
  const stat = fs.lstatSync(dir);
  if (stat.isSymbolicLink()) return;
  fs.chmodSync(dir, stat.mode | 0o200 | (stat.isDirectory() ? 0o100 : 0));
  if (stat.isDirectory())
    for (const name of fs.readdirSync(dir)) writable(path.join(dir, name));
}
