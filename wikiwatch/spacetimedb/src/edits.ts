// Polling for edits: every POLL_INTERVAL (schedules.ts), fetch Wikipedia's
// recent changes into the edit table, and queue their articles for a preview
// (previews.ts).

import type { Timestamp } from "spacetimedb";
import { SenderError, t } from "spacetimedb/server";
import spacetimedb, {
  STATUS_ID,
  poll_timer,
  type ProcCtx,
  type TxCtx,
} from "./schema";
import { isLive } from "./live";
import { enqueuePreview } from "./previews";
import { errorMessage, logFetch, recordError } from "./status";
import { HOUR, MINUTE, later, minus } from "./time";
import { fetchRecentChanges, userAgent } from "./wikipedia";

// Recent changes can appear in the API slightly after their timestamp, so
// each poll re-reads this much before the cursor. rc_id dedupes the overlap.
const POLL_OVERLAP = MINUTE;
// After downtime, skip ahead rather than back-filling indefinitely.
const MAX_BACKFILL = HOUR;
// A fresh database starts with an hour of history for its article pages.
const INITIAL_BACKFILL = MAX_BACKFILL;
const MAX_RC_PAGES = 5;

// Procedures and reducers can be called by any client. This one makes
// outbound HTTP requests, so only the scheduler may run it.
export const pollRecentChanges = spacetimedb.procedure(
  { onSchedule: poll_timer },
  { timer: poll_timer.rowType },
  t.unit(),
  (ctx) => {
    if (!ctx.sender.equals(ctx.databaseIdentity)) {
      throw new SenderError(
        "pollRecentChanges may only be run by the scheduler",
      );
    }
    ingestRecentChanges(ctx);
    return {};
  },
);

function ingestRecentChanges(ctx: ProcCtx) {
  const agent = userAgent(ctx);
  const fetch_id = ctx.newUuidV7();
  const start = ctx.withTx((tx) => {
    const earliest = minus(tx.timestamp, MAX_BACKFILL);
    const since = later(minus(cursor(tx), POLL_OVERLAP), earliest);
    logFetch(tx, fetch_id, { tag: "fetching_edits", value: { since } });
    return since;
  });

  let changes;
  try {
    changes = fetchRecentChanges(ctx.http, agent, start, MAX_RC_PAGES);
  } catch (e) {
    const message = `recentchanges: ${errorMessage(e)}`;
    console.error(message);
    ctx.withTx((tx) => {
      recordError(tx, message, true);
      logFetch(tx, fetch_id, { tag: "edits_failed", value: message });
    });
    return;
  }

  const inserted = ctx.withTx((tx) => {
    const status = tx.db.poller_status.id.find(STATUS_ID);
    if (!status) return 0;

    let newest = status.cursor;
    let count = 0;
    for (const change of changes) {
      newest = later(newest, change.edited_at);
      if (tx.db.edit.rc_id.find(change.rc_id)) continue;
      // Back-filled edits can arrive already too old to be live.
      tx.db.edit.insert({ ...change, live: isLive(tx, change.edited_at) });
      enqueuePreview(tx, change.page_id, change.title);
      count++;
    }

    tx.db.poller_status.id.update({
      ...status,
      cursor: newest,
      last_success_at: tx.timestamp,
      consecutive_failures: 0,
      edits_ingested: status.edits_ingested + BigInt(count),
    });
    logFetch(tx, fetch_id, {
      tag: "fetched_edits",
      value: { received: changes.length, added: count },
    });
    return count;
  });

  if (inserted > 0) {
    console.info(`Ingested ${inserted} of ${changes.length} recent changes`);
  }
}

// The poll cursor, from the poller_status row. A new database has no row until
// its first poll creates one, starting INITIAL_BACKFILL back.
function cursor(tx: TxCtx): Timestamp {
  const status = tx.db.poller_status.id.find(STATUS_ID);
  if (status) return status.cursor;

  const initial = minus(tx.timestamp, INITIAL_BACKFILL);
  tx.db.poller_status.insert({
    id: STATUS_ID,
    cursor: initial,
    last_success_at: undefined,
    last_error: undefined,
    last_error_at: undefined,
    consecutive_failures: 0,
    edits_ingested: 0n,
  });
  return initial;
}
