# SpacetimeDB Core Concepts

SpacetimeDB is a relational database that is also a server. It lets you upload application logic directly into the database as modules, eliminating the traditional web/game server layer entirely. Rust, C#, and C++ modules compile to WebAssembly, while TypeScript modules run on V8.

---

## Critical Rules

1. **Reducers are transactional.** They do not return data to callers. Use subscriptions to read data.
2. **Reducers must be deterministic.** Do not use filesystem, network, external clocks, or external random sources in reducers. Use the reducer context (`ctx`) for SpacetimeDB-provided timestamp and deterministic random values.
3. **Read data via tables/subscriptions**, not reducer return values. Clients get data through subscribed queries.
4. **Auto-increment IDs are not sequential.** Gaps are normal, do not use for ordering. Use timestamps or explicit sequence columns.
5. **`ctx.sender` is the authenticated principal.** Never trust identity passed as arguments.

---

## Feature Implementation Checklist

1. **Backend:** Define table(s) to store the data
2. **Backend:** Define reducer(s) to mutate the data
3. **Client:** Subscribe to the table(s)
4. **Client:** Call the reducer(s) from UI
5. **Client:** Render the data from the table(s)

---

## Debugging Checklist

1. Is SpacetimeDB server running? (`spacetime start`)
2. Is the module published? (`spacetime publish`)
3. Are client bindings generated? (`spacetime generate`)
4. Check server logs for errors (`spacetime logs <db-name>`)
5. Is the reducer actually being called from the client?

---

## Tables

- **Private tables** (default): Only accessible by reducers and the database owner.
- **Public tables**: Exposed for client read access through subscriptions. Writes still require reducers.

Organize data by access pattern, not by entity:

```
Player          PlayerState         PlayerStats
id         <--  player_id           player_id
name            position_x          total_kills
                position_y          total_deaths
                velocity_x          play_time
```

## Reducers

Reducers are transactional functions that modify database state. They run atomically, cannot interact with the outside world, and do not return data to callers. See the language-specific server skills for syntax.

## Event Tables

Event tables broadcast reducer-specific data to clients. Rows are never stored in the client cache (`count()` returns 0, `iter()` yields nothing); only `onInsert` callbacks fire.

## Subscriptions

Subscriptions replicate database rows to clients in real-time.

1. **Subscribe**: Register SQL queries describing needed data
2. **Receive initial data**: All matching rows are sent immediately
3. **Receive updates**: Real-time updates when subscribed rows change
4. **React to changes**: Use callbacks (`onInsert`, `onDelete`, `onUpdate`)

Best practices:
- Group subscriptions by lifetime
- Subscribe before unsubscribing when updating subscriptions
- Avoid overlapping queries
- Use indexes for efficient queries

## Modules

Modules contain application logic that runs inside the database.

- **Tables**: Define the data schema
- **Reducers**: Define callable functions that modify state
- **Event Tables**: Broadcast reducer-specific data to clients
- **Views**: Read-only functions that expose computed subsets of data to clients
- **Procedures**: (Unstable) Functions that can have side effects (HTTP requests, `ctx.withTx`)

Server-side modules can be written in: Rust, C#, TypeScript, C++

Lifecycle: Write → Compile → Publish (`spacetime publish`) → Hot-swap (republish without disconnecting clients)

## Identity

- **Identity**: A long-lived, globally unique identifier for a user.
- **ConnectionId**: Identifies a specific client connection.
- Always use `ctx.sender` / `ctx.Sender` / `ctx.sender()` for authorization.

SpacetimeDB works with many OIDC providers, including SpacetimeAuth (built-in), Auth0, Clerk, Keycloak, Google, and GitHub.


# SpacetimeDB CLI

Use this skill when the user needs help with the `spacetime` CLI tool - initializing projects, building modules, publishing databases, querying data, managing servers, or troubleshooting CLI issues.

## Quick Reference

### Project Initialization & Development

```bash
# Initialize new project
spacetime init my-project --lang rust|csharp|typescript|cpp
spacetime init my-project --template <template-id>

# Build module
spacetime build                    # release build
spacetime build --debug            # faster iteration, slower runtime

# Dev mode (auto-rebuild, auto-publish, generates bindings)
spacetime dev
spacetime dev --client-lang typescript --module-bindings-path ./client/src/module_bindings

# Generate client bindings
spacetime generate --lang typescript|csharp|rust --out-dir ./bindings --module-path ./server
spacetime generate --lang unrealcpp --uproject-dir ./MyGame --module-path ./server --unreal-module-name MyGame
```

