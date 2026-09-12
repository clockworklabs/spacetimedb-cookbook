// The module entry. Its named exports are what SpacetimeDB registers, so
// only lifecycle hooks, reducers and procedures live here; see edits.ts,
// previews.ts and status.ts for the work they do.

import { Range, SenderError, t } from "spacetimedb/server";
import { ScheduleAt } from "spacetimedb";
import spacetimedb, { poll_timer, prune_timer } from "./schema";
import { INITIAL_BACKFILL, ingestRecentChanges } from "./edits";
import { ingestPreviews } from "./previews";
import { STATUS_ID } from "./status";
import { HOUR, SECOND, minus } from "./time";
import { userAgent } from "./wikipedia";

export default spacetimedb;

const POLL_INTERVAL = 15n * SECOND;
const PRUNE_INTERVAL = HOUR;

// How much history to keep.
const RETENTION = 24n * HOUR;

const SETTINGS_ID = 0;

export const init = spacetimedb.init((ctx) => {
  ctx.db.poll_timer.insert({
    scheduled_id: 0n,
    scheduled_at: ScheduleAt.interval(POLL_INTERVAL),
  });
  ctx.db.prune_timer.insert({
    scheduled_id: 0n,
    scheduled_at: ScheduleAt.interval(PRUNE_INTERVAL),
  });
  ctx.db.poller_status.insert({
    id: STATUS_ID,
    cursor: minus(ctx.timestamp, INITIAL_BACKFILL),
    last_success_at: undefined,
    last_error: undefined,
    last_error_at: undefined,
    consecutive_failures: 0,
    edits_ingested: 0n,
  });
});

// Procedures and reducers can be called by any client. This one makes
// outbound HTTP requests, so only the scheduler may run it.
export const pollWikipedia = spacetimedb.procedure(
  { onSchedule: poll_timer },
  { timer: poll_timer.rowType },
  t.unit(),
  (ctx) => {
    if (!ctx.sender.equals(ctx.databaseIdentity)) {
      throw new SenderError("pollWikipedia may only be run by the scheduler");
    }
    const agent = ctx.withTx((tx) =>
      userAgent(tx.db.settings.id.find(SETTINGS_ID)?.wikipedia_contact),
    );
    ingestRecentChanges(ctx, agent);
    ingestPreviews(ctx, agent);
    return {};
  },
);

export const pruneOldData = spacetimedb.reducer(
  { onSchedule: prune_timer },
  { timer: prune_timer.rowType },
  (ctx) => {
    if (!ctx.sender.equals(ctx.databaseIdentity)) {
      throw new SenderError("pruneOldData may only be run by the scheduler");
    }
    const cutoff = minus(ctx.timestamp, RETENTION);
    const expired = [
      ...ctx.db.edit.edited_at.filter(
        new Range({ tag: "unbounded" }, { tag: "excluded", value: cutoff }),
      ),
    ];
    for (const row of expired) {
      ctx.db.edit.rc_id.delete(row.rc_id);
    }

    const cold = [
      ...ctx.db.article_preview.last_edited_at.filter(
        new Range({ tag: "unbounded" }, { tag: "excluded", value: cutoff }),
      ),
    ];
    for (const preview of cold) {
      ctx.db.article_preview.page_id.delete(preview.page_id);
    }

    console.info(`Pruned ${expired.length} edits and ${cold.length} previews`);
  },
);
