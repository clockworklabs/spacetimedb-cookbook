# wikiwatch

A live view of what's being edited on English Wikipedia right now.

A SpacetimeDB module polls Wikipedia's recent changes every 15 seconds, and keeps the last 24 hours of
article edits along with a preview of each article. A React client subscribes to those tables and shows
which articles are busiest.

## What you see

- **The front page** ranks the most active articles of the last 30 minutes, with recent edits counting
  most. Each article has a trail of its edits across those minutes: additions rise above the line,
  removals drop below it. Alongside are a per-minute pulse of edit volume, a ticker of the latest
  edits, and a toggle to hide bot edits. The page replays edits 30 seconds behind real time, which turns
  the poller's 15-second bursts back into a steady stream.
- **Article pages** (`#/article/<page id>`) show an article's summary and thumbnail, and every edit to
  it that the server still holds, as soon as each one arrives.
- **Toasts** report what the server's Wikipedia fetchers are doing, and when they fail.

## Running it locally

You need Node.js, pnpm, prettier and the SpacetimeDB CLI (2.10). The `flake.nix` at the root of this
repository provides them all: run `direnv allow`, or `nix develop`.

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

Run `spacetime` commands from this directory: `spacetime.json` points them at the module in
`spacetimedb/`, and at Maincloud unless you pass `--server`.

Publishing starts the poller, and a fresh database back-fills the last hour, so the front page fills up
after the first poll.

### Identify yourself to Wikipedia

Wikimedia's [User-Agent policy][ua-policy] asks API clients for contact details. Put an email address or
URL in `.env.local`, then store it in the database's private `settings` table:

```bash
echo 'WIKIWATCH_CONTACT=you@example.com' >> .env.local
scripts/set-contact.sh wikiwatch-dev local
```

That keeps the contact out of the source, the module bundle and version control. Until it's set, the
module sends a generic SpacetimeDB address instead.

[ua-policy]: https://foundation.wikimedia.org/wiki/Policy:Wikimedia_Foundation_User-Agent_Policy

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

## Changing the module

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

If existing data can't be migrated to the new schema, add `--delete-data=on-conflict` to the publish.

## Deploying

```bash
spacetime login
spacetime publish <database name>   # the module, to Maincloud
pnpm build                          # the client, into dist/
```

Set `VITE_SPACETIMEDB_HOST` (`wss://maincloud.spacetimedb.com`) and `VITE_SPACETIMEDB_DB_NAME` before
building. Routes live in the URL fragment, so any static host can serve `dist/` as it is.

## How it works

### The module (`spacetimedb/src`)

| File           | What it does                                                                            |
| -------------- | --------------------------------------------------------------------------------------- |
| `index.ts`     | The entry: `init`, and the scheduled `pollWikipedia`, `sweepLiveSet` and `pruneOldData` |
| `schema.ts`    | The tables                                                                              |
| `wikipedia.ts` | A small client for the MediaWiki Action API                                             |
| `edits.ts`     | Ingests recent changes into the `edit` table                                            |
| `previews.ts`  | Queues, fetches and stores article previews                                             |
| `live.ts`      | Ages edits and previews out of the live set that clients subscribe to                   |
| `status.ts`    | Records the poller's health in `poller_status` and its activity in `fetch_log`          |
| `time.ts`      | Timestamp arithmetic                                                                    |

Every 15 seconds, `pollWikipedia` asks for article edits and page creations since its cursor. It re-reads
a minute before the cursor, because changes can reach the API slightly after their timestamps, and
Wikipedia's `rcid` removes the duplicates. After downtime it skips ahead rather than back-filling more
than an hour. Each new edit queues its article for a preview, and the same run fetches up to three
batches of twenty, giving up on a page after three failed attempts. It makes HTTP requests, so it's a
procedure, and it refuses to run for anyone but the scheduler.

Edits and previews carry a `live` flag, and clients subscribe to the live rows only. A new edit is live,
and so is its article's preview. Every five minutes, `sweepLiveSet` clears the flag on edits more than
30 minutes old, and on the previews of articles left with no live edits. Subscribed clients see each
one leave as a delete, so their caches stay about half an hour deep without resubscribing. Clients are sent
every change to a live row, so a live preview isn't rewritten as its article's edits arrive: its
`last_edited_at` catches up when it leaves the live set.

Every hour, `pruneOldData` deletes edits older than 24 hours, and the previews of articles nobody has
edited in that time.

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
- `live/hooks.ts` gives React the live set (the edits and previews the server keeps live, through
  `useTable`), each article's full history, and the fetch toasts.
- `components/` renders it all.