### Publishing & Deployment

```bash
# Publish to Maincloud (default)
spacetime publish my-database --yes

# Publish to local server
spacetime publish my-database --server local --yes

# Clear database and republish
spacetime publish my-database --delete-data=always --yes
```

### Database Interaction

```bash
# SQL queries
spacetime sql my-database "SELECT * FROM users"
spacetime sql my-database --interactive   # REPL mode

# Call reducers (each argument is a separate positional arg)
spacetime call my-database my_reducer '"value"' '123'

# Subscribe to changes
spacetime subscribe my-database "SELECT * FROM users" --num-updates 10

# View logs
spacetime logs my-database -f              # follow logs
spacetime logs my-database -n 100          # up to 100 log lines

# Describe schema
# (without --json, output is human-readable text)
spacetime describe my-database --json
spacetime describe my-database tables --json   # also views, reducers, procedures, routes, env, types
spacetime describe my-database tables users --json
spacetime describe my-database reducers my_reducer --json
```

### Database Management

```bash
# List databases
spacetime list

# Delete database
spacetime delete my-database

# Rename database
spacetime rename <database-identity> --to new-name
```

### Server Management

```bash
# List configured servers
spacetime server list

# Add server
spacetime server add local --url http://localhost:3000 --default
spacetime server add myserver --url https://my-spacetime.example.com

# Set default server
spacetime server set-default local

# Test connectivity
spacetime server ping local

# Start local instance
spacetime start

# Clear local data
spacetime server clear
```

### Authentication

```bash
# Login (opens browser)
spacetime login

# Login with token
spacetime login --token <token>

# Show login status
spacetime login show

# Logout
spacetime logout
```

## Default Servers

| Name | URL | Description |
|------|-----|-------------|
| `maincloud` | `https://maincloud.spacetimedb.com` | Production cloud (default) |
| `local` | `http://127.0.0.1:3000` | Local development server |

## Common Flags

| Flag | Short | Description |
|------|-------|-------------|
| `--server` | `-s` | Target server (nickname, hostname, or URL) |
| `--yes` | `-y` | Non-interactive mode (skip confirmations) |
| `--anonymous` | | Use anonymous identity |
| `--module-path` | `-p` | Path to module project |
| `--no-config` | | Ignore `spacetime.json` project configuration |

## Troubleshooting

### "Not logged in"
```bash
spacetime login
# Or use --anonymous for public operations
```

### "Server not responding"
```bash
spacetime server ping <server>
# For local: ensure spacetime start is running
```

### "Schema conflict"
```bash
# Clear data and republish
spacetime publish my-db --delete-data=always --yes
```

### "Build failed"
```bash
# Check Rust/C# toolchain
rustup show
# For Rust modules, ensure wasm32-unknown-unknown target
rustup target add wasm32-unknown-unknown
```

## Module Languages

**Server-side (modules):** Rust, C#, TypeScript, C++
**Client SDKs:** TypeScript, C#, Rust, Unreal Engine
**CLI `generate` targets:** TypeScript, C#, Rust, Unreal C++


# SpacetimeDB TypeScript SDK Reference

## Module Structure

Tables are built with `table()`, bound with `schema()`, and exported as default. Reducers and lifecycle hooks are `export const`:

```typescript
import { schema, table, t } from 'spacetimedb/server';

const scoreRecord = table(
  { name: 'score_record', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    owner: t.identity(),
    value: t.u32(),
  }
);

const spacetimedb = schema({ scoreRecord });  // ONE object, not spread args
export default spacetimedb;

export const addRecord = spacetimedb.reducer(
  { value: t.u32() },
  (ctx, { value }) => {
    ctx.db.scoreRecord.insert({ id: 0n, owner: ctx.sender, value });
  }
);
```

Only table definitions belong in `schema({...})`. Row and object builders used as reducer arguments or view return types are not schema entries.

Named runtime exports are reserved for values registered with SpacetimeDB, such as reducers, lifecycle hooks, views, procedures, HTTP exports, and visibility filters. Keep ordinary helper functions and constants unexported.

## Imports

Schema builders and module exports come from `spacetimedb/server`. Runtime value classes such as `ScheduleAt`, `Timestamp`, and `ConnectionId` come from the root `spacetimedb` package; `Range` comes from `spacetimedb/server`:

