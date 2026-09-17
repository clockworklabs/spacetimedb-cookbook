// Every table in the module, the types stored in them, and the context types
// that code reads and writes them through.

import {
  schema,
  table,
  t,
  type Infer,
  type InferSchema,
  type ProcedureCtx,
  type ReducerCtx,
} from "spacetimedb/server";

// One row per Wikipedia recent-change (edits and page creations, articles
// only). Keyed by Wikipedia's own rcid, so re-fetching an overlapping window
// is harmless.
export const edit = table(
  { public: true },
  {
    rc_id: t.u64().primaryKey(),
    page_id: t.u64().index("btree"),
    rev_id: t.u64(),
    // 0 when the page was created by this change.
    old_rev_id: t.u64(),
    title: t.string(),
    user_name: t.string(),
    is_bot: t.bool(),
    is_minor: t.bool(),
    is_new: t.bool(),
    // A temporary (logged-out) account.
    is_temp: t.bool(),
    is_redirect: t.bool(),
    old_len: t.u32(),
    new_len: t.u32(),
    // The raw edit summary, not MediaWiki's rendered HTML.
    comment: t.string(),
    tags: t.array(t.string()),
    edited_at: t.timestamp().index("btree"),
    // Whether the edit is in the live set that clients subscribe to: made
    // within LIVE_FOR, give or take an expiry run (see edits.ts).
    live: t.bool().default(false).index("btree"),
    // Whether the edit undoes earlier edits, going by its tags. Indexed so the
    // arguments page can subscribe to reverts alone.
    is_revert: t.bool().default(false).index("btree"),
  },
);
export type Edit = Infer<typeof edit.rowType>;

// An article's image, with the credit its licence asks for. Only stored when
// Wikipedia says what the licence is.
const Thumbnail = t.object("Thumbnail", {
  url: t.string(),
  width: t.u32(),
  height: t.u32(),
  // The image's own page, which has its full licence and source.
  file_page_url: t.string(),
  // Short, like "CC BY-SA 4.0" or "Fair use".
  license: t.string(),
  // As plain text. Wikipedia often has no author for non-free images.
  artist: t.option(t.string()),
});
export type Thumbnail = Infer<typeof Thumbnail>;

// The hover-card data for an article. Keyed by page id, which survives
// renames where titles don't. Clients subscribe to the previews of the live
// set by joining this to the live edits on page_id.
export const article_preview = table(
  { public: true },
  {
    page_id: t.u64().primaryKey(),
    title: t.string(),
    description: t.option(t.string()),
    // The article's opening sentences, as plain text. (Not called `extract`:
    // that's an SQL keyword and breaks queries that name the column.)
    summary: t.string(),
    thumbnail: t.option(Thumbnail),
    fetched_at: t.timestamp(),
  },
);

// Pages that Wikipedia hasn't given a preview for. The preview fetcher works
// out which pages need a preview from the edits and previews already stored,
// but it can't work out which ones it has failed at, so those are kept here to
// stop it asking again forever.
export const preview_failure = table(
  {},
  {
    page_id: t.u64().primaryKey(),
    attempts: t.u8(),
  },
);

// Singleton (id = STATUS_ID) describing the health of the Wikipedia fetchers.
export const fetch_status = table(
  { public: true },
  {
    id: t.u8().primaryKey(),
    // Newest edited_at seen; the next fetch of recent changes starts a little before this.
    cursor: t.timestamp(),
    last_success_at: t.option(t.timestamp()),
    consecutive_failures: t.u32(),
    edits_ingested: t.u64(),
  },
);
export const STATUS_ID = 0;

// Operator settings (one row, id = SETTINGS_ID). Private, so only the database
// owner can read or change them, with `spacetime sql`; see
// scripts/set-contact.sh.
export const settings = table(
  {},
  {
    id: t.u8().primaryKey(),
    // An email address or URL for Wikipedia's User-Agent policy. Kept in the
    // database so personal details stay out of the source.
    wikipedia_contact: t.string(),
  },
);
export const SETTINGS_ID = 0;

// The identities the module knows about. Admins may call admin reducers, such
// as updateSchedulers. init adds whoever published the database, as an admin.
// Private, so only the database owner can add more, with `spacetime sql`.
export const user = table(
  {},
  {
    identity: t.identity().primaryKey(),
    admin: t.bool(),
  },
);

// A page a preview fetch asks for. Carries the id as well as the title, so
// clients can link to the page they're told about.
const PreviewPage = t.object("PreviewPage", {
  page_id: t.u64(),
  title: t.string(),
});
export type PreviewPage = Infer<typeof PreviewPage>;

// What a fetcher is doing. Each fetch sends a `fetching_*` row when it starts
// and a `fetched_*` or `*_failed` row when it ends.
const FetchActivity = t.enum("FetchActivity", {
  fetching_edits: t.object("FetchingEdits", { since: t.timestamp() }),
  fetched_edits: t.object("FetchedEdits", {
    received: t.u32(),
    added: t.u32(),
  }),
  edits_failed: t.string(),
  fetching_previews: t.object("FetchingPreviews", {
    pages: t.array(PreviewPage),
  }),
  fetched_previews: t.object("FetchedPreviews", {
    stored: t.u32(),
    missing: t.u32(),
  }),
  previews_failed: t.string(),
});
export type FetchActivity = Infer<typeof FetchActivity>;

// Live fetcher activity for clients to display. An event table: rows are
// broadcast to subscribers when their transaction commits, and never stored.
export const fetch_event = table(
  { public: true, event: true },
  {
    // Shared by a fetch's start and end rows, so clients can pair them.
    fetch_id: t.uuid(),
    activity: FetchActivity,
  },
);

// The schedules. fetchRecentEdits and expireOldEdits (edits.ts),
// fetchArticlePreviews (previews.ts) and deleteOldHistory (history.ts) each name
// their timer with `onSchedule`. The rows, and the intervals they repeat at,
// are written by schedules.ts.
export const schedule_fetch_recent_edits = table(
  {},
  {
    scheduled_id: t.u64().primaryKey().autoInc(),
    scheduled_at: t.scheduleAt(),
  },
);

export const schedule_fetch_article_previews = table(
  {},
  {
    scheduled_id: t.u64().primaryKey().autoInc(),
    scheduled_at: t.scheduleAt(),
  },
);

export const schedule_expire_old_edits = table(
  {},
  {
    scheduled_id: t.u64().primaryKey().autoInc(),
    scheduled_at: t.scheduleAt(),
  },
);

export const schedule_delete_old_history = table(
  {},
  {
    scheduled_id: t.u64().primaryKey().autoInc(),
    scheduled_at: t.scheduleAt(),
  },
);

const spacetimedb = schema({
  edit,
  article_preview,
  preview_failure,
  fetch_status,
  settings,
  user,
  fetch_event,
  schedule_fetch_recent_edits,
  schedule_fetch_article_previews,
  schedule_expire_old_edits,
  schedule_delete_old_history,
});
export default spacetimedb;

type Schema = InferSchema<typeof spacetimedb>;
export type TxCtx = ReducerCtx<Schema>;
export type ProcCtx = ProcedureCtx<Schema>;
