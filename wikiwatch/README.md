# wikiwatch

A live view of what's being edited on English Wikipedia right now, built on SpacetimeDB.

A TypeScript module polls Wikipedia's recent changes every 15 seconds, and keeps the last 24 hours of
article edits along with a preview of each article. A React client subscribes to them, and shows which
articles are busiest.

None of its data comes from clients. The module fetches it from the outside world on a timer, and decides
which rows each client should be holding, so a client subscribes once and never has to manage its cache.
It shows:

- [HTTP requests from a scheduled procedure](#http-requests-from-a-scheduled-procedure), with the work
  in progress kept in tables
- [A live set that ages on the server](#a-live-set-that-ages-on-the-server), so old rows leave client
  caches without anyone resubscribing
- [A subscription join](#previews-through-a-subscription-join) that sends each article's preview along
  with its live edits
- [An event table](#progress-through-an-event-table) that reports what the poller is doing, without
  storing it
- [A private table](#personal-data-in-a-private-table) for configuration that mustn't go in the source

## What you see

- **The front page** ranks the most active articles of the last 30 minutes, with recent edits counting
  most. Each article has a trail of its edits across those minutes: additions rise above the line,
  removals drop below it. Alongside are a per-minute pulse of edit volume, a ticker of the latest
  edits, and a toggle to hide bot edits. The page replays edits 30 seconds behind real time, which turns
  the poller's 15-second bursts back into a steady stream.
- **Article pages** (`#/article/<page id>`) show an article's summary and thumbnail, and every edit to
  it that the server still holds, as soon as each one arrives.
- **Toasts** report what the server's Wikipedia fetchers are doing, and when they fail.

## How it works

### HTTP requests from a scheduled procedure

Reducers can't make network requests, so the poller, `pollWikipedia`, is a procedure. Procedures can be
scheduled like reducers: `init` inserts a row into `poll_timer` that runs it every 15 seconds.

```ts
export const pollWikipedia = spacetimedb.procedure(
  { onSchedule: poll_timer },
  { timer: poll_timer.rowType },
  t.unit(),
  (ctx) => {
    if (!ctx.sender.equals(ctx.databaseIdentity)) {
      throw new SenderError("pollWikipedia may only be run by the scheduler");
    }
    // ...
  },
);
```

Any client can call a procedure or a reducer, scheduled or not. Without that check, anyone could make the
database send requests to Wikipedia, so every scheduled export in the module refuses callers other than
the database itself.

A procedure isn't a transaction. It opens short transactions with `ctx.withTx`, and makes its HTTP
requests between them, so no transaction stays open while Wikipedia answers. Fetching edits takes three
steps (`spacetimedb/src/edits.ts`):

```ts
const start = ctx.withTx((tx) => {
  const cursor = tx.db.poller_status.id.find(STATUS_ID)?.cursor;
  // ...
});

changes = fetchRecentChanges(ctx.http, agent, start, MAX_RC_PAGES);

const inserted = ctx.withTx((tx) => {
  for (const change of changes) {
    if (tx.db.edit.rc_id.find(change.rc_id)) continue;
    tx.db.edit.insert({ ...change, live: isLive(tx, change.edited_at) });
    enqueuePreview(tx, change.page_id, change.title);
  }
  // ...advance the cursor
});
```

Nothing carries over from one transaction to the next unless it's in a table, so that's where the poller
keeps its progress:

- **The cursor** lives in `poller_status`. Each poll re-reads a minute before it, because changes can
  reach the API slightly after their timestamps, and keying `edit` on Wikipedia's `rcid` makes the
  overlap harmless. After downtime the cursor skips ahead rather than back-filling more than an hour.
- **Articles that need a preview** go into the private `preview_queue` table, in the same transaction as
  their edits. The rest of the poll fetches up to three batches of twenty from the queue. A page whose
  fetch fails stays queued for the next poll, until it has failed three times. A preview more than a day
  old is fetched again the next time its article is edited.

`init` runs only when a database is created, not when a module is republished. The sweep timer below
arrived after wikiwatch was first deployed, so the poller also calls `ensureSweepTimer`, which inserts the
timer if it's missing. A timer added to a module that's already running needs the same treatment.

### A live set that ages on the server

The front page shows the last 30 minutes, so the obvious subscription filters on time. But a subscription
query is fixed when it's made. A cutoff of 30 minutes ago goes stale straight away, and rows older than it
stay in the client's cache until the client resubscribes with a new one.

Instead, each `edit` row carries a `live` flag, and clients subscribe to the live edits only:

```ts
useTable(tables.edit.where((row) => row.live.eq(true)));
```

New edits are inserted live. Every five minutes, the scheduled reducer `sweepLiveSet` clears the flag on
edits more than 30 minutes old (`spacetimedb/src/live.ts`):

```ts
const aged = [...ctx.db.edit.live.filter(true)].filter(
  (edit) => !isLive(ctx, edit.edited_at),
);
for (const edit of aged) {
  ctx.db.edit.rc_id.update({ ...edit, live: false });
}
```

A row that stops matching a subscription reaches its subscribers as a delete. Each client's cache stays
about half an hour deep, without the client resubscribing or knowing how long anything is kept. Between
sweeps a live edit can be up to 35 minutes old, so the front page ignores anything older than 30 minutes
when it draws.

The server keeps 24 hours of edits, and `pruneOldData` deletes older ones every hour. Article pages
subscribe to all of an article's edits, live or not. Subscriptions share one client cache, but `useTable`
filters it by each query, so the front page never sees those older edits.

### Previews through a subscription join

Each card on the front page needs its article's preview. Rather than subscribe to a day's worth of
previews, the client joins the live edits onto `article_preview` (`src/live/hooks.ts`):

```ts
const livePreviews = tables.edit
  .where((edit) => edit.live.eq(true))
  .rightSemijoin(tables.articlePreview, (edit, preview) =>
    edit.pageId.eq(preview.pageId),
  );
```

`rightSemijoin` returns the rows from the right-hand table, `article_preview`, that match at least one
live edit. SpacetimeDB keeps the join in step as edits come and go, so a preview arrives with its article's
first live edit and leaves with its last. The module never tracks which previews are live.

One catch: `useTable` filters the shared cache by its query, but it can't filter by a join. While an
article page is open, its preview shows up among the front page's previews too, whether or not the
article has live edits. That's harmless here, because previews are looked up by page id.

### Progress through an event table

The toasts report what the poller is doing. They come from `fetch_log`, an event table:

```ts
export const fetch_log = table(
  { name: "fetch_log", public: true, event: true },
  { fetch_id: t.uuid(), activity: FetchActivity },
);
```

An event table's rows go to subscribers when their transaction commits, and are never stored, on the
server or in the client's cache. The client sees them only through `onInsert`:

```ts
useTable(tables.fetchLog, { onInsert });
```

Each `withTx` commits as soon as it returns, so the poller logs a fetch's start before making the request,
and clients see it while the request is still in flight. The start and end rows share a `fetch_id`, so the
client can pair them.

`activity` is a sum type. The generated bindings turn its snake_case variants into PascalCase tags, so the
server's `fetching_edits` is `case "FetchingEdits"` on the client.

### Personal data in a private table

Wikimedia's [User-Agent policy][ua-policy] asks API clients for contact details. Those are personal, so
they don't belong in the source or the module bundle. They live in the `settings` table instead. It's
private, so clients can't subscribe to it, and only the database owner can read or change it, with
`spacetime sql`. [Development](#identify-yourself-to-wikipedia) shows how to set it.

[ua-policy]: https://foundation.wikimedia.org/wiki/Policy:Wikimedia_Foundation_User-Agent_Policy

## Where things are

### The module (`spacetimedb/src`)

| File           | What it does                                                                     |
| -------------- | -------------------------------------------------------------------------------- |
| `index.ts`     | The entry: `init`, and re-exports of the scheduled exports                       |
| `schema.ts`    | The tables, and the types stored in them                                         |
| `poll.ts`      | `pollWikipedia`, which fetches recent changes and then previews every 15 seconds |
| `edits.ts`     | Ingests recent changes into the `edit` table                                     |
| `previews.ts`  | Queues, fetches and stores article previews                                      |
| `live.ts`      | `sweepLiveSet`, which ages edits out of the live set that clients subscribe to   |
| `prune.ts`     | `pruneOldData`, which deletes edits and previews older than a day                |
| `status.ts`    | Records the poller's health in `poller_status` and its activity in `fetch_log`   |
| `wikipedia.ts` | A small client for the MediaWiki Action API                                      |
| `time.ts`      | Timestamp arithmetic                                                             |

| Table                                      | Visibility   | Holds                                                    |
| ------------------------------------------ | ------------ | -------------------------------------------------------- |
| `edit`                                     | public       | One row per recent change, keyed by Wikipedia's `rcid`   |
| `article_preview`                          | public       | Each article's title, description, summary and thumbnail |
| `poller_status`                            | public       | The poll cursor, and the poller's health                 |
| `fetch_log`                                | public event | The start and end of each fetch, for the toasts          |
| `preview_queue`                            | private      | Articles waiting for a preview fetch                     |
| `settings`                                 | private      | The contact sent to Wikipedia                            |
| `poll_timer`, `prune_timer`, `sweep_timer` | private      | The schedules                                            |

### The client (`src`)

- `main.tsx` connects to SpacetimeDB, and `App.tsx` picks a page from the route in `route.ts`.
- `live/derive.ts` schedules the replay and works out rankings, heat and per-minute counts.
- `live/hooks.ts` gives React the live set (the live edits and their articles' previews), each article's
  full history, and the fetch toasts.
- `components/` renders it all.

## Development

You need Node.js, pnpm, prettier and the SpacetimeDB CLI (2.10). The `flake.nix` at the root of this
repository provides them all: run `direnv allow`, or `nix develop`.

### Running it locally

```bash
pnpm install
pnpm --dir spacetimedb install

# In another terminal: a local SpacetimeDB server on port 3000.
spacetime start

# Publish the module under the database name the client uses by default.
spacetime publish --server local wikiwatch-dev

# Serve the client at http://localhost:5173.
pnpm dev
```

Run `spacetime` commands from this directory. `spacetime.json` points them at the module in
`spacetimedb/`, and at Maincloud unless you pass `--server`, so pass `--server local` while developing.

Publishing starts the poller, and a fresh database back-fills the last hour, so the front page fills up
after the first poll. To follow the module's logs:

```bash
spacetime logs --server local wikiwatch-dev -f
```

### Identify yourself to Wikipedia

Put an email address or URL in `.env.local`, then store it in the database's `settings` table:

```bash
echo 'WIKIWATCH_CONTACT=you@example.com' >> .env.local
scripts/set-contact.sh wikiwatch-dev local
```

Until it's set, the module sends a generic SpacetimeDB address instead.

### Configuration

Settings live in `.env.local`, which is gitignored. With no `.env.local`, the client connects to the local
server above.

| Variable                   | Read by                   | Default               |
| -------------------------- | ------------------------- | --------------------- |
| `VITE_SPACETIMEDB_HOST`    | the client, at build time | `ws://localhost:3000` |
| `VITE_SPACETIMEDB_DB_NAME` | the client, at build time | `wikiwatch-dev`       |
| `SPACETIMEDB_HOST`         | `scripts/set-contact.sh`  | none                  |
| `SPACETIMEDB_DB_NAME`      | `scripts/set-contact.sh`  | none                  |
| `WIKIWATCH_CONTACT`        | `scripts/set-contact.sh`  | none                  |

The database and server arguments to `scripts/set-contact.sh` override `SPACETIMEDB_DB_NAME` and
`SPACETIMEDB_HOST`.

### Changing the module

The client's bindings in `src/module_bindings` are generated from the module and committed. After
changing a table, reducer or procedure, regenerate them and republish:

```bash
spacetime generate
prettier --write src/module_bindings
spacetime publish --server local wikiwatch-dev
```

`spacetime generate` takes the language and output directory from the generate target in
`spacetime.json`. Formatting the output with prettier matches the committed bindings, so the diff shows
only what really changed.

If existing data can't be migrated to the new schema, add `--delete-data=on-conflict` to the publish. A
column added to an existing table needs a `.default(...)`, as `edit.live` has, or the data can't migrate.

### Checking a change

There are no tests. To check that everything type-checks and is formatted:

```bash
pnpm build                              # the client: tsc -b && vite build
(cd spacetimedb && tsc --noEmit)        # the module
prettier --check src spacetimedb/src
```

`spacetime build` type-checks the module only when `spacetimedb/node_modules` is installed. Without it, it
prints "tsc not found" and still reports success.

## Deploying

[`docs/deploying.md`](docs/deploying.md) covers publishing the module to Maincloud, and building and
hosting the client on Vercel.