```typescript
import {
  schema, table, t, SenderError,
  type InferSchema, type ReducerCtx,
} from 'spacetimedb/server';
import { ConnectionId, ScheduleAt, Timestamp } from 'spacetimedb';
import { Range } from 'spacetimedb/server';
```

## Tables

`table(OPTIONS, COLUMNS)` takes two arguments. The `name` field MUST be snake_case:

```typescript
const entity = table(
  { name: 'entity', public: true },
  {
    identity: t.identity().primaryKey(),
    name: t.string(),
    active: t.bool(),
  }
);
```

Options: `name` (snake_case, recommended), `public: true`, `event: true`, `indexes: [...]`

`ctx.db` accessors are the keys passed to `schema({...})`, verbatim: `schema({ scoreRecord })` -> `ctx.db.scoreRecord`. Keep TypeScript identifiers and accessors camelCase. Use explicit `name: 'snake_case'` strings when you need a canonical database name that differs from the TypeScript identifier.

## Column Types

Every column is a `t` builder value:

| Builder | JS type | Notes |
|---------|---------|-------|
| `t.u8()` / `t.u16()` / `t.u32()` | number | |
| `t.i8()` / `t.i16()` / `t.i32()` | number | |
| `t.u64()` | bigint | Use `0n` literals |
| `t.i64()` | bigint | Use `0n` literals |
| `t.u128()` / `t.i128()` / `t.u256()` / `t.i256()` | bigint | |
| `t.f64()` / `t.f32()` | number | |
| `t.bool()` | boolean | |
| `t.string()` | string | |
| `t.identity()` | Identity | |
| `t.connectionId()` | ConnectionId | |
| `t.timestamp()` | Timestamp | |
| `t.timeDuration()` | TimeDuration | |
| `t.scheduleAt()` | ScheduleAt | |

Modifiers: `.primaryKey()`, `.autoInc()`, `.unique()`, `.index('btree')`, `.default(value)`.

Use `.default(value)` only for a newly appended migration-safe field. Do not put defaults on primary-key, unique, or auto-increment columns.

Optional columns: `nickname: t.option(t.string())`

Schema builders describe the database's wire types; they are not TypeScript type names. For example, a `t.u16()` value is a TypeScript `number`, not a value cast to a type named `u16`.

## Indexes

Use inline `.index('btree')` when a single-column index does not need a named accessor. Use an `indexes` entry when the accessor is named explicitly or the index spans multiple columns. Every `indexes` entry requires `columns`; do not also add `.index('btree')` to the same column.

```typescript
// Inline (preferred for single-column):
authorId: t.u64().index('btree'),
// Access: ctx.db.post.authorId.filter(authorId);

// Multi-column (named):
indexes: [{ accessor: 'by_group_user', algorithm: 'btree', columns: ['groupId', 'userId'] }]
// Access: ctx.db.membership.by_group_user.filter([groupId, userId]);
```

Prefer a multi-column index over filtering by one column and looping. Filter takes an array in index column order; a prefix scan passes the leading value bare: `filter(groupId)`.

The published module's **entry file must export the schema as default**. If you split tables
(`schema.ts`) from reducers/lifecycle (`index.ts`), re-export it from the entry:

```typescript
// index.ts
export { default } from './schema';   // re-export the schema for the module entry
```

## Reducers

Reducers are created with `spacetimedb.reducer(...)`; the export name becomes the reducer name:

```typescript
export const createEntity = spacetimedb.reducer(
  { name: t.string(), age: t.i32() },
  (ctx, { name, age }) => {
    ctx.db.entity.insert({ identity: ctx.sender, name, age, active: true });
  }
);

// No arguments, just the callback:
export const doReset = spacetimedb.reducer((ctx) => { ... });
```

Reducer args accept any column type, including arrays of custom types: `{ splits: t.array(Split) }`. Do not pass JSON strings for structured data.

## DB Operations

```typescript
ctx.db.scoreRecord.insert({ id: 0n, owner: ctx.sender, value: 1 });  // Insert (0n for autoInc)
ctx.db.scoreRecord.id.find(recordId);                     // Find by PK → row | null
ctx.db.entity.identity.find(ctx.sender);                   // Find by unique column
[...ctx.db.post.authorId.filter(authorId)];                // Filter → spread to Array
[...ctx.db.entity.iter()];                                 // All rows → Array
ctx.db.scoreRecord.id.update({ ...existing, value: 2 });  // Update (spread + override)
ctx.db.scoreRecord.id.delete(recordId);                   // Delete by PK
```

