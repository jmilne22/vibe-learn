import React, { useState } from "react";
import type { AssistantMode, ProjectLanguage } from "../shared/model";
import { blankProjectFiles } from "../workspace/generator";
import { downloadBlob } from "./api";
import { createZip } from "./zip";

function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "my-project"
  );
}

export function GenerateProject() {
  const [goal, setGoal] = useState(
    "Build a Redis-compatible key-value server (RESP protocol)",
  );
  const [language, setLanguage] = useState<ProjectLanguage>("go");
  const [knownLanguage, setKnownLanguage] = useState("Python");
  const [reference, setReference] = useState("");
  const [budget, setBudget] = useState("Weekend (6–10 hours)");
  const [mode, setMode] = useState<AssistantMode>("mentor");
  const [status, setStatus] = useState("");

  const title = goal.trim() || "Custom project";
  const slug = slugify(title);
  const installCmd = "npx skills add jmilne22/vibe-learn";

  const prompt = [
    `Use the vibe-learn skill to design a learning project in this folder.`,
    "",
    `- Project: ${title}`,
    `- Language: ${language}`,
    knownLanguage.trim()
      ? `- Familiar language (for analogies): ${knownLanguage.trim()}`
      : null,
    reference.trim() ? `- Reference: ${reference.trim()}` : null,
    `- Time budget: ${budget}`,
    `- Mode: ${mode} (${mode === "mentor" ? "hints only, I write all code" : "small reviewed pair edits"})`,
    "",
    "Include:",
    "1. Read ~/.vibe-learn/profile.md if it exists.",
    "2. README.md with a Glossary (one meaning per term) and a short source map.",
    "3. Step 02 with a read-only doctor check and a minimal runnable skeleton.",
    "4. Steps split into small sub-pieces with before/after examples, tests to write, folded <details> hints, and an AI mentor prompt.",
    "5. NOTES.md, MENTOR-NOTES.md, AGENTS.md, CLAUDE.md, and GEMINI.md.",
  ]
    .filter((line): line is string => line !== null)
    .join("\n");

  const copyText = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setStatus(`${label} copied.`);
    } catch {
      setStatus("Clipboard unavailable. Select and copy the text manually.");
    }
  };

  const downloadStarter = () => {
    const files = blankProjectFiles({
      slug,
      title,
      mode,
      language,
      goal: title,
    });
    const zip = createZip(files, slug);
    downloadBlob(new Blob([zip], { type: "application/zip" }), `${slug}.zip`);
    setStatus(`Downloaded ${slug}.zip.`);
  };

  return (
    <>
      <div className="page-head">
        <h1>New project</h1>
      </div>
      <p className="muted" style={{ marginTop: 0, marginBottom: 24 }}>
        Describe what you want to build to get the install command and prompt
        for your coding agent.
      </p>

      <div className="gen-grid">
        <section aria-label="Project inputs">
          <div className="field">
            <label htmlFor="gen-goal">What do you want to build?</label>
            <textarea
              id="gen-goal"
              className="textarea"
              rows={3}
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="e.g. A TCP load balancer with health checks"
            />
          </div>

          <div className="field-row">
            <div className="field">
              <label htmlFor="gen-lang">Language</label>
              <select
                id="gen-lang"
                className="select"
                value={language}
                onChange={(e) =>
                  setLanguage(e.target.value as ProjectLanguage)
                }
              >
                <option value="go">Go</option>
                <option value="python">Python</option>
                <option value="typescript">TypeScript</option>
                <option value="rust">Rust</option>
                <option value="generic">Other</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="gen-known">Language you know well</label>
              <input
                id="gen-known"
                className="input"
                value={knownLanguage}
                onChange={(e) => setKnownLanguage(e.target.value)}
                placeholder="Optional"
              />
            </div>
          </div>

          <div className="field-row">
            <div className="field">
              <label htmlFor="gen-budget">Time budget</label>
              <select
                id="gen-budget"
                className="select"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
              >
                <option value="2–3 hours">2–3 hours</option>
                <option value="Weekend (6–10 hours)">Weekend (6–10 hours)</option>
                <option value="2 days (8–12 hours)">2 days (8–12 hours)</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="gen-ref">Article or repo URL</label>
              <input
                id="gen-ref"
                className="input"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="Optional"
              />
            </div>
          </div>

          <fieldset className="radios">
            <legend>Mode</legend>
            <label>
              <input
                type="radio"
                name="gen-mode"
                checked={mode === "mentor"}
                onChange={() => setMode("mentor")}
              />
              Mentor (hints only)
            </label>
            <label>
              <input
                type="radio"
                name="gen-mode"
                checked={mode === "pair"}
                onChange={() => setMode("pair")}
              />
              Pair (small edits)
            </label>
          </fieldset>
        </section>

        <section className="gen-section" aria-label="Generated setup">
          <h2>1. Install the skill once</h2>
          <pre className="code-box">
            <code>{installCmd}</code>
          </pre>
          <div className="actions">
            <button
              className="btn btn-sm"
              onClick={() => void copyText(installCmd, "Install command")}
            >
              Copy command
            </button>
            <button className="btn btn-sm" onClick={downloadStarter}>
              Download starter .zip
            </button>
          </div>

          <h2>2. Paste into your coding agent</h2>
          <pre className="code-box">
            <code>{prompt}</code>
          </pre>
          <div className="actions">
            <button
              className="btn btn-primary"
              onClick={() => void copyText(prompt, "Prompt")}
            >
              Copy prompt
            </button>
          </div>
          <p className="status" role="status">
            {status}
          </p>
        </section>
      </div>
    </>
  );
}
