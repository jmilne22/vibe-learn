import fs from "node:fs";
import path from "node:path";

export interface ValidationIssue {
  severity: "error" | "warning";
  file: string;
  message: string;
}

export interface ValidationReport {
  ok: boolean;
  issues: ValidationIssue[];
  stepFiles: string[];
}

const REQUIRED_FILES = [
  "README.md",
  "NOTES.md",
  "MENTOR-NOTES.md",
  "AGENTS.md",
  "CLAUDE.md",
  "GEMINI.md",
];

const SOFT_PHRASAL_VERBS =
  /\b(spin up|reach out|dive into|kick off|circle back|touch base)\b/i;

function checkSteLines(
  relPath: string,
  markdown: string,
  issues: ValidationIssue[],
): void {
  const lines = markdown.split(/\r?\n/);
  let inFence = false;
  let inDetails = false;
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!;
    const trimmed = raw.trim();
    if (/^(`{3,}|~{3,})/.test(trimmed)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    if (trimmed.startsWith("<details")) inDetails = true;
    if (trimmed.startsWith("</details")) {
      inDetails = false;
      continue;
    }
    if (inDetails || trimmed.startsWith("|") || trimmed.startsWith(">"))
      continue;
    // Strip inline code spans and URLs before checking prose rules.
    const prose = trimmed
      .replace(/`[^`]*`/g, "code")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
    if (SOFT_PHRASAL_VERBS.test(prose)) {
      issues.push({
        severity: "warning",
        file: `${relPath}:${i + 1}`,
        message: `Avoid soft phrasal verb in prose ("${prose.match(SOFT_PHRASAL_VERBS)?.[0]}").`,
      });
    }
    if (/^\d+\.\s+/.test(prose) && prose.includes(";")) {
      issues.push({
        severity: "warning",
        file: `${relPath}:${i + 1}`,
        message:
          "Avoid semicolons in numbered step procedures; use one instruction per sentence.",
      });
    }
  }
}

export function validateWorkspace(dir: string): ValidationReport {
  const issues: ValidationIssue[] = [];
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    return {
      ok: false,
      issues: [
        {
          severity: "error",
          file: dir,
          message: "Workspace directory does not exist.",
        },
      ],
      stepFiles: [],
    };
  }

  for (const name of REQUIRED_FILES) {
    if (!fs.existsSync(path.join(dir, name))) {
      issues.push({
        severity: "error",
        file: name,
        message: `Missing required workspace file: ${name}`,
      });
    }
  }

  const readmePath = path.join(dir, "README.md");
  if (fs.existsSync(readmePath)) {
    const readme = fs.readFileSync(readmePath, "utf8");
    if (!/^#{2,3}\s+Glossary\b/m.test(readme)) {
      issues.push({
        severity: "warning",
        file: "README.md",
        message:
          "Missing Glossary section (define each domain term with one meaning).",
      });
    }
    checkSteLines("README.md", readme, issues);
  }

  const stepsDir = path.join(dir, "steps");
  const stepFiles: string[] = [];
  if (fs.existsSync(stepsDir) && fs.statSync(stepsDir).isDirectory()) {
    const entries = fs
      .readdirSync(stepsDir)
      .filter((f) => f.endsWith(".md"))
      .sort();
    for (const [index, name] of entries.entries()) {
      const rel = `steps/${name}`;
      stepFiles.push(rel);
      const expectedPrefix = `${String(index + 2).padStart(2, "0")}-`;
      if (!name.startsWith(expectedPrefix)) {
        issues.push({
          severity: "error",
          file: rel,
          message: `Expected step filename to start with "${expectedPrefix}" to stay aligned with README.md (01).`,
        });
      }
      const content = fs.readFileSync(path.join(stepsDir, name), "utf8");
      if (!/^#{2,3}\s+AI mentor prompt\b/im.test(content)) {
        issues.push({
          severity: "warning",
          file: rel,
          message: "Missing 'AI mentor prompt' section at the end of the step.",
        });
      }
      if (!content.includes("<details>")) {
        issues.push({
          severity: "warning",
          file: rel,
          message:
            "No folded <details> hints found; consider adding progressive hints.",
        });
      }
      checkSteLines(rel, content, issues);
    }
  }

  const notesPath = path.join(dir, "NOTES.md");
  if (fs.existsSync(notesPath) && stepFiles.length > 0) {
    const notes = fs.readFileSync(notesPath, "utf8");
    for (let i = 0; i < stepFiles.length; i++) {
      const num = String(i + 2).padStart(2, "0");
      if (!new RegExp(`^- \\[[ xX]\\] ${num}\\b`, "m").test(notes)) {
        issues.push({
          severity: "warning",
          file: "NOTES.md",
          message: `Checklist is missing an item for step ${num} (${stepFiles[i]}).`,
        });
      }
    }
  }

  return {
    ok: !issues.some((i) => i.severity === "error"),
    issues,
    stepFiles,
  };
}

