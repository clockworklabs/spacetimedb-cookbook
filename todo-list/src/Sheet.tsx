import { useEffect, useRef, useState } from "react";
import type { Todo } from "./module_bindings/types";

// Keep the sheet looking like a full page, however few tasks are on it.
const MIN_LINES = 16;

const now = new Date();
const today = new Intl.DateTimeFormat("en-GB", {
  weekday: "long",
  day: "numeric",
  month: "long",
}).format(now);
const todayShort = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
}).format(now);

export function Sheet({
  todos,
  ready,
  disabled,
  error,
  onAdd,
  onToggle,
  onRename,
  onDelete,
}: {
  todos: readonly Todo[];
  ready: boolean;
  disabled: boolean;
  error: string | null;
  onAdd: (text: string) => void;
  onToggle: (todo: Todo) => void;
  onRename: (todo: Todo, text: string) => void;
  onDelete: (todo: Todo) => void;
}) {
  const blankLines = Math.max(
    0,
    MIN_LINES - todos.length - 1 - (error ? 1 : 0),
  );

  return (
    <article className="sheet" aria-labelledby="sheet-title">
      <header className="sheet-head">
        <h1 id="sheet-title">Things to do</h1>
        <div className="sheet-meta">
          <time dateTime={now.toISOString().slice(0, 10)}>
            <span className="date-long">{today}</span>
            <span className="date-short">{todayShort}</span>
          </time>
          {todos.length > 0 && (
            <span>
              {todos.filter((todo) => todo.done).length} of {todos.length} done
            </span>
          )}
        </div>
      </header>

      <ol className="lines">
        {todos.map((todo) => (
          <TodoLine
            key={String(todo.id)}
            todo={todo}
            onToggle={() => onToggle(todo)}
            onRename={(text) => onRename(todo, text)}
            onDelete={() => onDelete(todo)}
          />
        ))}

        <NewTodoLine
          disabled={disabled}
          isFirst={ready && todos.length === 0}
          onAdd={onAdd}
        />

        {error && (
          <li className="line line-error" role="alert">
            <span className="line-text">Couldn't save that: {error}</span>
          </li>
        )}

        {Array.from({ length: blankLines }, (_, i) => (
          <li key={`blank-${i}`} className="line" aria-hidden="true" />
        ))}
      </ol>
    </article>
  );
}

function TodoLine({
  todo,
  onToggle,
  onRename,
  onDelete,
}: {
  todo: Todo;
  onToggle: () => void;
  onRename: (text: string) => void;
  onDelete: () => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (draft !== null) inputRef.current?.focus();
  }, [draft !== null]);

  const commit = () => {
    const text = draft ?? "";
    if (text && text !== todo.text) onRename(text);
    setDraft(null);
  };

  return (
    <li className={`line${todo.done ? " is-done" : ""}`}>
      <label className="tick">
        <input
          type="checkbox"
          checked={todo.done}
          onChange={onToggle}
          aria-label={
            todo.done
              ? `Mark "${todo.text}" as not done`
              : `Mark "${todo.text}" as done`
          }
        />
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <rect
            className="tick-box"
            x="2.5"
            y="2.5"
            width="15"
            height="15"
            rx="1.5"
          />
          <path
            className="tick-mark"
            d="M5 10.5 L8.5 14 L16 4.5"
            pathLength="1"
          />
        </svg>
      </label>

      {draft === null ? (
        <button
          type="button"
          className="line-text"
          onClick={() => setDraft(todo.text)}
          title="Edit task"
        >
          {todo.text}
        </button>
      ) : (
        <input
          ref={inputRef}
          className="line-text"
          value={draft}
          aria-label="Edit task"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") setDraft(null);
          }}
        />
      )}

      <button
        type="button"
        className="erase"
        onClick={onDelete}
        aria-label={`Delete "${todo.text}"`}
        title="Delete task"
      >
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M4 4 L12 12 M12 4 L4 12" />
        </svg>
      </button>
    </li>
  );
}

function NewTodoLine({
  disabled,
  isFirst,
  onAdd,
}: {
  disabled: boolean;
  isFirst: boolean;
  onAdd: (text: string) => void;
}) {
  const [text, setText] = useState("");

  return (
    <li className="line line-new">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!text) return;
          onAdd(text);
          setText("");
        }}
      >
        <input
          className="line-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={disabled}
          aria-label="New task"
          placeholder={
            disabled
              ? "Connecting…"
              : isFirst
                ? "Write your first task here"
                : "Add a task"
          }
          autoFocus
        />
      </form>
    </li>
  );
}
