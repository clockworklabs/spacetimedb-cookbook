import { schema, table, t } from "spacetimedb/server";

// One row per Wikipedia recent-change (edits and page creations, articles
// only). Keyed by Wikipedia's own rcid, so re-fetching an overlapping window
// is harmless.
export const edit = table(
  { name: "edit", public: true },
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
  },
);

const Thumbnail = t.object("Thumbnail", {
  url: t.string(),
  width: t.u32(),
  height: t.u32(),
});

// The hover-card data for an article. Keyed by page id, which survives
// renames where titles don't.
export const article_preview = table(
  { name: "article_preview", public: true },
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

// Pages waiting for a preview fetch. Lets a failed fetch be retried on the
// next tick instead of being lost between the procedure's transactions.
export const preview_queue = table(
  { name: "preview_queue" },
  {
    page_id: t.u64().primaryKey(),
    title: t.string(),
    attempts: t.u8(),
    enqueued_at: t.timestamp(),
  },
);

// Singleton (id = 0) describing the health of the Wikipedia poller.
export const poller_status = table(
  { name: "poller_status", public: true },
  {
    id: t.u8().primaryKey(),
    // Newest edited_at seen; the next poll starts a little before this.
    cursor: t.timestamp(),
    last_success_at: t.option(t.timestamp()),
    last_error: t.option(t.string()),
    last_error_at: t.option(t.timestamp()),
    consecutive_failures: t.u32(),
    edits_ingested: t.u64(),
  },
);

export const poll_timer = table(
  { name: "poll_timer" },
  {
    scheduled_id: t.u64().primaryKey().autoInc(),
    scheduled_at: t.scheduleAt(),
  },
);

export const prune_timer = table(
  { name: "prune_timer" },
  {
    scheduled_id: t.u64().primaryKey().autoInc(),
    scheduled_at: t.scheduleAt(),
  },
);

const spacetimedb = schema({
  edit,
  article_preview,
  preview_queue,
  poller_status,
  poll_timer,
  prune_timer,
});
export default spacetimedb;
