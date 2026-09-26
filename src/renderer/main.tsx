import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
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
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import * as Dialog from "@radix-ui/react-dialog";
import { desktop, getCatalog, getState, invoke } from "./api";
import {
  emptyState,
  type AssistantMode,
  type Item,
  type Stage,
  type Command,
  type AppState,
} from "../shared/model";
import { CourseActivities, Decks, Learning } from "./learning";
import "@fontsource-variable/source-serif-4/opsz.css";
import "@fontsource-variable/source-serif-4/opsz-italic.css";
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import styles from "./style.module.css";
import {
  ContentStatusSchema,
  ContentUpdateResultSchema,
} from "../shared/content-update";
import {
  AppStatusSchema,
  AppUpdateResultSchema,
  type AppStatus,
} from "../shared/app-update";
const client = new QueryClient({
  defaultOptions: {
    queries: {
      networkMode: "always",
      retry: false,
      refetchOnWindowFocus: false,
    },
    mutations: { networkMode: "always", retry: false },
  },
});
const urlFor = (item: Item, stage?: Stage) =>
  `/read/${encodeURIComponent(item.id)}/${encodeURIComponent(stage?.id || item.stages[0]!.id)}`;
function useData() {
  const catalog = useQuery({
    queryKey: ["catalog"],
    queryFn: getCatalog,
    staleTime: Infinity,
  });
  const state = useQuery({ queryKey: ["state"], queryFn: getState });
  return {
    catalog,
    state: state.data || emptyState(),
    stateError: state.error,
  };
}
function App() {
  useEffect(() => {
    try {
      document.documentElement.dataset.theme =
        localStorage.getItem("vibe-appearance") === "dark" ? "dark" : "light";
    } catch {
      /* Appearance storage is optional. */
    }
  }, []);
  const navigate = useNavigate();
  const location = useLocation();
  const landing = !desktop && location.pathname === "/";
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        e.key === "/" &&
        !e.ctrlKey &&
        !e.metaKey &&
        !(e.target as HTMLElement).closest("input,textarea,[contenteditable]")
      ) {
        e.preventDefault();
        navigate("/search");
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [navigate]);
  const query = useQueryClient();
  const [collapsed, setCollapsed] = useState(false);
  const [notice, setNotice] = useState("");
  const { catalog, stateError } = useData();
  useEffect(
    () =>
      window.learning?.onChange(() => {
        void query.invalidateQueries({ queryKey: ["state"] });
      }),
    [query],
  );
  const act = useCallback(
    async (command: Command): Promise<unknown> => {
      try {
        if (command.type === "update-content") setNotice("");
        const result = await invoke(command);
        await query.invalidateQueries({ queryKey: ["state"] });
        if (command.type === "update-content") {
          await query.invalidateQueries({ queryKey: ["catalog"] });
          await query.invalidateQueries({ queryKey: ["content-status"] });
        }
        if (typeof result === "string" && command.type === "import")
          setNotice(result);
        return result;
      } catch (error) {
        setNotice(error instanceof Error ? error.message : String(error));
        return undefined;
      }
    },
    [query],
  );
  const theme = () => {
    const dark = document.documentElement.dataset.theme !== "dark";
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    try {
      localStorage.setItem("vibe-appearance", dark ? "dark" : "light");
    } catch {
      /* Preference storage may be unavailable in previews. */
    }
  };
  useEffect(() => {
    try {
      document.documentElement.dataset.theme =
        localStorage.getItem("vibe-appearance") ||
        (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    } catch {
      /* use default */
    }
  }, []);
  return (
    <div
      className={`${styles.app} ${collapsed ? styles.collapsed : ""} ${landing ? styles.landing : ""}`}
    >
      <a
        className={styles.skip}
        href="#main"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById("main")?.focus();
        }}
      >
        Skip to content
      </a>
      {landing && (
        <header className={styles.siteHeader}>
          <Link to="/" className={styles.siteBrand}>
            Vibe Learn
          </Link>
          <nav aria-label="Website">
            <Link to="/courses">Preview</Link>
            <a
              href="https://github.com/jmilne22/vibe-learn"
              target="_blank"
              rel="noreferrer"
            >
              GitHub
            </a>
          </nav>
        </header>
      )}
      {!landing && (
        <aside className={styles.sidebar} aria-label="Main navigation">
          <Link to="/" className={styles.brand}>
            Vibe Learn
          </Link>
          <nav>
            <NavLink to="/" end>
              <span>Continue</span>
            </NavLink>
            <NavLink to="/courses">
              <span>Courses</span>
            </NavLink>
            <NavLink to="/projects">
              <span>Projects</span>
            </NavLink>
            <NavLink to="/flashcards">
              <span>Flashcards</span>
            </NavLink>
            <NavLink to="/search">
              <span>Search</span>
            </NavLink>
            <NavLink to="/bookmarks">
              <span>Bookmarks</span>
            </NavLink>
          </nav>
          <div className={styles.sidebarFoot}>
            <Link to="/settings">Settings & backups</Link>
            <button onClick={theme}>Switch theme</button>
          </div>
        </aside>
      )}
      <div className={styles.mainWrap}>
        {!landing && (
          <header className={styles.topbar}>
            <button
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-expanded={!collapsed}
              onClick={() => setCollapsed(!collapsed)}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                aria-hidden="true"
              >
                <path d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <span>{desktop ? "Desktop" : "Read-only preview"}</span>
            <Link to="/search">
              Search <kbd>/</kbd>
            </Link>
          </header>
        )}
        {notice && (
          <div role="alert" className={styles.notice}>
            {notice}
            <button
              aria-label="Dismiss notification"
              onClick={() => setNotice("")}
            >
              ×
            </button>
          </div>
        )}
        {(catalog.error || stateError) && (
          <p role="alert">{String(catalog.error || stateError)}</p>
        )}
        <main id="main" className={styles.main} tabIndex={-1}>
          {!catalog.data ? (
            <p>Opening your library…</p>
          ) : (
            <Routes>
              <Route path="/" element={<Home items={catalog.data.items} />} />
              <Route
                path="/courses"
                element={<Library kind="course" items={catalog.data.items} />}
              />
              <Route
                path="/projects"
                element={<Library kind="project" items={catalog.data.items} />}
              />
              <Route
                path="/search"
                element={<Search items={catalog.data.items} />}
              />
              <Route
                path="/bookmarks"
                element={<Bookmarks items={catalog.data.items} />}
              />
              <Route
                path="/flashcards"
                element={<Decks items={catalog.data.items} />}
              />
              <Route
                path="/courses/:itemId/flashcards"
                element={
                  <Learning
                    items={catalog.data.items}
                    act={act}
                    mode="flashcards"
                  />
                }
              />
              <Route
                path="/courses/:itemId/exercises/:exerciseId?"
                element={
                  <Learning
                    items={catalog.data.items}
                    act={act}
                    mode="exercises"
                  />
                }
              />
              <Route path="/settings" element={<Settings act={act} />} />
              <Route
                path="/read/:itemId/:stageId"
                element={<Reader items={catalog.data.items} act={act} />}
              />
              <Route
                path="*"
                element={
                  <>
                    <h1>Page not found</h1>
                    <Link to="/">Return to your library</Link>
                  </>
                }
              />
            </Routes>
          )}
        </main>
        <footer className={styles.footer}>
          <span>Vibe Learn</span>
          <a
            href="https://github.com/jmilne22/vibe-learn"
            target="_blank"
            rel="noreferrer"
          >
            Source on GitHub
          </a>
        </footer>
      </div>
    </div>
  );
}
function Card({
  item,
  stage,
  detail,
}: {
  item: Item;
  stage?: Stage;
  detail?: string;
}) {
  return (
    <Link className={styles.card} to={urlFor(item, stage)}>
      <span className={styles.eyebrow}>
        {item.kind === "course" ? "Course" : "Project"}
      </span>
      <h2>{item.title}</h2>
      <p>{detail || item.description}</p>
      <div className={styles.cardFoot}>
        {stage ? `Resume · ${stage.title}` : `${item.stages.length} sections`}
        <span>→</span>
      </div>
    </Link>
  );
}
function Home({ items }: { items: Item[] }) {
  const { state } = useData();
  const recent = state.progress
    .filter((p) => items.some((i) => i.id === p.itemId))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 6);
  const projects = items.filter((i) => i.kind === "project");
  return (
    <>
      {!desktop ? (
        <section className={styles.hero}>
          <div>
            <p className={styles.eyebrow}>Vibe Learn for desktop</p>
            <h1>
              A desktop app for
              <br />
              your learning material.
            </h1>
            <p>
              Bring your courses and project briefs. Read, practise, and keep
              notes in one app, with code in your own editor.
            </p>
            <div className={styles.actions}>
              <a
                className={styles.primary}
                href="https://github.com/jmilne22/vibe-learn/releases/latest"
                target="_blank"
                rel="noreferrer"
              >
                Download the app
              </a>
              <Link className={styles.secondary} to="/courses">
                Preview the app
              </Link>
            </div>
            <p className={styles.downloadNote}>
              Windows, macOS and Linux · No account required
            </p>
          </div>
          <dl className={styles.featureList}>
            <div>
              <dt>Exercises</dt>
              <dd>
                Open the starter files, make a change, and run the tests. Hints
                and solutions are there when you need them.
              </dd>
            </div>
            <div>
              <dt>Flashcards</dt>
              <dd>
                Browse the cards in a course or review them with spaced
                repetition.
              </dd>
            </div>
            <div>
              <dt>Local workspaces</dt>
              <dd>
                Use your usual editor and tools. Your code stays in ordinary
                folders.
              </dd>
            </div>
          </dl>
        </section>
      ) : (
        <div className={styles.homeHeading}>
          <h1>Continue</h1>
          <p className={styles.intro}>
            {recent.length
              ? "Your recent courses and projects."
              : "Nothing started yet. Choose a course or project to begin."}
          </p>
          <div className={styles.actions}>
            <Link className={styles.secondary} to="/courses">
              Browse courses
            </Link>
            <Link className={styles.secondary} to="/projects">
              Browse projects
            </Link>
          </div>
        </div>
      )}
      {desktop && !!recent.length && (
        <div className={styles.grid}>
          {recent.map((p) => {
            const item = items.find((i) => i.id === p.itemId)!;
            return (
              <Card
                key={item.id}
                item={item}
                stage={item.stages.find((s) => s.id === p.stageId)}
              />
            );
          })}
        </div>
      )}
      {!desktop && (
        <section
          className={styles.platformInfo}
          aria-label="About the platform"
        >
          <div>
            <h2>Use your own content</h2>
            <p>
              Write courses in Markdown and YAML. Add exercises, hints, and
              flashcards where they’re useful. Keep project briefs alongside
              your courses.
            </p>
          </div>
          <div>
            <h2>Saved locally</h2>
            <p>
              Read offline and keep your notes, bookmarks, reading positions,
              and flashcard reviews on your computer. Export notes as Markdown
              or save a backup.
            </p>
          </div>
        </section>
      )}
      {desktop && !recent.length && (
        <section className={styles.projectSection}>
          <div className={styles.sectionHeading}>
            <h2>Project library</h2>
            <span>{projects.length} projects</span>
          </div>
          <div className={styles.projectList}>
            {projects.map((item, n) => (
              <Link key={item.id} to={urlFor(item)}>
                <span className={styles.projectNumber}>
                  {String(n + 1).padStart(2, "0")}
                </span>
                <div>
                  <h3>{item.title}</h3>
                  <p>{item.description}</p>
                </div>
                <span className={styles.projectMeta}>
                  {item.stages.length} sections{" "}
                  <span aria-hidden="true">→</span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
function Library({ kind, items }: { kind: Item["kind"]; items: Item[] }) {
  const filtered = items.filter((i) => i.kind === kind);
  return (
    <>
      <h1>
        {kind === "course" ? "Courses" : "Projects"}
        <span className={styles.count}>{filtered.length}</span>
      </h1>
      <p className={styles.intro}>
        {kind === "course"
          ? filtered.length
            ? "Lessons, exercises, and flashcards."
            : "No courses yet. They’re being rebuilt for the new app."
          : "Project briefs, requirements, and checks. Each project can be started separately."}
      </p>
      {!filtered.length && kind === "course" && (
        <Link className={styles.secondary} to="/projects">
          Browse projects
        </Link>
      )}
      <div className={styles.grid}>
        {filtered.map((i) => (
          <Card key={i.id} item={i} />
        ))}
      </div>
    </>
  );
}
function Search({ items }: { items: Item[] }) {
  const [term, setTerm] = useState("");
  const tokens = term.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const matches = tokens.length
    ? items
        .flatMap((item) =>
          item.stages
            .filter((s) =>
              tokens.every((t) =>
                `${item.title} ${s.title} ${s.text}`.toLowerCase().includes(t),
              ),
            )
            .map((stage) => ({ item, stage })),
        )
        .slice(0, 60)
    : [];
  return (
    <>
      <h1>Search the library</h1>
      <label htmlFor="search">Search lessons and project briefs</label>
      <input
        id="search"
        className={styles.search}
        autoFocus
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        placeholder="e.g. channels, shutdown, Kubernetes"
      />
      <p aria-live="polite">
        {tokens.length
          ? `${matches.length}${matches.length === 60 ? "+" : ""} matching sections`
          : "Search lesson text and project requirements."}
      </p>
      <div className={styles.results}>
        {matches.map(({ item, stage }) => (
          <Link key={item.id + stage.id} to={urlFor(item, stage)}>
            <small>
              {item.title} · {item.kind}
            </small>
            <h2>
              {stage.title} <span>→</span>
            </h2>
            <p>{snippet(stage.text, tokens[0] || "")}</p>
          </Link>
        ))}
      </div>
    </>
  );
}
function snippet(text: string, term: string): string {
  const n = Math.max(0, text.toLowerCase().indexOf(term) - 70);
  return (n ? "…" : "") + text.slice(n, n + 230) + "…";
}
function Bookmarks({ items }: { items: Item[] }) {
  const { state } = useData();
  return (
    <>
      <h1>Bookmarks</h1>
      {!state.bookmarks.length && (
        <p>Save a section while reading to find it here.</p>
      )}
      <div className={styles.grid}>
        {state.bookmarks.map((b) => {
          const item = items.find((i) => i.id === b.itemId);
          const stage = item?.stages.find((s) => s.id === b.stageId);
          return item && stage ? (
            <Card
              key={item.id + stage.id}
              item={item}
              stage={stage}
              detail={stage.title}
            />
          ) : null;
        })}
      </div>
    </>
  );
}
type Action = (command: Command) => Promise<unknown>;
function Panel({
  title,
  trigger,
  children,
}: {
  title: string;
  trigger: string;
  children: React.ReactNode;
}) {
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <button>{trigger}</button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content className={styles.panel}>
          <div className={styles.panelHead}>
            <Dialog.Title>{title}</Dialog.Title>
            <Dialog.Close asChild>
              <button aria-label="Close panel">×</button>
            </Dialog.Close>
          </div>
          <Dialog.Description className={styles.muted}>
            Saved on this computer.
          </Dialog.Description>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
function Reader({ items, act }: { items: Item[]; act: Action }) {
  const { itemId, stageId } = useParams();
  const item = items.find((i) => i.id === itemId);
  const stage = item?.stages.find((s) => s.id === stageId);
  if (!item || !stage)
    return (
      <>
        <h1>Section not found</h1>
        <Link to="/courses">Browse courses</Link>
      </>
    );
  return (
    <Reading
      key={item.id + "/" + stage.id}
      item={item}
      stage={stage}
      items={items}
      act={act}
    />
  );
}
function Reading({
  item,
  stage,
  items,
  act,
}: {
  item: Item;
  stage: Stage;
  items: Item[];
  act: Action;
}) {
  const { state } = useData();
  const location = useLocation();
  const navigate = useNavigate();
  const [copied, setCopied] = useState("");
  const article = useRef<HTMLElement>(null);
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
      if (desktop && ready)
        void invoke({
          type: "progress",
          itemId: item.id,
          stageId: stage.id,
          scroll: position,
        });
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
  }, [item.id, stage.id, location.search]);
  const copy = async (whole: boolean, output?: string) => {
    const chosen = whole ? item.stages : [stage];
    const related = item.related
      .map((r) => {
        const target = items.find((i) => i.id === r.itemId);
        const section = target?.stages.find((s) => s.id === r.stageId);
        return `${r.label}${section ? "\n" + section.text : ""}`;
      })
      .join("\n\n");
    const text = `# ${item.title}\n\n${item.description}\n\nPrerequisites: ${item.prerequisites.join("; ") || "None"}\nWorkspace: ${state.workspaces.find((w) => w.itemId === item.id)?.path || "Not attached"}\n\n${chosen.map((s) => `## ${s.title}\n\n${s.text}`).join("\n\n")}\n\nRelated references:\n${related}${output ? "\n\nSelected run output:\n" + output : ""}\n\nWork with me in small changes. Help me understand and test the implementation. Do not treat passing a supplied check as proof of all requirements.`;
    try {
      if (desktop) await invoke({ type: "copy", text });
      else await navigator.clipboard.writeText(text);
      setCopied("Context copied. Paste it into your preferred coding tool.");
    } catch {
      setCopied(
        "Clipboard unavailable. Select and copy the text from the lesson.",
      );
    }
  };
  const bookmarked = state.bookmarks.some(
    (b) => b.itemId === item.id && b.stageId === stage.id,
  );
  return (
    <>
      <div className={styles.readerHeading}>
        <Link to={item.kind === "course" ? "/courses" : "/projects"}>
          ← {item.kind === "course" ? "Courses" : "Projects"}
        </Link>
        <p className={styles.eyebrow}>{item.title}</p>
        {item.kind === "course" && <CourseActivities course={item} />}
        <div className={styles.readerTools}>
          {desktop && (
            <>
              <button
                aria-pressed={bookmarked}
                onClick={() =>
                  void act({
                    type: "bookmark",
                    itemId: item.id,
                    stageId: stage.id,
                  })
                }
              >
                {bookmarked ? "★ Saved" : "☆ Bookmark"}
              </button>
              <Panel title={`Notes · ${item.title}`} trigger="Notes">
                <Notes item={item} state={state} act={act} />
              </Panel>
              {item.kind === "project" && (
                <Panel title="Workspace & checks" trigger="Workspace">
                  <WorkspacePanel
                    item={item}
                    state={state}
                    act={act}
                    stageId={stage.id}
                    copyOutput={(output) => void copy(false, output)}
                  />
                </Panel>
              )}
            </>
          )}
          <button onClick={() => void copy(false)}>Copy stage context</button>
          <button onClick={() => void copy(true)}>
            Copy {item.kind} context
          </button>
        </div>
        <p role="status">{copied}</p>
      </div>
      <div className={styles.reader}>
        <aside className={styles.contents} aria-label="Sections">
          <p className={styles.navLabel}>IN THIS {item.kind.toUpperCase()}</p>
          {item.stages.map((s, n) => (
            <Link
              key={s.id}
              aria-current={s.id === stage.id ? "page" : undefined}
              to={urlFor(item, s)}
            >
              <span>{String(n + 1).padStart(2, "0")}</span>
              {s.title}
            </Link>
          ))}
          {item.related.length > 0 && (
            <>
              <p className={styles.navLabel}>EXPLORE ALONGSIDE</p>
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
        <div className={styles.readingBody}>
          {item.prerequisites.length > 0 && index === 0 && (
            <div className={styles.prerequisites}>
              <strong>Before you begin</strong>
              <ul>
                {item.prerequisites.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>
          )}
          {item.id === "project:relay-operator" && (
            <p className={styles.guided}>
              Guided project · Run the experiments in your environment. There is
              no automated grading or required evidence upload.
            </p>
          )}
          <article
            ref={article}
            className={styles.prose}
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
          <div className={styles.pageNav}>
            {index > 0 ? (
              <Link to={urlFor(item, item.stages[index - 1])}>
                ← Previous section
              </Link>
            ) : (
              <span />
            )}
            {index < item.stages.length - 1 ? (
              <Link to={urlFor(item, item.stages[index + 1])}>
                Next section →
              </Link>
            ) : (
              <Link to={item.kind === "course" ? "/courses" : "/projects"}>
                Back to the library →
              </Link>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
const noteDrafts = new Map<string, string>();
function Notes({
  item,
  state,
  act,
}: {
  item: Item;
  state: AppState;
  act: Action;
}) {
  const existing = state.notes.find((n) => n.itemId === item.id)?.text || "";
  const [draft, setDraft] = useState(noteDrafts.get(item.id) ?? existing);
  const [status, setStatus] = useState("");
  return (
    <>
      <label htmlFor="notes">Notes</label>
      <textarea
        id="notes"
        className={styles.notes}
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          noteDrafts.set(item.id, e.target.value);
          setStatus("Unsaved changes");
        }}
        placeholder="Write a note…"
      />
      <div className={styles.actions}>
        <button
          className={styles.primary}
          onClick={async () => {
            const result = await act({
              type: "note",
              itemId: item.id,
              text: draft,
            });
            if (result !== undefined) noteDrafts.delete(item.id);
            setStatus(
              result === undefined
                ? "Could not save. Your draft is still here."
                : "Saved locally",
            );
          }}
        >
          Save notes
        </button>
        <button
          onClick={() => void act({ type: "export-notes", itemId: item.id })}
        >
          Export as Markdown
        </button>
      </div>
      <p role="status">{status}</p>
    </>
  );
}
function WorkspacePanel({
  item,
  state,
  act,
  stageId,
  copyOutput,
}: {
  item: Item;
  state: AppState;
  act: Action;
  stageId: string;
  copyOutput: (output: string) => void;
}) {
  const workspace = state.workspaces.find((w) => w.itemId === item.id);
  const [target, setTarget] = useState(workspace?.buildTarget || ".");
  const [maelstrom, setMaelstrom] = useState(workspace?.maelstromPath || "");
  const [mode, setMode] = useState<AssistantMode>(() => {
    try {
      return localStorage.getItem("vibe-assistant-mode") === "pair"
        ? "pair"
        : "mentor";
    } catch {
      return "mentor";
    }
  });
  const [added, setAdded] = useState("");
  const runs = state.runs.filter((r) => r.itemId === item.id).reverse();
  const active = state.runs.some((r) => r.status === "running");
  const workspaceAction = (
    action: "attach" | "create" | "open" | "assistant-files",
  ) => act({ type: "workspace", itemId: item.id, action, mode });
  const chooseMode = (next: AssistantMode) => {
    setMode(next);
    try {
      localStorage.setItem("vibe-assistant-mode", next);
    } catch {
      /* Preference storage may be unavailable in previews. */
    }
  };
  return (
    <>
      <h3>Local workspace</h3>
      <p>
        {workspace
          ? workspace.path
          : "Attach a project folder, or create a new workspace with the brief as step files for an AI assistant."}
      </p>
      <fieldset className={styles.modes}>
        <legend>AI assistant</legend>
        <label>
          <input
            type="radio"
            name="assistant-mode"
            checked={mode === "mentor"}
            onChange={() => chooseMode("mentor")}
          />
          Mentor: hints only, I write the code
        </label>
        <label>
          <input
            type="radio"
            name="assistant-mode"
            checked={mode === "pair"}
            onChange={() => chooseMode("pair")}
          />
          Pair: the assistant can edit
        </label>
      </fieldset>
      <div className={styles.actions}>
        <button onClick={() => void workspaceAction("attach")}>
          Attach folder
        </button>
        <button onClick={() => void workspaceAction("create")}>
          Create workspace
        </button>
        {workspace && (
          <button onClick={() => void workspaceAction("open")}>
            Open folder
          </button>
        )}
        {workspace && (
          <button
            onClick={async () => {
              const result = (await workspaceAction("assistant-files")) as
                { written: string[]; skipped: string[] } | undefined;
              if (!result) return setAdded("");
              const count = result.written.length;
              setAdded(
                `${count ? `Added ${count} file${count === 1 ? "" : "s"}.` : "All assistant files were already there."}${result.skipped.length ? ` Kept your existing ${result.skipped.join(", ")}.` : ""}`,
              );
            }}
          >
            Add AI assistant files
          </button>
        )}
      </div>
      {added && <p role="status">{added}</p>}
      {workspace && item.checks.length > 0 && (
        <details>
          <summary>Execution settings</summary>
          <label htmlFor="target">Go executable build target</label>
          <input
            id="target"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder="./cmd/relay"
          />
          {item.checks.some((c) => c.kind === "maelstrom") && (
            <>
              <label htmlFor="maelstrom">Maelstrom launcher path</label>
              <input
                id="maelstrom"
                value={maelstrom}
                onChange={(e) => setMaelstrom(e.target.value)}
                placeholder="/path/to/maelstrom/maelstrom"
              />
            </>
          )}
          <button
            onClick={() =>
              void act({
                type: "configure",
                itemId: item.id,
                buildTarget: target,
                maelstromPath: maelstrom,
              })
            }
          >
            Save execution settings
          </button>
        </details>
      )}
      <h3>{item.checks.length ? "Optional checks" : "Guided verification"}</h3>
      <p>
        {item.checks.length
          ? "Checks run only when you choose. Source is never overwritten. Acceptance checks use temporary data."
          : "Use the examples and expected observations in the guide. No platform-owned suite is required."}
      </p>
      {item.checks.map((check) => (
        <div className={styles.check} key={check.id}>
          <small>
            {check.kind === "learner"
              ? "Your tests"
              : check.kind === "maelstrom"
                ? "Existing harness"
                : "Provided check"}
            {check.stageId === stageId ? " · This stage" : ""}
          </small>
          <h4>{check.title}</h4>
          <p>{check.description}</p>
          <button
            disabled={!workspace || active}
            onClick={() =>
              void act({ type: "run", itemId: item.id, checkId: check.id })
            }
          >
            Run {check.title.toLowerCase()}
          </button>
        </div>
      ))}
      <h3>Run history</h3>
      {!runs.length && <p>No checks run yet.</p>}
      {runs.map((run) => (
        <details
          key={run.id}
          className={styles.run}
          open={run.status === "running"}
        >
          <summary>
            {run.title} · {run.status}
          </summary>
          <small>
            {new Date(run.startedAt).toLocaleString()} · {run.suiteVersion}
            <br />
            Source: {run.sourceHash.slice(0, 16)} · Content:{" "}
            {run.contentVersion}
          </small>
          {run.sourceChanged && (
            <p className={styles.notice}>
              Source changed during this run. Rerun before relying on it.
            </p>
          )}
          <p>
            Result applies to the recorded source revision, not subsequent
            edits.
          </p>
          <pre className={styles.log}>{run.output || "Preparing…"}</pre>
          {run.status === "running" && (
            <button onClick={() => void act({ type: "cancel", runId: run.id })}>
              Cancel run
            </button>
          )}
          <button onClick={() => copyOutput(run.output)}>
            Copy context with this output
          </button>
          {run.artifactDir && (
            <button
              onClick={() => void act({ type: "artifacts", runId: run.id })}
            >
              Open saved artifacts
            </button>
          )}
          <strong>Not established by this run</strong>
          <ul>
            {run.unchecked.map((u, n) => (
              <li key={n}>{u}</li>
            ))}
          </ul>
        </details>
      ))}
    </>
  );
}
function Settings({ act }: { act: Action }) {
  const [updating, setUpdating] = useState(false);
  const [updateMessage, setUpdateMessage] = useState("");
  const content = useQuery({
    queryKey: ["content-status"],
    queryFn: async () =>
      ContentStatusSchema.parse(await invoke({ type: "content-status" })),
    enabled: desktop,
  });
  return (
    <>
      <h1>Settings & backups</h1>
      {desktop && (
        <div className={styles.settings}>
          <h2>Content</h2>
          <p>Download the latest courses and projects for offline use.</p>
          <button
            disabled={updating}
            onClick={async () => {
              setUpdating(true);
              setUpdateMessage("");
              try {
                const raw = await act({ type: "update-content" });
                if (raw !== undefined) {
                  const result = ContentUpdateResultSchema.parse(raw);
                  setUpdateMessage(
                    result.updated
                      ? "Content updated."
                      : "Content is up to date.",
                  );
                }
              } finally {
                setUpdating(false);
              }
            }}
          >
            {updating ? "Updating…" : "Update content"}
          </button>
          <p role="status">{updateMessage}</p>
          {content.data?.warning && <p role="alert">{content.data.warning}</p>}
          {content.data && (
            <small>
              {content.data.source === "bundled"
                ? "Included with the app"
                : "Downloaded content"}
              {content.data.publishedAt &&
                ` · ${new Date(content.data.publishedAt).toLocaleDateString()}`}
            </small>
          )}
        </div>
      )}
      {desktop && <AppUpdates act={act} />}
      <div className={styles.settings}>
        <h2>Backup</h2>
        <p>
          Export reading positions, bookmarks, notes, flashcard reviews,
          workspace references, and run summaries. Source files and full run
          artifacts stay in their folders.
        </p>
        <div className={styles.actions}>
          <button
            disabled={!desktop}
            className={styles.primary}
            onClick={() => void act({ type: "backup" })}
          >
            Export backup
          </button>
          <button
            disabled={!desktop}
            onClick={() => void act({ type: "import" })}
          >
            Import backup
          </button>
        </div>
        <p>
          Imports merge with your saved data. Back up source files and run
          artifacts separately.
        </p>
        {!desktop && (
          <p>Notes and workspace actions are available in the desktop app.</p>
        )}
      </div>
    </>
  );
}
function AppUpdates({ act }: { act: Action }) {
  const queryClient = useQueryClient();
  const [updating, setUpdating] = useState(false);
  const [message, setMessage] = useState("");
  const status = useQuery({
    queryKey: ["app-status"],
    queryFn: async () =>
      AppStatusSchema.parse(await invoke({ type: "app-status" })),
  });
  const app: AppStatus | undefined = status.data;
  return (
    <div className={styles.settings}>
      <h2>App</h2>
      <p>
        Download the latest app changes without reinstalling. They apply when
        you restart.
      </p>
      <div className={styles.actions}>
        <button
          disabled={updating || !app || app.source === "development"}
          onClick={async () => {
            setUpdating(true);
            setMessage("");
            try {
              const raw = await act({ type: "update-app" });
              if (raw === undefined) return;
              const result = AppUpdateResultSchema.parse(raw);
              queryClient.setQueryData(["app-status"], result.status);
              setMessage(
                result.result === "updated"
                  ? "App update downloaded. Restart to use it."
                  : result.result === "installer"
                    ? "This update changes built-in components. Download the latest installer below."
                    : "The app is up to date.",
              );
            } finally {
              setUpdating(false);
            }
          }}
        >
          {updating ? "Updating…" : "Update app"}
        </button>
        {app?.pending && (
          <button
            className={styles.primary}
            onClick={() => void act({ type: "restart-app" })}
          >
            Restart now
          </button>
        )}
      </div>
      <p role="status">{message}</p>
      {app?.warning && <p role="alert">{app.warning}</p>}
      {app && (
        <small>
          {app.source === "development"
            ? "Development build. Pull the latest code with git."
            : `Version ${app.version}${app.source === "downloaded" ? " · updated" : " · installed"}`}
          {app.publishedAt &&
            ` · ${new Date(app.publishedAt).toLocaleDateString()}`}
          {app.commit && ` · ${app.commit.slice(0, 7)}`}
        </small>
      )}
      <p>
        <a
          href="https://github.com/jmilne22/vibe-learn/releases/latest"
          target="_blank"
          rel="noreferrer"
        >
          Download app updates
        </a>
      </p>
    </div>
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
