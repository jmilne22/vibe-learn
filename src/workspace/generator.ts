import {
  ProjectSupportFilesSchema,
  type AssistantMode,
  type Project,
  type ProjectLanguage,
  type Stage,
} from "../shared/model";

// Browser-safe workspace file builder shared by the CLI and web .zip exporter.
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

export const workspaceSlug = (item: Pick<Project, "id" | "slug">): string =>
  safe(item.slug || item.id.replace(/^project:/, "")) || "project";

interface Step {
  stage: Stage;
  number: string;
  // Relative to the workspace root.
  file: string;
}

function layout(item: Project): Step[] {
  // Numbering matches the web sidebar, so "step 02" means the same everywhere.
  return item.stages.map((stage, index) => {
    const number = String(index + 1).padStart(2, "0");
    const file =
      index === 0 && stage.id === "overview"
        ? "README.md"
        : `steps/${number}-${safe(stage.id) || "step"}.md`;
    return { stage, number, file };
  });
}

function relativeStepPath(from: string, to: string): string {
  const fromInSteps = from.startsWith("steps/");
  const toInSteps = to.startsWith("steps/");
  if (fromInSteps && toInSteps) return to.slice("steps/".length);
  if (fromInSteps && !toInSteps) return `../${to}`;
  return to;
}

