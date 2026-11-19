import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  HashRouter,
  Link,
  NavLink,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import {
  clearState,
  createBackup,
  downloadBlob,
  getCatalog,
  loadState,
  mergeBackup,
  saveNote,
  saveProgress,
  toggleBookmark,
} from "./api";
import {
  type AssistantMode,
  type Project,
  type Stage,
  type WebState,
} from "../shared/model";
import { workspaceFiles, workspaceSlug } from "../workspace/generator";
import { createZip } from "./zip";
import { GenerateProject } from "./generate";
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "./app.css";

const INSTALL_CMD = "npx skills add jmilne22/vibe-learn";

const client = new QueryClient({
  defaultOptions: {
    queries: {
      networkMode: "always",
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});

const urlFor = (item: Project, stage?: Stage) =>
  `/read/${encodeURIComponent(item.id)}/${encodeURIComponent(stage?.id || item.stages[0]!.id)}`;

function App() {
  const [notice, setNotice] = useState("");
  const [state, setState] = useState<WebState>(() => loadState());
  const [dark, setDark] = useState(() => {
    try {
      const saved = localStorage.getItem("vibe-appearance");
      if (saved === "dark" || saved === "light") return saved === "dark";
    } catch {
      /* Optional preference. */
    }
    return matchMedia("(prefers-color-scheme: dark)").matches;
  });

  const catalog = useQuery({
    queryKey: ["catalog"],
    queryFn: getCatalog,
    staleTime: Infinity,
  });

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    try {
      localStorage.setItem("vibe-appearance", dark ? "dark" : "light");
    } catch {
      /* Optional preference. */
    }
  }, [dark]);

  return (
    <div className="shell">
      <a
        className="skip"
        href="#main"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById("main")?.focus();
        }}
      >
        Skip to content
      </a>

      <header className="header">
        <div className="header-inner">
          <Link to="/" className="brand">
            vibe-learn
          </Link>
          <nav className="nav" aria-label="Main navigation">
            <NavLink to="/projects">Projects</NavLink>
            <NavLink to="/new">New</NavLink>
            <NavLink to="/data">Data</NavLink>
            <button
              type="button"
              className="nav-btn"
              aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
              title={dark ? "Light mode" : "Dark mode"}
              onClick={() => setDark((d) => !d)}
            >
              {dark ? (
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="12" r="4" />
                  <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
                </svg>
              ) : (
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
              )}
            </button>
          </nav>
        </div>
      </header>

      <main id="main" className="container" tabIndex={-1}>
        {notice && (
          <div role="alert" className="notice">
            <span>{notice}</span>
            <button
              className="btn btn-sm"
              aria-label="Dismiss notification"
              onClick={() => setNotice("")}
            >
              ×
            </button>
          </div>
        )}
        {catalog.error && <p role="alert">{String(catalog.error)}</p>}
        {!catalog.data ? (
          <p className="muted">Loading…</p>
        ) : (
          <Routes>
            <Route
              path="/"
              element={<Home items={catalog.data.items} state={state} />}
            />
            <Route
              path="/projects"
              element={<ProjectList items={catalog.data.items} />}
            />
            <Route path="/new" element={<GenerateProject />} />
            <Route path="/generate" element={<GenerateProject />} />
            <Route
              path="/saved"
              element={<Saved items={catalog.data.items} state={state} />}
            />
            <Route
              path="/bookmarks"
              element={<Saved items={catalog.data.items} state={state} />}
            />
            <Route
              path="/data"
              element={
                <DataPage
                  state={state}
                  setState={setState}
                  setNotice={setNotice}
                />
              }
            />
            <Route
              path="/settings"
              element={
                <DataPage
                  state={state}
                  setState={setState}
                  setNotice={setNotice}
                />
              }
            />
            <Route
              path="/read/:itemId/:stageId"
              element={
                <Reader
                  items={catalog.data.items}
                  state={state}
                  setState={setState}
                />
              }
            />
            <Route
              path="*"
              element={
                <>
                  <h1>Page not found</h1>
                  <Link to="/">Return home</Link>
                </>
              }
            />
          </Routes>
        )}
      </main>

      <footer className="footer">
        <span>vibe-learn</span>
        <a
          href="https://github.com/jmilne22/vibe-learn"
          target="_blank"
          rel="noreferrer"
        >
          GitHub
        </a>
      </footer>
    </div>
  );
}

