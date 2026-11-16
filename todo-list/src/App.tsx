import { useState } from "react";
import { tables, reducers } from "./module_bindings";
import { useSpacetimeDB, useTable, useReducer } from "spacetimedb/react";
import { Sheet } from "./Sheet";
import "./App.css";

function App() {
  const { isActive: connected } = useSpacetimeDB();
  const [myTodos, ready] = useTable(tables.myTodos);
  const createTodo = useReducer(reducers.createTodo);
  const updateTodo = useReducer(reducers.updateTodo);
  const deleteTodo = useReducer(reducers.deleteTodo);
  const [error, setError] = useState<string | null>(null);

  const todos = [...myTodos].sort((a, b) =>
    a.createdAt.microsSinceUnixEpoch < b.createdAt.microsSinceUnixEpoch
      ? -1
      : 1,
  );

  // Reducer calls resolve once the server has run them, or reject with the
  // reducer's error.
  const withErrorBanner = (promise: Promise<void>) => {
    setError(null);
    promise.catch((e: unknown) =>
      setError(e instanceof Error ? e.message : String(e)),
    );
  };

  return (
    <main className="desk">
      <Sheet
        todos={todos}
        ready={ready}
        disabled={!connected || !ready}
        error={error}
        onAdd={(text) => withErrorBanner(createTodo({ text }))}
        onToggle={(todo) =>
          withErrorBanner(updateTodo({ ...todo, done: !todo.done }))
        }
        onRename={(todo, text) =>
          withErrorBanner(updateTodo({ ...todo, text }))
        }
        onDelete={(todo) => withErrorBanner(deleteTodo({ id: todo.id }))}
      />

      <p className="status" aria-live="polite">
        {!connected && "Reconnecting. Changes are paused until it's back."}
      </p>
    </main>
  );
}

export default App;