Insert through the table accessor (`ctx.db.scoreRecord.insert(...)`). Primary-key, unique, and index accessors support lookup or mutation of existing rows, but do not have `insert(...)`.

`insert(...)` returns the inserted row, including database-assigned auto-increment fields.

The accessor for a primary key or index is the declared column name. For example, a primary key named `eventId` is accessed as `ctx.db.event.eventId`, not `ctx.db.event.id`.

The schema value registers module exports but does not expose database rows. Pass a context into any helper that needs `ctx.db`.

Note: `iter()` and `filter()` return iterators. Spread to Array for `.sort()`, `.filter()`, `.map()`.

## Lifecycle Hooks

MUST be `export const`. Bare calls are silently ignored:

```typescript
export const init = spacetimedb.init((ctx) => { ... });
export const onConnect = spacetimedb.clientConnected((ctx) => { ... });
export const onDisconnect = spacetimedb.clientDisconnected((ctx) => { ... });
```

`ctx.connectionId` is `ConnectionId | null`, including in lifecycle contexts. Guard it before passing it to a helper or using it as a table key.

## Reducer Context API

`ctx` is the only source of sender identity, time, and randomness; stdlib clocks and RNG are unavailable in modules. Let exported callbacks infer their context type. In helpers, use `ReducerCtx<InferSchema<typeof spacetimedb>>`; do not annotate a context as `any`, because that erases table row types and can make `bigint` expressions infer as `number`.

```typescript
type Ctx = ReducerCtx<InferSchema<typeof spacetimedb>>;

function findRecord(ctx: Ctx, id: bigint) {
  return ctx.db.scoreRecord.id.find(id);
}
```

```typescript
// Auth: ctx.sender is the caller's Identity
if (!row.owner.equals(ctx.sender)) throw new SenderError('unauthorized');

// ctx.connectionId: the per-connection id, NULLABLE (ConnectionId | null) — null-check before use.
// One Identity can hold several connections (multiple tabs/devices).
if (ctx.connectionId) { /* ... */ }

// Server timestamp (deterministic per reducer call)
ctx.db.item.insert({ id: 0n, createdAt: ctx.timestamp });

// Deterministic RNG
const f: number = ctx.random();                          // [0.0, 1.0)
const roll: number = ctx.random.integerInRange(1, 6);    // safe JS number bounds/result, inclusive
const storedRoll: bigint = BigInt(roll);                 // convert the result for an i64/u64 column
const bytes: Uint8Array = ctx.random.fill(new Uint8Array(16));

// Client: Timestamp → Date
new Date(Number(row.createdAt.microsSinceUnixEpoch / 1000n));
```

Do not construct `Identity` values from strings (e.g. `'hex' as Identity`): serialization fails and kills the module. Identities come from `ctx.sender` or `t.identity()` columns.

Construct a `ConnectionId` from its numeric representation with `new ConnectionId(value)` after importing `ConnectionId` from `spacetimedb`.

Construct exact timestamps with `new Timestamp(micros)` after importing `Timestamp` from `spacetimedb`. Inclusive index ranges use `Range` from `spacetimedb/server`:

```typescript
import { Timestamp } from 'spacetimedb';
import { Range } from 'spacetimedb/server';

ctx.db.shipment.deliverBy.filter(new Range(
  { tag: 'included', value: new Timestamp(1_000n) },
  { tag: 'included', value: new Timestamp(2_000n) },
));
```

## Scheduled Tables

The reducer or procedure referenced by a table's `scheduled` option must be exported.

```typescript
import { ScheduleAt } from 'spacetimedb';   // ScheduleAt comes from the root package

const tickTimer = table({
  name: 'tick_timer',
}, {
  scheduledId: t.u64().primaryKey().autoInc(),
  scheduledAt: t.scheduleAt(),
});

export const tick = spacetimedb.reducer(
  { onSchedule: tickTimer },
  { timer: tickTimer.rowType },
  (ctx, { timer }) => { /* timer row auto-deleted after this runs */ }
);

// `onSchedule` also works for scheduled procedures whose return type is `t.unit()`.
// Legacy table-side scheduling, `scheduled: (): any => tick`, still works but is not
// recommended for new code because it forces a forward reference.

// One-time: ScheduleAt.time(ctx.timestamp.microsSinceUnixEpoch + delayMicros)
// Repeating: ScheduleAt.interval(60_000_000n)
// Read time back from a scheduleAt value (tagged union):
//   const micros = at.tag === 'time' ? at.value : at.value.microsSinceUnixEpoch;  // bigint
```