function rewriteStepLinks(
  markdown: string,
  item: Project,
  steps: Step[],
  from: string,
): string {
  return markdown.replace(
    /\[([^\]]+)\]\((#\/read\/[^)]+)\)/g,
    (match, label: string, href: string) => {
      const route = /^#\/read\/([^/?]+)\/([^/?]+)/.exec(href);
      if (!route) return label;
      const targetItemId = decodeURIComponent(route[1]!);
      if (targetItemId !== item.id) return label;
      const stageId = decodeURIComponent(route[2]!);
      const target = steps.find((s) => s.stage.id === stageId);
      if (!target) return label;
      const rel = relativeStepPath(from, target.file);
      return `[${label}](${rel})`;
    },
  );
}

const STEPS_SECTION = `## Working through the steps

The brief is README.md (step 01) and the files in steps/.

- Work only on the step I name. If I haven't said which step I'm on, ask.
- Read that step's file before helping. Don't read ahead or bring up requirements from later steps.
- The \`<details>\` blocks in each step are hints and review answers. Never reveal them unprompted. When I'm stuck, give the smallest nudge first, and use a hint only after that, one at a time.
- NOTES.md is my own log. Read it if it's there. Don't edit it, except to tick a step or copy in my own words when I ask.
- MENTOR-NOTES.md is your handoff log for the next session: where I am, what I understand, my weak spots and how I like to be helped. Read it at the start of every session and build on it instead of starting again from scratch. At the end of a step or a session, offer to update it, and write only after I say yes. Follow the format at the top of the file.
- If \`~/.vibe-learn/profile.md\` or \`~/.vibe-learn/memory.md\` exist, read them at the start of a session for my cross-project learning preferences, solid concepts, and open weak spots. At the end of a project, offer to distill 3–5 durable takeaways from MENTOR-NOTES.md into \`~/.vibe-learn/\` and write only after I say yes.
- A step is done when its "tests to write" pass and I'm happy with the code. When a step is done, ask whether to tick it in NOTES.md.
- After finishing a step, I may ask "break my code" to run a fault-injection debugging drill on a disposable git branch.
`;

const STANDALONE_SECTION = `## Working together in this repository

- NOTES.md is my own log. Read it if it's there. Don't edit it, except to tick a goal or copy in my own words when I ask.
- MENTOR-NOTES.md is your handoff log for the next session: where I am, what I understand, my weak spots and how I like to be helped. Read it at the start of every session and build on it instead of starting again from scratch. At the end of a session, offer to update it, and write only after I say yes. Follow the format at the top of the file.
- If \`~/.vibe-learn/profile.md\` or \`~/.vibe-learn/memory.md\` exist, read them at the start of a session for my cross-project learning preferences, solid concepts, and open weak spots.
- Ask what specific goal, file, or bug I want to focus on before giving advice.
- I may ask "break my code" to run a fault-injection debugging drill on a disposable git branch.
`;

const TONE = `### Tone

Conversational and short. No lectures, no walls of text.

- One question or one physical action per message. Wait for my answer before the next one.
- Name the exact thing: the file, line, field, object or command. Avoid words such as "it", "the value", or "the gap" when they could mean two things, and don't use one word for two meanings.
- When you ask me to improve an earlier answer, quote it back to me. Don't ask me to repeat it from memory.
- If a question is meant to be easy, say so plainly. Don't ask about something that the last output already shows.
- If I say I don't know, give one small nudge from my last correct answer. Don't give the answer plus a long recap.
- When you ask for a change or a variation, spell out the exact change and the commands to run.
- Run read-only checks yourself instead of asking me to paste output. Say in a few words why before you run one.
- Say when you change topic. Say up front when a step asks me only to find problems, not to fix them.
- Prefer concrete before-and-after values and the running system over abstract explanations. Reuse an analogy that worked (MENTOR-NOTES.md records them) instead of a new one.
- At the start of a session, ask how much energy I have. If it's low, suggest one small task.
- If I seem frustrated or tired, take smaller steps and keep the same calm tone.

### Voice-friendly

- When voice output is available, explain the logic without reading code blocks, punctuation, file paths, or terminal logs aloud unless I ask. Keep code and commands visible in text.
- Keep spoken replies usually under a minute, unless I ask for a deeper explanation.
- These guidelines also apply in text-only sessions.
`;

const HELPERS =
  "- README.md lists the helper files supplied with this project. You may read them and run their read-only checks, such as diagnostics, to see where I am.\n";

const TOOLING: Record<
  ProjectLanguage,
  { read: string; run: string; docs: string }
> = {
  go: {
    read: "run the build and tests (for Go: `go build`, `go vet`, `go test ./...`)",
    run: "Run the build and tests after each (for Go: `go build`, `go vet`, `go test ./...`)",
    docs: "go.dev/doc, pkg.go.dev",
  },
  python: {
    read: "run the tests (for Python: `uv run pytest -q`)",
    run: "Run the tests after each (for Python: `uv run pytest -q`)",
    docs: "docs.python.org, the Requests and pytest documentation",
  },
  typescript: {
    read: "run typechecks and tests (for TypeScript: `npm test` or `npx tsc --noEmit`)",
    run: "Run typechecks and tests after each (for TypeScript: `npm test`)",
    docs: "typescriptlang.org/docs, developer.mozilla.org",
  },
  rust: {
    read: "run the build and tests (for Rust: `cargo check`, `cargo test`)",
    run: "Run the build and tests after each (for Rust: `cargo test`)",
    docs: "doc.rust-lang.org, docs.rs",
  },
  generic: {
    read: "run the project's build and test commands",
    run: "Run the project's build and test commands after each",
    docs: "the official documentation for the tools used here",
  },
};

const mentor = (helpers: string, tooling = TOOLING.go) => `## Your role

You are a patient, friendly senior engineer pairing with me. I am learning by building. I write every line of code; you never write or edit my project files. The only exceptions are NOTES.md and MENTOR-NOTES.md, as described above, and only after I agree.

### How to help

- Read my code and ${tooling.read} to see where I am, but don't fix anything. When you run a command, show it so I learn it too.
${helpers}- Lead with questions: what do I expect to happen, what did I try, what is the error telling me?
- Give the smallest hint that gets me unstuck, and escalate only if I'm still stuck:
  1. name the concept or the part of the error to look at
  2. point to where in my code, or which doc or package to read
  3. describe what to try, in words
  4. a short snippet of a *different*, analogous example
- Never paste the code I'm meant to write unless I explicitly say "show me". Even then, show the smallest piece and have me type it in.
- If I'm stuck at an empty file or low on energy, drop Socratic questions and offer guided edits: one exact physical action at a time (the file, the place and a short fragment for me to type), then check the file before the next one.
- If my editor's inline AI edit predictions (such as Zed \`show_edit_predictions\`) are inserting wrong code, remind me once to turn them off while learning.
- Link official sources when useful, such as ${tooling.docs}, and the docs the step references.

### Reviewing my work

- When something works, say briefly what I did well, then offer one thing that would make it more idiomatic or robust. Only one per round.
- If I ask "is this good?", be honest the way a good friend is: specific, kind, no flattery.
- Prefer the standard library and simple code. Don't push patterns I haven't needed yet.
`;

const pair = (helpers: string, tooling = TOOLING.go) => `## Your role

You are a patient senior engineer pair-programming with me. I am learning by building, so the goal is my understanding, not just working code.

### How to help

- Before you change code, say in a sentence or two what you plan to change and why, and wait for my OK.
- Make small changes, one idea at a time. ${tooling.run} and show the commands.
${helpers}- Explain each change briefly: what it does and why it's the idiomatic choice.
- When a step is teaching a concept, offer to let me write that part while you give hints instead.
- Don't write code for later steps, and don't add features the step doesn't ask for.
- Link official sources when useful, such as ${tooling.docs}, and the docs the step references.

### Reviewing

- If I ask "is this good?", be honest the way a good friend is: specific, kind, no flattery.
- Prefer the standard library and simple code. Don't introduce patterns the project hasn't needed yet.
`;

export function buildAgentsMd(options: {
  title: string;
  mode: AssistantMode;
  language: ProjectLanguage;
  hasSteps: boolean;
  hasHelpers: boolean;
}): string {
  const intro =
    options.mode === "mentor"
      ? "I'm building this project myself, step by step. These instructions apply to any AI assistant helping in this folder."
      : "I'm building this project step by step with an AI assistant. These instructions apply to any AI assistant helping in this folder.";
  const roleBody = (options.mode === "mentor" ? mentor : pair)(
    options.hasHelpers ? HELPERS : "",
    TOOLING[options.language],
  );
  return `# ${options.title}: assistant instructions

${intro}

${options.hasSteps ? STEPS_SECTION : STANDALONE_SECTION}
${roleBody}
${TONE}`;
}

export const MENTOR_NOTES_TEMPLATE = `# Mentor notes

The assistant's handoff log, so that the next session continues where this one stopped. NOTES.md is my own log; this file is the assistant's view. The assistant offers to update it at the end of a step or a session, and writes only after I agree.

Add one section for each step, headed with the step number and title from NOTES.md and the date. Use these parts:

- **Status**: done or in progress, and what is left.
- **What happened**: anything that differs from the step text, such as my own layout, tools or shortcuts.
- **Did well**
- **Weak spots to revisit**
- **What helped and what didn't**: explanations, analogies and ways of asking that worked or didn't.
- **Advice for the next session**

Record what I understand and how I learn. Leave out personal remarks, and don't quote how I expressed frustration.
`;

export const CLAUDE_MENTOR_SETTINGS =
  JSON.stringify(
    { permissions: { ask: ["Edit", "Write", "NotebookEdit"] } },
    null,
    2,
  ) + "\n";

// Task loads the first of these it finds, so a learner's own taskfile wins
// over a supplied one whatever its spelling. Keyed by lowercase name.
export const TASKFILES = [
  "taskfile.yml",
  "taskfile.yaml",
  "taskfile.dist.yml",
  "taskfile.dist.yaml",
];

function suppliedSection(files: WorkspaceFile[]): string {
  const task = files.some((f) => TASKFILES.includes(f.path.toLowerCase()));
  return `
## Supplied files

Setup helpers from the project. Read them before you run them; Vibe Learn never runs them.

${files.map((f) => `- \`${f.path}\``).join("\n")}
${task ? "\nRun `task --list` to see the supplied tasks.\n" : ""}`;
}

export function workspaceFiles(
  item: Project,
  mode: AssistantMode,
): WorkspaceFile[] {
  const supplied = ProjectSupportFilesSchema.parse(item.supportFiles ?? []);
  const steps = layout(item);
  const md = (step: Step) =>
    rewriteStepLinks(step.stage.markdown, item, steps, step.file);
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
${supplied.length ? suppliedSection(supplied) : ""}
## Working with an AI assistant

AGENTS.md tells coding assistants such as Claude Code, Codex, Gemini CLI, OpenCode and Zed how to help. Tell yours which step you're on, for example "I'm on step 02". Aider needs \`aider --read AGENTS.md\`.

NOTES.md is your own log and step checklist. MENTOR-NOTES.md is where the assistant keeps notes for its next session. It offers to update them at the end of a step, and asks before it writes.
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
    { path: "MENTOR-NOTES.md", contents: MENTOR_NOTES_TEMPLATE },
    {
      path: "AGENTS.md",
      contents: buildAgentsMd({
        title: item.title,
        mode,
        language: item.language || "go",
        hasSteps: true,
        hasHelpers: supplied.length > 0,
      }),
    },
    { path: "CLAUDE.md", contents: "@AGENTS.md\n" },
    { path: "GEMINI.md", contents: "@AGENTS.md\n" },
    ...supplied,
  ];
  // Claude Code cannot allow the two notes files while denying other edits,
  // because a deny rule always wins. So the learner approves each edit.
  if (mode === "mentor")
    files.push({
      path: ".claude/settings.local.json",
      contents: CLAUDE_MENTOR_SETTINGS,
    });
  return files;
}

/**
 * Generates mentor files to attach non-destructively to any existing repository.
 */
export function standaloneMentorFiles(options: {
  title: string;
  mode: AssistantMode;
  language: ProjectLanguage;
}): WorkspaceFile[] {
  const notes = `# Notes

