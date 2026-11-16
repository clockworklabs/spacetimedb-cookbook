# todo-list

A to-do list built on SpacetimeDB: create, read, update and delete in about sixty lines of module code,
with a React client.

Each user has their own list. They can add a task, tick it off, rename it and delete it, and every change
appears in every tab they have open as soon as the server has made it.

It shows:

- [A private table](#the-table) whose rows belong to the user who created them
- [A view](#a-view-of-your-own-todos) that shows each user only their own rows
- [One reducer per write](#one-reducer-per-write): create, update and delete, each checking who's asking
- [Reading through a subscription](#reading-through-a-subscription), not a reducer's return value
- [Calling reducers from React](#calling-reducers-from-react), and showing their errors

## How it works

### The table

All the data lives in one table (`spacetimedb/src/index.ts`):

```ts
const todo = table(
  { name: "todo" },
  {
    id: t.u64().primaryKey().autoInc(),
    owner: t.identity().index("btree"),
    text: t.string(),
    done: t.bool(),
    createdAt: t.timestamp(),
  },
);
```

`owner` is the identity of the user who created the todo, and `createdAt` is the server's time when they
did. The client sorts by `createdAt`, not `id`: auto-increment ids are unique, but SpacetimeDB doesn't
promise they're sequential.

The table isn't marked `public`, so it's private: clients can't subscribe to it or query it. Only the
module's own code, and the database's owner, can read it.

### A view of your own todos

Clients read their todos through a view instead:

```ts
export const myTodos = spacetimedb.view(
  { name: "my_todos", public: true },
  t.array(todo.rowType),
  (ctx) => ctx.from.todo.where((todo) => todo.owner.eq(ctx.sender)),
);
```

A view is a read-only query that clients can subscribe to like a table. This one is per-user: `ctx.sender`
is the identity of whoever is subscribing, so each client sees only the rows it owns. The filter runs on
the server, so other users' todos never reach the client at all.

It's written with the query builder (`ctx.from`) rather than as a function that loops over rows. That lets
SpacetimeDB keep each subscriber's results up to date as rows change, instead of
rerunning the whole view.

### One reducer per write

Reducers are the only way to change the database. There's one for each of create, update and delete:

```ts
export const createTodo = spacetimedb.reducer(
  { text: t.string() },
  (ctx, { text }) => {
    if (text.trim() === "") throw new SenderError("Todo text cannot be empty");

    ctx.db.todo.insert({
      id: 0n,
      owner: ctx.sender,
      text,
      done: false,
      createdAt: ctx.timestamp,
    });
  },
);
```

The owner comes from `ctx.sender`, the identity the caller authenticated as, never from an argument. The
`id` of `0n` is a placeholder that the auto-increment replaces.

`updateTodo` and `deleteTodo` look the todo up by its primary key, and refuse it unless the caller owns
it:

```ts
const existing = ctx.db.todo.id.find(id);
if (!existing || !existing.owner.equals(ctx.sender)) {
  throw new SenderError("Todo not found");
}
ctx.db.todo.id.update({ ...existing, text, done });
```

A missing todo and someone else's todo get the same error, so a caller can't probe for other users' ids.

Each reducer runs in a transaction. When it throws, none of its changes are kept, and the `SenderError`'s
message goes back to the caller.

### Reading through a subscription

Reducers don't return data. The client reads by subscribing to the view, and SpacetimeDB keeps a copy of
its rows up to date in the client's cache (`src/App.tsx`):

```ts
const [myTodos, ready] = useTable(tables.myTodos);
```

`useTable` subscribes when the component mounts, and re-renders it whenever a row is inserted, updated or
deleted. `ready` turns true once the first copy of the rows has arrived, so the client can tell an empty
list from one that hasn't loaded yet.

That's why the reducers above don't need to tell the client anything. When `createTodo` inserts a row, the
row arrives through the subscription, in this tab and every other one.

### Calling reducers from React

`useReducer` gives the component a function for each reducer:

```ts
const createTodo = useReducer(reducers.createTodo);
const updateTodo = useReducer(reducers.updateTodo);
const deleteTodo = useReducer(reducers.deleteTodo);
```

It's SpacetimeDB's `useReducer`, from `spacetimedb/react`, not React's.

Calling one sends the request to the server, and returns a promise that resolves once the reducer has run,
or rejects with its error. `withErrorBanner` shows that error on the sheet:

```ts
onAdd={(text) => withErrorBanner(createTodo({ text }))}
```

Nothing waits for the promise to change the screen. The new todo appears when its row arrives through the
subscription.

The connection itself is set up in `src/main.tsx`. It keeps the token the server issues in
`localStorage`, so the same browser keeps the same identity, and its list, across reloads.

## Where things are

| File                              | What it does                                                          |
| --------------------------------- | --------------------------------------------------------------------- |
| `spacetimedb/src/index.ts`        | The module: the `todo` table, the `my_todos` view, and three reducers |
| `spacetimedb/tests/index.test.ts` | Tests for the reducers and the view, against an in-memory database    |
| `src/main.tsx`                    | Connects to SpacetimeDB                                               |
| `src/App.tsx`                     | Subscribes to the view and calls the reducers                         |
| `src/Sheet.tsx`                   | Draws the list, and nothing else: it knows nothing about SpacetimeDB  |
| `src/module_bindings/`            | Client bindings, generated from the module                            |

## Development

You need Node.js, pnpm, prettier and the SpacetimeDB CLI. The `flake.nix` at the root of this repository
provides them all: run `direnv allow`, or `nix develop`.

### Running it locally

```bash
pnpm install

# In another terminal: a local SpacetimeDB server on port 3000.
spacetime start

# Publish the module under the database name the client uses by default.
spacetime publish --server local todo-list

# Serve the client at http://localhost:5173.
pnpm dev
```

Run `spacetime` commands from this directory. `spacetime.json` points them at the module in
`spacetimedb/`, and at Maincloud unless you pass `--server`, so pass `--server local` while developing.

`spacetime dev` writes a `spacetime.local.json` (gitignored) that names a database of its own. While that
file exists, the CLI takes the database name from it, so leave `todo-list` out of the commands below, or
delete the file.

To try the reducers without the client (the `todo` table is private, but you can query it because you
published the database):

```bash
spacetime call --server local todo-list create_todo '"Buy milk"'
spacetime sql --server local todo-list "SELECT * FROM todo"
```

### Configuration

The client reads its settings from `.env.local` at build time. With neither set, it connects to the local
server above.

| Variable                   | Default               |
| -------------------------- | --------------------- |
| `VITE_SPACETIMEDB_HOST`    | `ws://localhost:3000` |
| `VITE_SPACETIMEDB_DB_NAME` | `todo-list`           |

### Changing the module

The bindings in `src/module_bindings` are generated from the module and committed. After changing a
table, view or reducer, regenerate them and republish:

```bash
spacetime generate
prettier --write src/module_bindings
spacetime publish --server local todo-list
```

### Checking a change

```bash
pnpm test     # the module's tests
pnpm build    # type-checks and builds the client
```
