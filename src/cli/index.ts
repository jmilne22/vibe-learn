#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import {
  AssistantModeSchema,
  CatalogSchema,
  ProjectLanguageSchema,
  Slug,
  type AssistantMode,
  type Catalog,
  type ProjectLanguage,
} from "../shared/model";
import {
  addStandaloneMentorFiles,
  createBlankProject,
  createWorkspace,
} from "../workspace/fs";
import { validateWorkspace } from "../workspace/validate";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(__dirname, "../..");

function loadCatalog(): Catalog {
  const candidates = [
    path.join(packageRoot, "build/content/catalog.json"),
    path.join(process.cwd(), "build/content/catalog.json"),
  ];
  for (const file of candidates) {
    if (fs.existsSync(file)) {
      return CatalogSchema.parse(JSON.parse(fs.readFileSync(file, "utf8")));
    }
  }
  throw new Error(
    "Could not find catalog.json. Run `npm run content` first if running from source.",
  );
}

function resolveSkillSource(): string {
  const dir = path.join(packageRoot, "skills/vibe-learn");
  if (!fs.existsSync(path.join(dir, "SKILL.md"))) {
    throw new Error(`Could not find skill source at ${dir}`);
  }
  return dir;
}

function parseMode(raw: string | undefined): AssistantMode {
  return AssistantModeSchema.parse(raw ?? "mentor");
}

function parseLang(raw: string | undefined): ProjectLanguage {
  return ProjectLanguageSchema.parse(raw ?? "go");
}

function titleFromSlug(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part[0]!.toUpperCase() + part.slice(1))
    .join(" ");
}

function printHelp(): void {
  console.log(`Vibe Learn — AI Coding Mentor & Project Workspace CLI

Usage:
  vibe-learn list
  vibe-learn init <slug> [parent-dir] [--mode mentor|pair]
  vibe-learn new <slug> [parent-dir] [--title "..."] [--lang go|python|typescript|rust|generic] [--mode mentor|pair] [--goal "..."]
  vibe-learn mentor [dir] [--title "..."] [--lang go|python|typescript|rust|generic] [--mode mentor|pair]
  vibe-learn validate [dir]
  vibe-learn profile [--init] [--path]
  vibe-learn install-skill [--target claude|agents|project] [--dir <path>] [--force]
`);
}