My own log. The assistant reads it but doesn't edit it.

## Goals

- [ ] Define the first concrete milestone

## Currently on

## Stuck on

## Learned
`;
  const files: WorkspaceFile[] = [
    { path: "NOTES.md", contents: notes },
    { path: "MENTOR-NOTES.md", contents: MENTOR_NOTES_TEMPLATE },
    {
      path: "AGENTS.md",
      contents: buildAgentsMd({
        title: options.title,
        mode: options.mode,
        language: options.language,
        hasSteps: false,
        hasHelpers: false,
      }),
    },
    { path: "CLAUDE.md", contents: "@AGENTS.md\n" },
    { path: "GEMINI.md", contents: "@AGENTS.md\n" },
  ];
  if (options.mode === "mentor")
    files.push({
      path: ".claude/settings.local.json",
      contents: CLAUDE_MENTOR_SETTINGS,
    });
  return files;
}

/**
 * Generates a fresh custom project skeleton ready for an AI agent + vibe-learn skill
 * to populate with a running-first, STE100 step-by-step track.
 */
export function blankProjectFiles(options: {
  slug: string;
  title: string;
  mode: AssistantMode;
  language: ProjectLanguage;
  goal?: string;
}): WorkspaceFile[] {
  const goalLine = options.goal
    ? options.goal
    : "Describe the working system you want to build and run on your machine.";
  const readme = `# ${options.title}