function Home({ items, state }: { items: Project[]; state: WebState }) {
  const [copied, setCopied] = useState(false);
  const latest = state.progress
    .filter((p) => items.some((i) => i.id === p.itemId))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  const latestItem = latest
    ? items.find((i) => i.id === latest.itemId)
    : undefined;
  const latestStage = latestItem?.stages.find((s) => s.id === latest?.stageId);

  const copyInstall = async () => {
    try {
      await navigator.clipboard.writeText(INSTALL_CMD);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* Clipboard unavailable. */
    }
  };

  return (
    <section className="home">
      <div>
        <h1>Vibe Learn</h1>
        <p className="home-lead">
          Generate step-by-step coding projects and build them with an AI mentor
          in your own editor.
        </p>
        <div className="install-bar">
          <code>{INSTALL_CMD}</code>
          <button className="btn btn-sm" onClick={() => void copyInstall()}>
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
        <div className="actions">
          <Link className="btn btn-primary" to="/new">
            New project
          </Link>
          <Link className="btn" to="/projects">
            Browse {items.length} projects
          </Link>
        </div>
        {latestItem && (
          <Link className="continue-link" to={urlFor(latestItem, latestStage)}>
            Continue:{" "}
            <span>
              {latestItem.title}
              {latestStage ? ` · ${latestStage.title}` : ""} →
            </span>
          </Link>
        )}
      </div>

      <div className="tree-card" aria-label="Workspace layout">
        <div className="tree-root">my-project/</div>
        <div className="tree-row">
          <span>├── README.md</span>
          <span className="tree-desc">overview &amp; glossary</span>
        </div>
        <div className="tree-row">
          <span>├── steps/02-*.md</span>
          <span className="tree-desc">steps, tests, folded hints</span>
        </div>
        <div className="tree-row">
          <span>├── NOTES.md</span>
          <span className="tree-desc">your checklist &amp; log</span>
        </div>
        <div className="tree-row">
          <span>├── MENTOR-NOTES.md</span>
          <span className="tree-desc">AI handoff between sessions</span>
        </div>
        <div className="tree-row">
          <span>└── AGENTS.md</span>
          <span className="tree-desc">mentor rules for your agent</span>
        </div>
      </div>
    </section>
  );
}

function ProjectList({ items }: { items: Project[] }) {
  return (
    <>
      <div className="page-head">
        <h1>Projects ({items.length})</h1>
        <Link to="/new">New project →</Link>
      </div>
      <div className="list">
        {items.map((item) => (
          <Link key={item.id} className="list-row" to={urlFor(item)}>
            <div>
              <h2>{item.title}</h2>
              <p>{item.description}</p>
            </div>
            <span className="list-meta">
              {item.language} · {item.stages.length} steps
            </span>
          </Link>
        ))}
      </div>
    </>
  );
}

function Saved({ items, state }: { items: Project[]; state: WebState }) {
  return (
    <>
      <div className="page-head">
        <h1>Saved</h1>
      </div>
      {!state.bookmarks.length ? (
        <p className="muted">No saved sections yet.</p>
      ) : (
        <div className="list">
          {state.bookmarks.map((b) => {
            const item = items.find((i) => i.id === b.itemId);
            const stage = item?.stages.find((s) => s.id === b.stageId);
            return item && stage ? (
              <Link
                key={item.id + stage.id}
                className="list-row"
                to={urlFor(item, stage)}
              >
                <div>
                  <h2>{item.title}</h2>
                  <p>{stage.title}</p>
                </div>
                <span className="list-meta">Open →</span>
              </Link>
            ) : null;
          })}
        </div>
      )}
    </>
  );
}