export function runCli(argv: string[]): number {
  const [command, ...rest] = argv;
  if (!command || command === "-h" || command === "--help" || command === "help") {
    printHelp();
    return 0;
  }

  switch (command) {
    case "list": {
      const catalog = loadCatalog();
      for (const project of catalog.items) {
        console.log(
          `${project.slug.padEnd(28)} ${project.language.padEnd(10)} ${String(project.stages.length).padStart(2)} steps  ${project.title}`,
        );
      }
      return 0;
    }

    case "init": {
      const { values, positionals } = parseArgs({
        args: rest,
        allowPositionals: true,
        options: {
          mode: { type: "string", default: "mentor" },
        },
      });
      const slug = positionals[0];
      if (!slug) {
        console.error("Usage: vibe-learn init <slug> [parent-dir] [--mode mentor|pair]");
        return 2;
      }
      const catalog = loadCatalog();
      const project = catalog.items.find(
        (p) => p.slug === slug || p.id === slug || p.id === `project:${slug}`,
      );
      if (!project) {
        console.error(
          `Unknown project "${slug}". Run \`vibe-learn list\` to see available starter tracks.`,
        );
        return 1;
      }
      const parent = positionals[1] ? path.resolve(positionals[1]) : process.cwd();
      const mode = parseMode(values.mode);
      const created = createWorkspace(parent, project, mode);
      console.log(`Created ${mode} workspace at ${created}`);
      console.log(`Next: cd "${created}" and open README.md with your coding assistant.`);
      return 0;
    }

    case "new": {
      const { values, positionals } = parseArgs({
        args: rest,
        allowPositionals: true,
        options: {
          title: { type: "string" },
          lang: { type: "string", default: "go" },
          mode: { type: "string", default: "mentor" },
          goal: { type: "string" },
        },
      });
      const rawSlug = positionals[0];
      if (!rawSlug) {
        console.error(
          "Usage: vibe-learn new <slug> [parent-dir] [--title ...] [--lang ...] [--mode mentor|pair] [--goal ...]",
        );
        return 2;
      }
      const slug = Slug.parse(rawSlug);
      const parent = positionals[1] ? path.resolve(positionals[1]) : process.cwd();
      const title = values.title || titleFromSlug(slug);
      const mode = parseMode(values.mode);
      const language = parseLang(values.lang);
      const created = createBlankProject(parent, {
        slug,
        title,
        mode,
        language,
        goal: values.goal,
      });
      console.log(`Created custom ${mode} project skeleton at ${created}`);
      console.log("");
      console.log("Paste this into Claude Code, Codex, Gemini CLI, or Zed inside that folder:");
      console.log(
        `  Use the vibe-learn skill to design a running-first STE100 learning project in this folder for "${title}" in ${language}. Read ~/.vibe-learn/profile.md if present, ask any missing intake questions, write README.md and steps/NN-*.md, update NOTES.md, and run \`vibe-learn validate .\`.`,
      );
      return 0;
    }

    case "mentor": {
      const { values, positionals } = parseArgs({
        args: rest,
        allowPositionals: true,
        options: {
          title: { type: "string" },
          lang: { type: "string", default: "generic" },
          mode: { type: "string", default: "mentor" },
        },
      });
      const target = positionals[0] ? path.resolve(positionals[0]) : process.cwd();
      const title = values.title || path.basename(target) || "Project";
      const mode = parseMode(values.mode);
      const language = parseLang(values.lang);
      const result = addStandaloneMentorFiles(target, { title, mode, language });
      console.log(
        result.written.length
          ? `Added ${result.written.length} mentor file(s) in ${target}: ${result.written.join(", ")}`
          : `All mentor files were already present in ${target}.`,
      );
      if (result.skipped.length) {
        console.log(`Kept existing files untouched: ${result.skipped.join(", ")}`);
      }
      return 0;
    }

    case "validate": {
      const target = rest[0] ? path.resolve(rest[0]) : process.cwd();
      const report = validateWorkspace(target);
      for (const issue of report.issues) {
        const tag = issue.severity === "error" ? "ERROR" : "WARN ";
        console.log(`${tag}  ${issue.file}: ${issue.message}`);
      }
      const errors = report.issues.filter((i) => i.severity === "error").length;
      const warnings = report.issues.filter((i) => i.severity === "warning").length;
      console.log(
        report.ok
          ? `Valid workspace (${report.stepFiles.length} step files, ${warnings} warning(s)).`
          : `Invalid workspace (${errors} error(s), ${warnings} warning(s)).`,
      );
      return report.ok ? 0 : 1;
    }

    case "profile": {
      const { values } = parseArgs({
        args: rest,
        options: {
          init: { type: "boolean", default: false },
          path: { type: "boolean", default: false },
        },
      });
      const home = process.env.VIBE_HOME || os.homedir();
      const vibeDir = path.join(home, ".vibe-learn");
      const profilePath = path.join(vibeDir, "profile.md");
      const memoryPath = path.join(vibeDir, "memory.md");
      if (values.path) {
        console.log(profilePath);
        return 0;
      }
      if (values.init) {
        fs.mkdirSync(vibeDir, { recursive: true });
        const skillSrc = resolveSkillSource();
        const pairs: [string, string][] = [
          [profilePath, "references/learner-profile-template.md"],
          [memoryPath, "references/memory-template.md"],
        ];
        for (const [target, relTemplate] of pairs) {
          if (fs.existsSync(target)) {
            console.log(`Already exists: ${target}`);
          } else {
            const template = fs.readFileSync(
              path.join(skillSrc, relTemplate),
              "utf8",
            );
            fs.writeFileSync(target, template, "utf8");
            console.log(`Created: ${target}`);
          }
        }
        return 0;
      }
      if (fs.existsSync(profilePath)) {
        console.log(fs.readFileSync(profilePath, "utf8"));
      } else {
        console.log(
          `No learner profile yet at ${profilePath}. Run \`vibe-learn profile --init\` to create profile.md and memory.md.`,
        );
      }
      return 0;
    }

    case "install-skill": {
      const { values } = parseArgs({
        args: rest,
        options: {
          target: { type: "string", default: "agents" },
          dir: { type: "string" },
          force: { type: "boolean", default: false },
        },
      });
      const home = process.env.VIBE_HOME || os.homedir();
      let dest: string;
      if (values.dir) {
        dest = path.resolve(values.dir);
      } else if (values.target === "claude") {
        dest = path.join(home, ".claude/skills/vibe-learn");
      } else if (values.target === "project") {
        dest = path.resolve(process.cwd(), ".agents/skills/vibe-learn");
      } else if (values.target === "agents") {
        dest = path.join(home, ".agents/skills/vibe-learn");
      } else {
        console.error(
          `Unknown --target "${values.target}". Use claude, agents, or project.`,
        );
        return 2;
      }
      if (fs.existsSync(dest) && !values.force) {
        console.error(
          `Skill already exists at ${dest}. Pass --force to overwrite.`,
        );
        return 1;
      }
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.cpSync(resolveSkillSource(), dest, { recursive: true, force: true });
      console.log(`Installed vibe-learn skill to ${dest}`);
      return 0;
    }

    default:
      console.error(`Unknown command: ${command}`);
      printHelp();
      return 2;
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    process.exitCode = runCli(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