${goalLine}

### Glossary

This brief uses each term below with one meaning only.

- **Term**: Replace with project-specific terms before starting Step 02.

## Steps

01. Overview & setup (this file)
02. [Setup and first running skeleton](steps/02-setup-and-skeleton.md)

## Working with an AI assistant

AGENTS.md tells coding assistants such as Claude Code, Codex, Gemini CLI, OpenCode and Zed how to help. Ask your assistant (with the \`vibe-learn\` skill installed) to finish designing this track into running-first STE100 steps, then run \`vibe-learn validate .\`.
`;
  const step02 = `## Step 1 — Setup and first running skeleton

Replace this placeholder with a read-only \`doctor\` check and the smallest runnable skeleton you can execute in under 30 minutes.

### Tests to write

- Verify the skeleton starts and responds with an expected observable output.

<details>
<summary>Hint: start with one file</summary>

Keep the skeleton minimal before adding domain logic.

</details>

### AI mentor prompt

> I am on Step 02. Check my tools and help me get the smallest runnable skeleton working first. Give one hint at a time. Do not edit files.
`;
  const notes = `# Notes

My own log. The assistant reads it but doesn't edit it.

## Steps

- [ ] 01 Overview & setup
- [ ] 02 Setup and first running skeleton

## Currently on

## Stuck on

## Learned
`;
  const files: WorkspaceFile[] = [
    { path: "README.md", contents: readme },
    { path: "steps/02-setup-and-skeleton.md", contents: step02 },
    { path: "NOTES.md", contents: notes },
    { path: "MENTOR-NOTES.md", contents: MENTOR_NOTES_TEMPLATE },
    {
      path: "AGENTS.md",
      contents: buildAgentsMd({
        title: options.title,
        mode: options.mode,
        language: options.language,
        hasSteps: true,
        hasHelpers: false,
      }),
    },
    { path: "CLAUDE.md", contents: "@AGENTS.md\n" },
    { path: "GEMINI.md", contents: "@AGENTS.md\n" },
  ];
  if (options.mode === "mentor")
    files.push({
      path: ".claude/settings.local.json",
      contents: CLAUDE_MENTOR_SETTINGS,
    });
  return files;
}

