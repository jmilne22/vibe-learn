#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const refsDir = path.resolve(__dirname, "../references");

const PROFILE_SOFT_LIMIT = 80;
const MEMORY_SOFT_LIMIT = 120;

const SIGNAL_HEADINGS =
  /^(did well|what they knew|weak spots to revisit|what they didn't know|where they got stuck|what frustrated them|what helped and what didn't|advice for the next session)\b/i;

function vibeDir() {
  const home = process.env.VIBE_HOME || os.homedir();
  return path.join(home, ".vibe-learn");
}

function storePaths() {
  const dir = vibeDir();
  return {
    dir,
    profile: path.join(dir, "profile.md"),
    memory: path.join(dir, "memory.md"),
  };
}

function readOptional(file) {
  try {
    if (!fs.existsSync(file)) return null;
    return fs.readFileSync(file, "utf8");
  } catch {
    return null;
  }
}

function lineCount(text) {
  if (!text) return 0;
  return text.replace(/\r?\n$/, "").split(/\r?\n/).length;
}

function writeIfMissing(target, templateFile) {
  if (fs.existsSync(target)) return false;
  const content = fs.readFileSync(path.join(refsDir, templateFile), "utf8");
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, { flag: "wx", encoding: "utf8" });
  return true;
}

function nextUncheckedStep(notesText) {
  if (!notesText) return null;
  const match = notesText.match(/^- \[ \]\s+(.+)$/m);
  return match ? match[1].trim() : null;
}