## Custom Types

```typescript
// Product type (struct):
const Position = t.object('Position', { x: t.i32(), y: t.i32() });
const entity = table({ name: 'entity' }, {
  id: t.u64().primaryKey().autoInc(),
  pos: Position,
});

// Sum type (tagged union):
const Shape = t.enum('Shape', {
  circle: t.i32(),
  rectangle: t.object('Rect', { w: t.i32(), h: t.i32() }),
});
// Values: { tag: 'circle', value: 10 }
```

## Views

A client subscribing to a view receives only the rows it returns. Use a per-user view
(keyed on `ctx.sender`) for per-viewer access control: deleting a row it depends on
(e.g. a membership row) automatically drops the rows it was exposing from that client.

`t.row(...)` and `t.object(...)` return schema builders, not TypeScript runtime row types. Let a view callback infer its result, or annotate a separately declared structural type such as `Array<{ sku: bigint; label: string }>`. A named output type must not reuse the generated PascalCase name of its view accessor (for example, reserve `DiscountedProduct` for a `discounted_product` view).

Both `spacetimedb.view(...)` and `spacetimedb.anonymousView(...)` take three arguments: view options, the declared return schema, and the callback.

```typescript
// Anonymous view (same for all clients):
export const activeUsers = spacetimedb.anonymousView(
  { name: 'active_users', public: true },
  t.array(entity.rowType),
  (ctx) => [...ctx.db.entity.iter()].filter(e => e.active)
);

// Per-user view (varies by ctx.sender):
export const myProfile = spacetimedb.view(
  { name: 'my_profile', public: true },
  t.option(entity.rowType),
  (ctx) => ctx.db.entity.identity.find(ctx.sender) ?? undefined
);
```

For a procedural view primary key, define the output with `t.row` and mark its field `.primaryKey()`:

```typescript
const CatalogKey = t.row('CatalogKey', {
  sku: t.u64().primaryKey(),
  label: t.string(),
});
```

Query-builder views use `ctx.from` and return the query directly. Because a query returns a row set, declare its return schema as `t.array(tableName.rowType)`. Use `where` for predicates and `rightSemijoin` when the result should contain right-side rows that have a matching left-side row:

```typescript
ctx => ctx.from.article.where(article => article.published.eq(true))
ctx => ctx.from.subscription.rightSemijoin(
  ctx.from.account,
  (subscription, account) => subscription.accountId.eq(account.id)
)
```

The method name identifies which side is returned: `A.leftSemijoin(B, ...)` returns rows from `A`, while `A.rightSemijoin(B, ...)` returns rows from `B`. To return one table's rows when another table has a match, put the returned table on the corresponding side. Semijoins do not project combined columns from both tables.

Procedural views read through `ctx.db` and return materialized values such as arrays. Query-builder values from `ctx.from` are returned directly; they are not iterators and cannot be spread, looped over, or mixed with array methods. Use a procedural view when the result is a custom row assembled from multiple tables.

## Client Visibility Filters

```typescript
export const privateNoteFilter = spacetimedb.clientVisibilityFilter.sql(
  'SELECT * FROM owned_row WHERE owner = :sender'
);
```

## Procedures and HTTP

`spacetimedb` is the local schema value returned by `schema({...})`; it is not a named export to import from `spacetimedb/server`.

Procedures declare argument and return types:

```typescript
const Result = t.object('Result', { value: t.string() });

export const inspect = spacetimedb.procedure(
  { input: t.string() },
  Result,
  (_ctx, { input }) => ({ value: input })
);
```

Procedure callbacks are synchronous. Do not mark them `async` or use `await`; return the declared value directly. A procedure with return type `t.unit()` returns `{}`.

TypeScript outbound HTTP uses `ctx.http.fetch(url, options)`, including for non-GET requests; it does not provide convenience methods such as `get()` or `post()`. Responses expose the numeric `status`, `headers.get(name)`, and `text()` APIs.

`t.array(t.u8())` values are `number[]`. Convert one to `new Uint8Array(value)` before using it as a binary request body.

Procedures and handlers open short database transactions with `ctx.withTx(tx => ...)`. Perform network I/O before opening the transaction; only database work belongs inside its callback.

