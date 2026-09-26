import fs from "node:fs";
import path from "node:path";
import type { AssistantMode, Item, Stage } from "../shared/model";
import { htmlToMarkdown } from "../content/markdown-out";
// Project workspaces carry the brief as Markdown steps plus instructions for
// external coding assistants, which only see the folder.
export interface WorkspaceFile {
  path: string;
  contents: string;
}
export interface AddedFiles {
  written: string[];
  skipped: string[];
}
const safe = (s: string) =>
  s.replace(/[^a-zA-Z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
export const workspaceSlug = (item: Pick<Item, "id">): string =>
  safe(item.id.replace(/^project:/, "")) || "project";
interface Step {
  stage: Stage;
  number: string;
  // Relative to the workspace root.
  file: string;
}
function layout(item: Item): Step[] {
  // Numbering matches the app's sidebar, so "step 02" means the same in both.
  return item.stages.map((stage, index) => {
    const number = String(index + 1).padStart(2, "0");
    const file =
      index === 0 && stage.id === "overview"
        ? "README.md"
        : `steps/${number}-${safe(stage.id) || "step"}.md`;
    return { stage, number, file };
  });
}
function resolver(item: Item, steps: Step[], from: string) {
  return (href: string): string | null => {
    if (/^(https?:|mailto:)/.test(href)) return href;
    const route = /^#\/read\/([^/?]+)\/([^/?]+)/.exec(href);
    if (!route || decodeURIComponent(route[1]!) !== item.id) return null;
    const stageId = decodeURIComponent(route[2]!);
    const target = steps.find((s) => s.stage.id === stageId);
    return target
      ? path.posix.relative(path.posix.dirname(from), target.file)
      : null;
  };
}
const STEPS_SECTION = `## Working through the steps

The brief is README.md (step 01) and the files in steps/. They are numbered as in Vibe Learn, where I read them.

- Work only on the step I name. If I haven't said which step I'm on, ask.
- Read that step's file before helping. Don't read ahead or bring up requirements from later steps.
- The \`<details>\` blocks in each step are hints and review answers. Never reveal them unprompted. When I'm stuck, give the smallest nudge first, and use a hint only after that, one at a time.
- NOTES.md is my own log. Read it if it's there, but don't edit it.
- A step is done when its "tests to write" pass and I'm happy with the code. Passing the checks in Vibe Learn doesn't prove every requirement, so review against the step's text too.
`;
const TONE = `### Tone

Conversational and short. No lectures, no walls of text. Ask one question at a time. If I seem frustrated, take smaller steps.

### Voice-friendly

- When voice output is available, explain the logic without reading code blocks, punctuation, file paths, or terminal logs aloud unless I ask. Keep code and commands visible in text.
- Keep spoken replies usually under a minute, unless I ask for a deeper explanation.
- These guidelines also apply in text-only sessions.
`;
const MENTOR = `## Your role

You are a patient, friendly senior engineer pairing with me. I am learning by building. I write every line of code; you never write or edit my project files.

### How to help

- Read my code and run the build and tests (for Go: \`go build\`, \`go vet\`, \`go test ./...\`) to see where I am, but don't fix anything. When you run a command, show it so I learn it too.
- Lead with questions: what do I expect to happen, what did I try, what is the error telling me?
- Give the smallest hint that gets me unstuck, and escalate only if I'm still stuck:
  1. name the concept or the part of the error to look at
  2. point to where in my code, or which doc or package to read
  3. describe what to try, in words
  4. a short snippet of a *different*, analogous example
- Never paste the code I'm meant to write unless I explicitly say "show me". Even then, show the smallest piece and have me type it in.
- Link official sources when useful, such as go.dev/doc, pkg.go.dev, and the docs the step references.

### Reviewing my work

- When something works, say briefly what I did well, then offer one thing that would make it more idiomatic or robust. Only one per round.
- If I ask "is this good?", be honest the way a good friend is: specific, kind, no flattery.
- Prefer the standard library and simple code. Don't push patterns I haven't needed yet.
`;
const PAIR = `## Your role

You are a patient senior engineer pair-programming with me. I am learning by building, so the goal is my understanding, not just working code.

### How to help

- Before you change code, say in a sentence or two what you plan to change and why, and wait for my OK.
- Make small changes, one idea at a time. Run the build and tests after each (for Go: \`go build\`, \`go vet\`, \`go test ./...\`) and show the commands.
- Explain each change briefly: what it does and why it's the idiomatic choice.
- When a step is teaching a concept, offer to let me write that part while you give hints instead.
- Don't write code for later steps, and don't add features the step doesn't ask for.
- Link official sources when useful, such as go.dev/doc, pkg.go.dev, and the docs the step references.

### Reviewing

- If I ask "is this good?", be honest the way a good friend is: specific, kind, no flattery.
- Prefer the standard library and simple code. Don't introduce patterns the project hasn't needed yet.
`;
function agents(item: Item, mode: AssistantMode): string {
  const intro =
    mode === "mentor"
      ? "I'm building this project myself, step by step. These instructions apply to any AI assistant helping in this folder."
      : "I'm building this project step by step with an AI assistant. These instructions apply to any AI assistant helping in this folder.";
  return `# ${item.title}: assistant instructions

${intro}

${STEPS_SECTION}
${mode === "mentor" ? MENTOR : PAIR}
${TONE}`;
}
export function workspaceFiles(
  item: Item,
  mode: AssistantMode,
): WorkspaceFile[] {
  const steps = layout(item);
  const md = (step: Step) =>
    htmlToMarkdown(step.stage.html, resolver(item, steps, step.file));
  const overview = steps[0]?.file === "README.md" ? steps[0] : undefined;
  let intro = overview ? md(overview) : "";
  if (!intro.startsWith("# "))
    intro =
      `# ${item.title}\n\n${item.description}\n\n${intro}`.trimEnd() + "\n";
  const list = steps
    .map((s) =>
      s === overview
        ? `${s.number}. ${s.stage.title} (this file)`
        : `${s.number}. [${s.stage.title}](${s.file})`,
    )
    .join("\n");
  const readme = `${intro}
## Steps

${list}

## Working with an AI assistant

AGENTS.md tells coding assistants such as Claude Code, Codex, Gemini CLI, OpenCode and Zed how to help. Tell yours which step you're on, for example "I'm on step 02". Aider needs \`aider --read AGENTS.md\`.
`;
  const notes = `# Notes

My own log. The assistant reads it but doesn't edit it.

## Steps

${steps.map((s) => `- [ ] ${s.number} ${s.stage.title}`).join("\n")}

## Currently on

## Stuck on

## Learned
`;
  const files: WorkspaceFile[] = [
    { path: "README.md", contents: readme },
    ...steps
      .filter((s) => s !== overview)
      .map((s) => ({ path: s.file, contents: md(s) })),
    { path: "NOTES.md", contents: notes },
    { path: "AGENTS.md", contents: agents(item, mode) },
    { path: "CLAUDE.md", contents: "@AGENTS.md\n" },
    { path: "GEMINI.md", contents: "@AGENTS.md\n" },
  ];
  if (mode === "mentor")
    files.push({
      path: ".claude/settings.local.json",
      contents:
        JSON.stringify(
          { permissions: { deny: ["Edit", "Write", "NotebookEdit"] } },
          null,
          2,
        ) + "\n",
    });
  return files;
}
function write(folder: string, file: WorkspaceFile): boolean {
  const target = path.join(folder, file.path);
  try {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, file.contents, { flag: "wx" });
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") return false;
    throw error;
  }
}
export function createWorkspace(
  parent: string,
  item: Item,
  mode: AssistantMode,
): string {
  const slug = workspaceSlug(item);
  const base = fs.realpathSync(parent);
  let folder = "";
  for (let n = 1; !folder; n++) {
    const candidate = path.join(base, n === 1 ? slug : `${slug}-${n}`);
    try {
      fs.mkdirSync(candidate); // New folders only; never replace existing work.
      folder = candidate;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST" || n >= 1000)
        throw error;
    }
  }
  try {
    const files = workspaceFiles(item, mode);
    if (item.checks.length)
      files.push({
        path: "go.mod",
        contents: `module example.com/${slug}\n\ngo 1.22\n`,
      });
    for (const file of files) write(folder, file);
  } catch (error) {
    fs.rmSync(folder, { recursive: true, force: true });
    throw error;
  }
  return folder;
}
// For attached folders: creates only missing files and never overwrites.
export function addMissingFiles(
  folder: string,
  item: Item,
  mode: AssistantMode,
): AddedFiles {
  const result: AddedFiles = { written: [], skipped: [] };
  for (const file of workspaceFiles(item, mode))
    (write(folder, file) ? result.written : result.skipped).push(file.path);
  return result;
}