function latestMentorSections(mentorText, count = 2) {
  if (!mentorText) return [];
  const lines = mentorText.split(/\r?\n/);
  const starts = [];
  for (let i = 0; i < lines.length; i++) {
    if (/^##\s+/.test(lines[i])) starts.push(i);
  }
  if (!starts.length) return [];
  const sections = starts.map((start, idx) => {
    const end = idx + 1 < starts.length ? starts[idx + 1] : lines.length;
    return lines.slice(start, end).join("\n").trim();
  });
  return sections.slice(-count);
}

function parseMentorNotes(markdown) {
  const lines = markdown.split(/\r?\n/);
  const steps = [];
  let currentStep = null;
  let currentSub = null;

  const flushSub = () => {
    if (currentStep && currentSub) {
      const body = currentSub.lines.join("\n").trim();
      if (body) currentStep.subsections.push({ heading: currentSub.heading, body });
    }
    currentSub = null;
  };

  for (const line of lines) {
    const h2 = /^##\s+(.+)$/.exec(line);
    if (h2) {
      flushSub();
      currentStep = { heading: h2[1].trim(), subsections: [] };
      steps.push(currentStep);
      continue;
    }
    if (!currentStep) continue;

    const h3 = /^###\s+(.+)$/.exec(line);
    if (h3) {
      flushSub();
      const heading = h3[1].trim();
      if (SIGNAL_HEADINGS.test(heading)) {
        currentSub = { heading, lines: [] };
      }
      continue;
    }

    // Also support bullet-style sections from MENTOR_NOTES_TEMPLATE (e.g. "- **Weak spots to revisit**: ...")
    if (!currentSub) {
      const bullet = /^-\s+\*\*([^*]+)\*\*:?\s*(.*)$/.exec(line);
      if (bullet && SIGNAL_HEADINGS.test(bullet[1].trim())) {
        currentStep.subsections.push({
          heading: bullet[1].trim(),
          body: bullet[2].trim() || "(see section)",
        });
      }
      continue;
    }

    currentSub.lines.push(line);
  }
  flushSub();
  return steps.filter((s) => s.subsections.length > 0);
}

function printHelp() {
  console.log(`Vibe Learn Cross-Project Memory Helper

Usage:
  memory.mjs init
  memory.mjs read [--cwd <project-dir>] [--json]
  memory.mjs inspect <path/to/MENTOR-NOTES.md> [--json]
  memory.mjs status [--json]
`);
}

function main(argv) {
  const [command, ...rest] = argv;
  if (!command || command === "-h" || command === "--help" || command === "help") {
    printHelp();
    return 0;
  }

  const paths = storePaths();

  switch (command) {
    case "init": {
      const created = [];
      const kept = [];
      if (writeIfMissing(paths.profile, "learner-profile-template.md"))
        created.push(paths.profile);
      else kept.push(paths.profile);
      if (writeIfMissing(paths.memory, "memory-template.md"))
        created.push(paths.memory);
      else kept.push(paths.memory);
      if (created.length) console.log(`Created: ${created.join(", ")}`);
      if (kept.length) console.log(`Kept existing: ${kept.join(", ")}`);
      return 0;
    }

    case "status": {
      const { values } = parseArgs({
        args: rest,
        options: { json: { type: "boolean", default: false } },
      });
      const profileText = readOptional(paths.profile);
      const memoryText = readOptional(paths.memory);
      const profileLines = lineCount(profileText);
      const memoryLines = lineCount(memoryText);
      const warnings = [];
      if (profileLines > PROFILE_SOFT_LIMIT) {
        warnings.push(
          `profile.md is ${profileLines} lines (recommended <= ${PROFILE_SOFT_LIMIT}); prune duplicates.`,
        );
      }
      if (memoryLines > MEMORY_SOFT_LIMIT) {
        warnings.push(
          `memory.md is ${memoryLines} lines (recommended <= ${MEMORY_SOFT_LIMIT}); merge or prune resolved items.`,
        );
      }
      const payload = {
        dir: paths.dir,
        profile: { path: paths.profile, exists: profileText !== null, lines: profileLines },
        memory: { path: paths.memory, exists: memoryText !== null, lines: memoryLines },
        warnings,
      };
      if (values.json) {
        console.log(JSON.stringify(payload, null, 2));
      } else {
        console.log(
          `profile.md: ${payload.profile.exists ? `${profileLines} lines` : "not created"} (${paths.profile})`,
        );
        console.log(
          `memory.md:  ${payload.memory.exists ? `${memoryLines} lines` : "not created"} (${paths.memory})`,
        );
        for (const w of warnings) console.log(`WARN: ${w}`);
      }
      return 0;
    }

    case "read": {
      const { values } = parseArgs({
        args: rest,
        options: {
          cwd: { type: "string" },
          json: { type: "boolean", default: false },
        },
      });
      const cwd = values.cwd ? path.resolve(values.cwd) : process.cwd();
      const profileText = readOptional(paths.profile);
      const memoryText = readOptional(paths.memory);
      const localNotes = readOptional(path.join(cwd, "NOTES.md"));
      const localMentor = readOptional(path.join(cwd, "MENTOR-NOTES.md"));
      const nextStep = nextUncheckedStep(localNotes);
      const recentMentor = latestMentorSections(localMentor, 2);

      const payload = {
        profile: profileText,
        memory: memoryText,
        local: {
          cwd,
          nextStep,
          recentMentorSections: recentMentor,
        },
      };
      if (values.json) {
        console.log(JSON.stringify(payload, null, 2));
        return 0;
      }

      const blocks = [];
      if (profileText) blocks.push(`=== ~/.vibe-learn/profile.md ===\n${profileText.trim()}`);
      if (memoryText) blocks.push(`=== ~/.vibe-learn/memory.md ===\n${memoryText.trim()}`);
      if (nextStep) blocks.push(`=== Next unchecked step (NOTES.md) ===\n${nextStep}`);
      if (recentMentor.length) {
        blocks.push(
          `=== Recent local MENTOR-NOTES.md (${recentMentor.length} section(s)) ===\n${recentMentor.join("\n\n")}`,
        );
      }
      console.log(
        blocks.length
          ? blocks.join("\n\n")
          : "No global ~/.vibe-learn/ memory or local project notes found.",
      );
      return 0;
    }

    case "inspect": {
      const { values, positionals } = parseArgs({
        args: rest,
        allowPositionals: true,
        options: { json: { type: "boolean", default: false } },
      });
      const fileArg = positionals[0] || "MENTOR-NOTES.md";
      const filePath = path.resolve(fileArg);
      if (!fs.existsSync(filePath)) {
        throw new Error(`Mentor notes file not found: ${filePath}`);
      }
      const raw = fs.readFileSync(filePath, "utf8");
      const steps = parseMentorNotes(raw);
      const profileText = readOptional(paths.profile);
      const memoryText = readOptional(paths.memory);
      const payload = {
        source: filePath,
        stepCount: steps.length,
        steps,
        globalStore: {
          profileExists: profileText !== null,
          profileLines: lineCount(profileText),
          memoryExists: memoryText !== null,
          memoryLines: lineCount(memoryText),
        },
      };
      if (values.json) {
        console.log(JSON.stringify(payload, null, 2));
        return 0;
      }
      console.log(`Source: ${filePath}`);
      console.log(
        `Global store: profile.md (${payload.globalStore.profileExists ? `${payload.globalStore.profileLines} lines` : "absent"}), memory.md (${payload.globalStore.memoryExists ? `${payload.globalStore.memoryLines} lines` : "absent"})`,
      );
      if (!steps.length) {
        console.log("\nNo structured step sections found to distill.");
        return 0;
      }
      for (const step of steps) {
        console.log(`\n## ${step.heading}`);
        for (const sub of step.subsections) {
          console.log(`### ${sub.heading}\n${sub.body}`);
        }
      }
      return 0;
    }

    default:
      console.error(`Unknown subcommand: ${command}`);
      printHelp();
      return 2;
  }
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