Scheduled procedures use the same `onSchedule` binding as scheduled reducers. The procedure must be exported, return `t.unit()`, and accept the scheduled row as its argument.

Inbound HTTP uses `httpHandler`, `httpRouter`, `Router`, and `SyncResponse`:

`httpHandler` and `httpRouter` are methods on the local `spacetimedb` schema value, not named imports.

```typescript
import { Router, SyncResponse } from 'spacetimedb/server';

export const health = spacetimedb.httpHandler((_ctx, _request) =>
  new SyncResponse('ok', {
    status: 200,
    headers: { 'content-type': 'text/plain' },
  })
);
export const routes = spacetimedb.httpRouter(new Router().get('/health', health));
```

Handlers are synchronous: return `SyncResponse` directly rather than marking the callback `async`. Pass the exported `httpHandler(...)` value to the router, not its raw callback. The router selects the path, while a handler reads request data with APIs such as `request.text()`; `Request` has no `path` property. A handler context does not expose `ctx.db`; use `ctx.withTx(tx => ...)` when a handler needs transactional database access.


# SpacetimeDB TypeScript Client

Generated bindings convert snake_case names to camelCase, including row fields: a server column `trip_id` is `tripId` on client rows.

## React: main.tsx

```typescript
import React, { useMemo } from 'react';
import ReactDOM from 'react-dom/client';
import { SpacetimeDBProvider } from 'spacetimedb/react';
import { DbConnection } from './module_bindings';
import { MODULE_NAME, SPACETIMEDB_URI } from './config';
import App from './App';

const TOKEN_KEY = `${SPACETIMEDB_URI}/${MODULE_NAME}/auth_token`;

function Root() {
  const connectionBuilder = useMemo(() =>
    DbConnection.builder()
      .withUri(SPACETIMEDB_URI)
      .withDatabaseName(MODULE_NAME)
      .withToken(localStorage.getItem(TOKEN_KEY) ?? undefined)
      .withAutomaticReconnect()
      .onConnect((_conn, _identity, token) => localStorage.setItem(TOKEN_KEY, token)),
    []
  );
  return (
    <SpacetimeDBProvider connectionBuilder={connectionBuilder}>
      <App />
    </SpacetimeDBProvider>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(<Root />);
```

## React: App.tsx

```typescript
import { useTable, useSpacetimeDB } from 'spacetimedb/react';
import { DbConnection, tables } from './module_bindings';

export default function App() {
  const { isActive, identity: myIdentity, getConnection } = useSpacetimeDB();
  const conn = getConnection() as DbConnection | null;

  // useTable owns subscriptions and reports readiness after replay.
  const [entities, entitiesReady] = useTable(tables.entity);
  const [records, recordsReady] = useTable(tables.record);

  const [onlineUsers] = useTable(
    tables.entity.where(r => r.active.eq(true)),
    {
      onInsert: user => console.log('User connected:', user.name),
      onDelete: user => console.log('User disconnected:', user.name),
      onUpdate: (oldUser, newUser) => console.log('Updated:', newUser.name),
    }
  );

  const addRecord = (data: string) => {
    if (!conn || !isActive) return;
    void conn.reducers.addRecord({ data }).catch(console.error);
  };
  const ownsEntity = entities.some(
    row => row.owner.toHexString() === myIdentity?.toHexString()
  );

  return (
    <main>
      <p>{isActive ? 'Connected' : 'Not connected'}</p>
      <p>{entitiesReady && recordsReady ? 'Data ready' : 'Waiting for current data'}</p>
      <p>{onlineUsers.length} users online, {records.length} records</p>
      <p>{ownsEntity ? 'You own an entity' : 'No owned entity'}</p>
      <button disabled={!isActive} onClick={() => addRecord('Hello!')}>
        Add record
      </button>
    </main>
  );
}
```

## Vanilla (non-React)