function Reader({
  items,
  state,
  setState,
}: {
  items: Project[];
  state: WebState;
  setState: (s: WebState) => void;
}) {
  const { itemId, stageId } = useParams();
  const item = items.find((i) => i.id === itemId);
  const stage = item?.stages.find((s) => s.id === stageId);
  if (!item || !stage)
    return (
      <>
        <h1>Section not found</h1>
        <Link to="/projects">Browse projects</Link>
      </>
    );
  return (
    <Reading
      key={item.id + "/" + stage.id}
      item={item}
      stage={stage}
      items={items}
      state={state}
      setState={setState}
    />
  );
}

function Reading({
  item,
  stage,
  items,
  state,
  setState,
}: {
  item: Project;
  stage: Stage;
  items: Project[];
  state: WebState;
  setState: (s: WebState) => void;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const [openPanel, setOpenPanel] = useState<"none" | "workspace" | "notes">(
    "none",
  );
  const [status, setStatus] = useState("");
  const index = item.stages.findIndex((s) => s.id === stage.id);
  const saved = state.progress.find((p) => p.itemId === item.id);
  const initial = useRef(saved?.stageId === stage.id ? saved.scroll : 0);

  useLayoutEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let ready = false;
    let position = initial.current;
    const measure = () => {
      position = Math.max(
        0,
        Math.min(
          1,
          window.scrollY /
            Math.max(1, document.documentElement.scrollHeight - innerHeight),
        ),
      );
    };
    const persist = () => {
      if (ready) setState(saveProgress(item.id, stage.id, position));
    };
    const onScroll = () => {
      if (!ready) return;
      measure();
      clearTimeout(timer);
      timer = setTimeout(persist, 600);
    };
    const frame = requestAnimationFrame(() => {
      const anchor = new URLSearchParams(location.search).get("anchor");
      const target = anchor ? document.getElementById(anchor) : null;
      if (target) target.scrollIntoView();
      else
        window.scrollTo(
          0,
          initial.current *
            Math.max(0, document.documentElement.scrollHeight - innerHeight),
        );
      ready = true;
      measure();
      persist();
      window.addEventListener("scroll", onScroll);
      window.addEventListener("pagehide", persist);
    });
    return () => {
      persist();
      cancelAnimationFrame(frame);
      clearTimeout(timer);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("pagehide", persist);
    };
  }, [item.id, stage.id, location.search, setState]);

  const copyContext = async (whole: boolean) => {
    const chosen = whole ? item.stages : [stage];
    const related = item.related
      .map((r) => {
        const target = items.find((i) => i.id === r.itemId);
        const section = target?.stages.find((s) => s.id === r.stageId);
        return `${r.label}${section ? "\n" + section.text : ""}`;
      })
      .join("\n\n");
    const text = `# ${item.title}\n\n${item.description}\n\nPrerequisites: ${item.prerequisites.join("; ") || "None"}\n\n${chosen.map((s) => `## ${s.title}\n\n${s.text}`).join("\n\n")}${related ? "\n\nRelated references:\n" + related : ""}\n\nWork with me in small changes. Give one question or action per message. Help me understand and test the implementation.`;
    try {
      await navigator.clipboard.writeText(text);
      setStatus(whole ? "Project context copied." : "Step context copied.");
    } catch {
      setStatus("Clipboard unavailable.");
    }
  };

  const bookmarked = state.bookmarks.some(
    (b) => b.itemId === item.id && b.stageId === stage.id,
  );

  const toggle = (panel: "workspace" | "notes") =>
    setOpenPanel((cur) => (cur === panel ? "none" : panel));

  const stepLinks = item.stages.map((s, n) => (
    <Link
      key={s.id}
      aria-current={s.id === stage.id ? "page" : undefined}
      to={urlFor(item, s)}
    >
      <span>{String(n + 1).padStart(2, "0")}</span>
      {s.title}
    </Link>
  ));

  return (
    <>
      <div className="reader-bar">
        <div className="crumb">
          <Link to="/projects">← Projects</Link>
          <span className="muted">/</span>
          <strong>{item.title}</strong>
        </div>
        <div className="actions">
          <button
            className="btn btn-sm"
            aria-expanded={openPanel === "workspace"}
            aria-pressed={openPanel === "workspace"}
            onClick={() => toggle("workspace")}
          >
            Workspace
          </button>
          <button
            className="btn btn-sm"
            aria-expanded={openPanel === "notes"}
            aria-pressed={openPanel === "notes"}
            onClick={() => toggle("notes")}
          >
            Notes
          </button>
          <button
            className="btn btn-sm"
            onClick={() => void copyContext(false)}
          >
            Copy step
          </button>
          <button
            className="btn btn-sm"
            aria-pressed={bookmarked}
            onClick={() => setState(toggleBookmark(item.id, stage.id))}
          >
            {bookmarked ? "★ Saved" : "☆ Save"}
          </button>
        </div>
      </div>

      {status && (
        <p className="status" role="status">
          {status}
        </p>
      )}

      {openPanel === "workspace" && <InlineWorkspace item={item} />}
      {openPanel === "notes" && (
        <InlineNotes item={item} state={state} setState={setState} />
      )}

      <details className="mobile-steps">
        <summary>
          Steps ({index + 1} / {item.stages.length})
        </summary>
        <div style={{ marginTop: 8 }}>{stepLinks}</div>
      </details>

      <div className="reader-layout">
        <aside className="toc" aria-label="Steps">
          <p className="toc-group">Steps</p>
          {stepLinks}
          {item.related.length > 0 && (
            <>
              <p className="toc-group toc-sep">Related</p>
              {item.related.map((r) => (
                <Link
                  key={r.itemId + (r.stageId || "")}
                  to={`/read/${encodeURIComponent(r.itemId)}/${encodeURIComponent(r.stageId || items.find((i) => i.id === r.itemId)!.stages[0]!.id)}`}
                >
                  {r.label} ↗
                </Link>
              ))}
            </>
          )}
        </aside>

        <div className="article-col">
          {item.prerequisites.length > 0 && index === 0 && (
            <div className="callout">
              <strong>Prerequisites</strong>
              <ul>
                {item.prerequisites.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>
          )}
          {item.id === "project:relay-operator" && (
            <p className="callout">
              Guided project · Run the experiments on your own local cluster.
            </p>
          )}
          <article
            className="prose"
            onClick={(e) => {
              const a = (e.target as HTMLElement).closest("a");
              const href = a?.getAttribute("href");
              if (href?.startsWith("#/")) {
                e.preventDefault();
                navigate(href.slice(1));
              } else if (href && /^https?:/.test(href)) {
                e.preventDefault();
                window.open(href, "_blank", "noopener,noreferrer");
              }
            }}
            dangerouslySetInnerHTML={{ __html: stage.html }}
          />
          <div className="page-nav">
            {index > 0 ? (
              <Link to={urlFor(item, item.stages[index - 1])}>
                ← Previous step
              </Link>
            ) : (
              <span />
            )}
            {index < item.stages.length - 1 ? (
              <Link to={urlFor(item, item.stages[index + 1])}>
                Next step →
              </Link>
            ) : (
              <Link to="/projects">Back to projects →</Link>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function InlineWorkspace({ item }: { item: Project }) {
  const [mode, setMode] = useState<AssistantMode>(() => {
    try {
      return localStorage.getItem("vibe-assistant-mode") === "pair"
        ? "pair"
        : "mentor";
    } catch {
      return "mentor";
    }
  });
  const [msg, setMsg] = useState("");
  const slug = workspaceSlug(item);

  const chooseMode = (next: AssistantMode) => {
    setMode(next);
    try {
      localStorage.setItem("vibe-assistant-mode", next);
    } catch {
      /* Optional preference. */
    }
  };

  const downloadZip = () => {
    const files = workspaceFiles(item, mode);
    const bytes = createZip(files, slug);
    downloadBlob(new Blob([bytes], { type: "application/zip" }), `${slug}.zip`);
    setMsg(`Downloaded ${slug}.zip (${files.length} files).`);
  };

  return (
    <section className="inline-panel" aria-label="Workspace download">
      <p>
        Download a folder with <code>README.md</code>, <code>steps/</code>,{" "}
        <code>NOTES.md</code>, <code>MENTOR-NOTES.md</code>,{" "}
        <code>AGENTS.md</code>, and any supplied helpers.
      </p>
      <div className="field">
        <fieldset className="radios">
          <legend>Assistant mode</legend>
          <label>
            <input
              type="radio"
              name="ws-mode"
              checked={mode === "mentor"}
              onChange={() => chooseMode("mentor")}
            />
            Mentor (hints only)
          </label>
          <label>
            <input
              type="radio"
              name="ws-mode"
              checked={mode === "pair"}
              onChange={() => chooseMode("pair")}
            />
            Pair (small edits)
          </label>
        </fieldset>
      </div>
      <div className="actions">
        <button className="btn btn-primary btn-sm" onClick={downloadZip}>
          Download workspace (.zip)
        </button>
      </div>
      {msg && (
        <p className="status" role="status">
          {msg}
        </p>
      )}
    </section>
  );
}

function InlineNotes({
  item,
  state,
  setState,
}: {
  item: Project;
  state: WebState;
  setState: (s: WebState) => void;
}) {
  const existing = state.notes.find((n) => n.itemId === item.id)?.text || "";
  const [draft, setDraft] = useState(existing);
  const [msg, setMsg] = useState("");

  const exportMarkdown = () => {
    const content = `# ${item.title}\n\n${draft}\n`;
    downloadBlob(
      new Blob([content], { type: "text/markdown;charset=utf-8" }),
      `${item.slug}-notes.md`,
    );
  };

  return (
    <section className="inline-panel" aria-label="Project notes">
      <div className="field">
        <label htmlFor="project-notes">Notes (saved in this browser)</label>
        <textarea
          id="project-notes"
          className="textarea"
          rows={6}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setMsg("Unsaved changes");
          }}
          placeholder="Write a note…"
        />
      </div>
      <div className="actions">
        <button
          className="btn btn-primary btn-sm"
          onClick={() => {
            setState(saveNote(item.id, draft));
            setMsg("Saved.");
          }}
        >
          Save notes
        </button>
        <button className="btn btn-sm" onClick={exportMarkdown}>
          Export Markdown
        </button>
      </div>
      {msg && (
        <p className="status" role="status">
          {msg}
        </p>
      )}
    </section>
  );
}

function DataPage({
  state,
  setState,
  setNotice,
}: {
  state: WebState;
  setState: (s: WebState) => void;
  setNotice: (msg: string) => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);

  const exportBackup = () => {
    const backup = createBackup();
    const date = new Date().toISOString().slice(0, 10);
    downloadBlob(
      new Blob([JSON.stringify(backup, null, 2)], {
        type: "application/json",
      }),
      `vibe-learn-${date}.json`,
    );
  };

  const onImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const { state: next, summary } = mergeBackup(JSON.parse(text));
      setState(next);
      setNotice(summary);
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Could not import backup.",
      );
    } finally {
      e.target.value = "";
    }
  };

  return (
    <>
      <div className="page-head">
        <h1>Data &amp; setup</h1>
        <Link to="/saved">Saved bookmarks ({state.bookmarks.length}) →</Link>
      </div>

      <section className="data-section">
        <h2>Agent skill</h2>
        <p>
          Install the skill from GitHub for Claude Code, Codex, Gemini CLI,
          OpenCode, or Zed:
        </p>
        <pre className="code-box">
          <code>{INSTALL_CMD}</code>
        </pre>
      </section>

      <section className="data-section">
        <h2>Browser data</h2>
        <p>
          {state.progress.length} recent project(s), {state.bookmarks.length}{" "}
          saved bookmark(s), and {state.notes.length} note(s) stored in this
          browser.
        </p>
        <div className="actions">
          <button className="btn btn-primary btn-sm" onClick={exportBackup}>
            Export JSON
          </button>
          <button
            className="btn btn-sm"
            onClick={() => fileInput.current?.click()}
          >
            Import JSON
          </button>
          <button
            className="btn btn-sm"
            onClick={() => {
              setState(clearState());
              setNotice("Cleared local browser data.");
            }}
          >
            Clear data
          </button>
        </div>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => void onImport(e)}
        />
      </section>
    </>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={client}>
      <HashRouter>
        <App />
      </HashRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
