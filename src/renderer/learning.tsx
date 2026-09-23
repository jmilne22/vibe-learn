import React, { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  type Item,
  type Command,
  type Exercise,
  emptyState,
} from "../shared/model";
import { desktop, getState } from "./api";
import styles from "./style.module.css";
import css from "./learning.module.css";
type Course = Extract<Item, { kind: "course" }>;
type Act = (command: Command) => Promise<unknown>;
const base = (course: Course) => `/courses/${encodeURIComponent(course.id)}`;
export function CourseActivities({ course }: { course: Course }) {
  return (
    <div className={css.actions}>
      {!!course.exercises.length && (
        <Link to={`${base(course)}/exercises`}>
          Exercises ({course.exercises.length}) →
        </Link>
      )}
      {!!course.flashcards.length && (
        <Link to={`${base(course)}/flashcards`}>
          Flashcards ({course.flashcards.length}) →
        </Link>
      )}
    </div>
  );
}
export function Decks({ items }: { items: Item[] }) {
  const courses = items.filter(
    (i): i is Course => i.kind === "course" && !!i.flashcards.length,
  );
  return (
    <>
      <h1>Flashcards</h1>
      <p className={styles.intro}>
        Choose a course to browse or review its cards.
      </p>
      {!courses.length && (
        <p>No decks yet. Cards will appear here when courses include them.</p>
      )}
      <div className={styles.grid}>
        {courses.map((course) => (
          <Link
            className={styles.card}
            key={course.id}
            to={`${base(course)}/flashcards`}
          >
            <h2>{course.title}</h2>
            <p>{course.flashcards.length} cards · Browse or review</p>
          </Link>
        ))}
      </div>
    </>
  );
}
export function Learning({
  items,
  act,
  mode,
}: {
  items: Item[];
  act: Act;
  mode: "exercises" | "flashcards";
}) {
  const { itemId, exerciseId } = useParams();
  const course = items.find(
    (i): i is Course => i.kind === "course" && i.id === itemId,
  );
  if (!course)
    return (
      <p>
        Course not found. <Link to="/courses">Browse courses</Link>
      </p>
    );
  return (
    <>
      <Link
        to={`/read/${encodeURIComponent(course.id)}/${encodeURIComponent(course.stages[0]!.id)}`}
      >
        ← {course.title}
      </Link>
      {mode === "flashcards" ? (
        <Flashcards key={course.id} course={course} act={act} />
      ) : (
        <Exercises
          key={course.id}
          course={course}
          act={act}
          exerciseId={exerciseId}
        />
      )}
    </>
  );
}
function Html({ html }: { html: string }) {
  return (
    <div className={styles.prose} dangerouslySetInnerHTML={{ __html: html }} />
  );
}
function Flashcards({ course, act }: { course: Course; act: Act }) {
  const state =
    useQuery({ queryKey: ["state"], queryFn: getState }).data || emptyState();
  const [index, setIndex] = useState(0),
    [revealed, setRevealed] = useState(false),
    [busy, setBusy] = useState(false);
  const [queue, setQueue] = useState<
    { id: string; expected: string | null }[] | null
  >(null);
  const [error, setError] = useState("");
  const saved = (id: string) =>
    state.reviews.find((r) => r.itemId === course.id && r.cardId === id);
  const due = course.flashcards.filter((c) => {
    const r = saved(c.id);
    return (
      !r ||
      r.cardVersion !== c.version ||
      Date.parse(r.memory.due) <= Date.now()
    );
  });
  const card = queue
    ? course.flashcards.find((c) => c.id === queue[index]?.id)
    : course.flashcards[index];
  const total = queue ? queue.length : course.flashcards.length;
  const move = (n: number) => {
    setIndex(n);
    setRevealed(false);
    setError("");
  };
  async function rate(grade: 1 | 2 | 3 | 4) {
    if (!card || !queue || busy) return;
    setBusy(true);
    const result = await act({
      type: "review",
      itemId: course.id,
      cardId: card.id,
      cardVersion: card.version,
      expectedUpdatedAt: queue[index]!.expected,
      grade,
    });
    setBusy(false);
    if (result !== undefined) move(index + 1);
    else
      setError(
        "Review was not saved. See the notification above; browse cards and start review again to refresh.",
      );
  }
  return (
    <div className={css.activity}>
      <h1>Flashcards</h1>
      <p>
        Browse all cards, or review the ones due. Your answers set the next
        review date.
      </p>
      <div className={css.actions}>
        <button
          disabled={busy}
          aria-pressed={!queue}
          onClick={() => {
            setQueue(null);
            move(0);
          }}
        >
          Browse cards
        </button>
        <button
          disabled={!desktop || busy || !due.length}
          onClick={() => {
            setQueue(
              due.map((c) => ({
                id: c.id,
                expected: saved(c.id)?.updatedAt ?? null,
              })),
            );
            move(0);
          }}
        >
          Review available cards ({due.length})
        </button>
      </div>
      {!desktop && (
        <p className={css.muted}>
          The desktop app saves spaced reviews. You can browse all cards here.
        </p>
      )}
      {!total ? (
        <p>No cards available.</p>
      ) : !card ? (
        <div role="status">
          <h2>Review complete</h2>
          <p>
            You’ve reviewed the available cards. You can still browse the full
            deck.
          </p>
        </div>
      ) : (
        <>
          <p className={css.muted}>
            {queue ? "Review" : "Browse"} · {index + 1} of {total}
          </p>
          <section className={css.flashcard} aria-label="Flashcard">
            <span className={styles.eyebrow}>Question</span>
            <Html html={card.frontHtml} />
            {revealed && (
              <div className={css.answer}>
                <span className={styles.eyebrow}>Answer</span>
                <Html html={card.backHtml} />
              </div>
            )}
          </section>
          <div className={css.actions}>
            <button
              aria-expanded={revealed}
              disabled={busy}
              onClick={() => setRevealed(!revealed)}
            >
              {revealed ? "Hide answer" : "Reveal answer"}
            </button>
            {!queue && (
              <>
                <button disabled={index === 0} onClick={() => move(index - 1)}>
                  Previous card
                </button>
                <button
                  disabled={index === total - 1}
                  onClick={() => move(index + 1)}
                >
                  Next card
                </button>
              </>
            )}
          </div>
          {queue && revealed && (
            <div className={css.actions} aria-label="Rate recall">
              {(["Again", "Hard", "Good", "Easy"] as const).map((label, n) => (
                <button
                  disabled={busy}
                  key={label}
                  onClick={() => void rate((n + 1) as 1 | 2 | 3 | 4)}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          {error && <p role="alert">{error}</p>}
          {card.stageId && (
            <Link
              to={`/read/${encodeURIComponent(course.id)}/${encodeURIComponent(card.stageId)}`}
            >
              Revisit the lesson →
            </Link>
          )}
        </>
      )}
    </div>
  );
}
function Exercises({
  course,
  act,
  exerciseId,
}: {
  course: Course;
  act: Act;
  exerciseId?: string;
}) {
  const selected = exerciseId
    ? course.exercises.find((e) => e.id === exerciseId)
    : course.exercises[0];
  return (
    <>
      <h1>Exercises</h1>
      <p className={styles.intro}>
        Open an exercise in your editor, then run its checks. You can start with
        any exercise.
      </p>
      {!course.exercises.length ? (
        <p>No exercises in this course yet.</p>
      ) : (
        <div className={css.layout}>
          <nav className={css.exerciseNav} aria-label="Exercises">
            {course.exercises.map((exercise, n) => (
              <Link
                key={exercise.id}
                aria-current={selected?.id === exercise.id ? "page" : undefined}
                to={`${base(course)}/exercises/${encodeURIComponent(exercise.id)}`}
              >
                <span>{String(n + 1).padStart(2, "0")}</span>
                {exercise.title}
              </Link>
            ))}
          </nav>
          {selected ? (
            <ExerciseView
              key={selected.id}
              course={course}
              exercise={selected}
              act={act}
            />
          ) : (
            <p>Exercise not found. Choose one from the list.</p>
          )}
        </div>
      )}
    </>
  );
}
function ExerciseView({
  course,
  exercise,
  act,
}: {
  course: Course;
  exercise: Exercise;
  act: Act;
}) {
  const state =
    useQuery({ queryKey: ["state"], queryFn: getState }).data || emptyState();
  const [busy, setBusy] = useState(false);
  const workspace = state.exerciseWorkspaces.find(
    (w) => w.itemId === course.id && w.exerciseId === exercise.id,
  );
  const runs = state.runs
    .filter(
      (r) => r.itemId === course.id && r.checkId === `exercise:${exercise.id}`,
    )
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  const latest = runs[0],
    running = state.runs.some((r) => r.status === "running");
  const action = async (
    action: "prepare" | "attach" | "open" | "fresh" | "run",
  ) => {
    setBusy(true);
    try {
      await act({
        type: "exercise",
        itemId: course.id,
        exerciseId: exercise.id,
        action,
      });
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className={css.exercise}>
      <p className={styles.eyebrow}>
        {exercise.language === "go"
          ? "Go · Included"
          : "Rust · Requires installation"}
      </p>
      <h2>{exercise.title}</h2>
      <Html html={exercise.instructionsHtml} />
      {exercise.stageId && (
        <Link
          to={`/read/${encodeURIComponent(course.id)}/${encodeURIComponent(exercise.stageId)}`}
        >
          Revisit the lesson →
        </Link>
      )}
      {exercise.hintsHtml.map((hint, n) => (
        <details key={n}>
          <summary>Hint {n + 1}</summary>
          <Html html={hint} />
        </details>
      ))}
      {exercise.solutionHtml && (
        <details>
          <summary>Worked solution</summary>
          <Html html={exercise.solutionHtml} />
        </details>
      )}
      <details>
        <summary>Starter files & provided checks</summary>
        {[...exercise.files, ...exercise.checkFiles].map((file) => (
          <div key={file.path}>
            <h3>
              {file.path}
              {exercise.checkFiles.includes(file) ? " · provided check" : ""}
            </h3>
            <pre className={css.output}>{file.contents}</pre>
          </div>
        ))}
      </details>
      <div className={css.workspace}>
        <h3>Your exercise folder</h3>
        <p>
          {workspace
            ? workspace.path
            : "Create a fresh folder with starter files, or attach an existing exercise folder."}
        </p>
        {workspace && workspace.version !== exercise.version && (
          <p role="status">
            This exercise has changed since you prepared the folder. Your files
            are preserved. Checks use the current version; a fresh copy is
            available below.
          </p>
        )}
        {exercise.language === "rust" && (
          <p>
            Requires Cargo, Rust, and a native linker. Checks run offline; any
            dependencies must already be installed.
          </p>
        )}
        {!desktop ? (
          <p>Open the desktop app to prepare files and run checks.</p>
        ) : (
          <div className={css.actions}>
            <button
              disabled={busy}
              onClick={() => void action(workspace ? "open" : "prepare")}
            >
              {workspace ? "Open folder" : "Prepare exercise"}
            </button>
            <button
              disabled={busy || running}
              onClick={() => void action("attach")}
            >
              Attach folder
            </button>
            {workspace && (
              <button
                disabled={busy || running}
                onClick={() => void action("fresh")}
              >
                Create fresh copy
              </button>
            )}
            <button
              disabled={!workspace || busy || running}
              onClick={() => void action("run")}
            >
              Run checks
            </button>
          </div>
        )}
        <p className={css.muted}>
          Checks run on a copy of your files. The originals stay unchanged.
        </p>
      </div>
      {latest && (
        <section aria-label="Check result">
          <div role="status">
            <h3>Last run: {latest.status}</h3>
          </div>
          <p className={css.muted}>
            {new Date(latest.startedAt).toLocaleString()} · Suite{" "}
            {latest.suiteVersion}
          </p>
          <p>Run checks again after changing your code.</p>
          {latest.sourceChanged && (
            <p>
              Source changed during this run. Run again before relying on it.
            </p>
          )}
          {latest.suiteVersion !== exercise.version && (
            <p>The provided checks have changed since this run.</p>
          )}
          {latest.status === "running" && (
            <button
              onClick={() => void act({ type: "cancel", runId: latest.id })}
            >
              Cancel run
            </button>
          )}
          <pre className={css.output} aria-label="Run output">
            {latest.output || "Starting…"}
          </pre>
          {!!latest.artifactDir && (
            <button
              onClick={() => void act({ type: "artifacts", runId: latest.id })}
            >
              Open saved artifacts
            </button>
          )}
          {runs.length > 1 && (
            <details>
              <summary>Previous runs ({runs.length - 1})</summary>
              {runs.slice(1).map((run) => (
                <details key={run.id}>
                  <summary>
                    {new Date(run.startedAt).toLocaleString()} · {run.status} ·
                    Suite {run.suiteVersion}
                  </summary>
                  <pre className={css.output}>{run.output}</pre>
                </details>
              ))}
            </details>
          )}
        </section>
      )}
    </section>
  );
}