```typescript
import { DbConnection, tables } from './module_bindings';

const HOST = 'wss://maincloud.spacetimedb.com';
const DATABASE = 'my_module';
const TOKEN_KEY = `${HOST}/${DATABASE}/auth_token`;

const conn = DbConnection.builder()
  .withUri(HOST)
  .withDatabaseName(DATABASE)
  .withToken(localStorage.getItem(TOKEN_KEY) ?? undefined)
  .withAutomaticReconnect()
  .onConnect((_conn, identity, token) => {
    localStorage.setItem(TOKEN_KEY, token);
    console.log('Connected as:', identity.toHexString());
  })
  .onDisconnect((_ctx, error, nextAttempt, delayMs) => {
    if (nextAttempt !== undefined) {
      console.warn(`Reconnect attempt ${nextAttempt} in ${delayMs} ms`, error);
    } else {
      console.log('Connection ended', error);
    }
  })
  .onConnectError((_ctx, error, nextAttempt, delayMs) => {
    console.error('Connection failed:', error);
    if (nextAttempt !== undefined) {
      console.log(`Retry ${nextAttempt} in ${delayMs} ms`);
    }
  })
  .build();

// Register once; the SDK replays this subscription after reconnecting.
const subscription = conn.subscriptionBuilder()
  .onApplied(() => console.log('Ready'))
  .subscribe([tables.user, tables.message]);

// Row callbacks
conn.db.user.onInsert((ctx, user) => console.log('Joined:', user.name));
conn.db.user.onDelete((ctx, user) => console.log('Left:', user.name));
conn.db.user.onUpdate((ctx, oldUser, newUser) => console.log('Updated:', newUser.name));
```

## Automatic Reconnect and Token Refresh

The React provider's connection manager enables automatic reconnect; the explicit `.withAutomaticReconnect()` above also shows the setting to use for direct connections. Without it, a direct connection does not recover automatically. For direct connections, initial failures are not retried. After an established connection drops, retries use exponential backoff and jitter from `minDelayMs` (default 1 s) up to `maxDelayMs` (default 30 s), until `disconnect()` or a terminal failure. Tune these with `.withAutomaticReconnect({ minDelayMs, maxDelayMs })`; values below the 500 ms and 1 s floors are raised with a warning, so that retrying clients cannot overwhelm the database. While mounted, the React provider also preserves its separate connection-manager retries: it builds a replacement connection after an initial or terminal failure that the core connection will not retry. It respects an explicit `disconnect()`.

The same connection, identity, table handles, subscriptions, and row callbacks survive recovery. Each attempt gets a fresh connection ID. `onConnect` runs again before subscription replay, so register subscriptions and row callbacks once, outside that callback. The SDK replays subscriptions in one batch, retains readable but stale cached rows during outages, and emits net row changes after reconciliation. Subscription `onApplied` runs again after replay; keep one-time setup separate.

In React, let `useTable` manage its own subscriptions. Do not add a second subscription effect for the same queries or recreate subscriptions whenever `isActive` changes. Use the hook's `isReady` result for data readiness: a successful reconnect handshake does not mean replay has completed. Invoke reducers from event handlers, not during rendering. For a manually created subscription, retain its handle and call `unsubscribe()` when it is no longer needed, including during an outage.

For direct connections, `conn.isReconnecting` reports recovery before the next successful handshake. `onDisconnect` and `onConnectError` receive `(ctx, error, nextReconnectAttempt, nextReconnectDelayMs)`. The last two arguments are `undefined` when no retry is scheduled. Do not build a replacement connection or run your own retry timer while automatic recovery is pending. An explicit `conn.disconnect()` stops recovery, including a pending token refresh result.

For expiring credentials, also call `.withTokenProvider(() => refreshTokenAsync())`, where your authentication integration supplies `refreshTokenAsync(): Promise<string>`. Supply the initial token with `.withToken(initialToken)`; the provider is used only for reconnect attempts. It must return a non-empty token for the same identity. The SDK calls it when remaining validity is at most 30 seconds or 5% of the original lifetime, whichever is greater, when expiry cannot be read, or after a reused token is rejected. Provider failures retry; rejection of a freshly provided token is terminal. No periodic refresh runs while connected, and disconnecting does not cancel the provider's own asynchronous work.

Calls made while disconnected fail immediately. Pending reducer and procedure promises reject with `UnknownCallResultError` (exported from `spacetimedb`) when the connection is lost before a result arrives. The server may have executed the operation; the SDK never replays it. Do not automatically retry non-idempotent calls on that error.

## Gotchas

- **`useTable` rows are `readonly`.** Copy before sorting/mutating, or it fails to type-check:
  `const [rows] = useTable(tables.message); const sorted = [...rows].sort(...)`.
- **bigint in JSX.** ids/counts from `t.u64()`/`t.i64()` columns are `bigint`, which React
  cannot render. Wrap it: `{Number(row.id)}` or `{String(count)}`.
