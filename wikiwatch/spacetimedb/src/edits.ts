// Edits: every RECENT_EDITS_INTERVAL (schedules.ts), fetch Wikipedia's
// recent changes into the edit table, and every EXPIRE_INTERVAL take aged edits
// out of the live set.
//
// The live set is the recent edits that clients subscribe to. Edits carry a
// `live` flag rather than clients filtering on time, so a single subscription
// stays LIVE_FOR deep, and rows leave client caches as they age without anyone
// resubscribing. Clients join previews to the live edits, so a page's preview
// leaves along with its last live edit.

import type { Timestamp } from "spacetimedb";
import { SenderError, t } from "spacetimedb/server";
import spacetimedb, {
  STATUS_ID,
  schedule_expire_old_edits,
  schedule_fetch_recent_edits,
  type TxCtx,
} from "./schema";
import { markArguments } from "./arguments";
import { countEditsFailure, errorMessage, sendFetchEvent } from "./status";
import { HOUR, MINUTE, compare, later, minus } from "./time";
import { queryRecentChanges, userAgent } from "./wikipedia";

// How long an edit stays live after it's made. Aged edits leave at the next
// expiry run, so a live edit can be up to LIVE_FOR + EXPIRE_INTERVAL
// (schedules.ts) old.
const LIVE_FOR = 15n * MINUTE;

// Recent changes can appear in the API slightly after their timestamp, so
// each fetch re-reads this much before the cursor. rc_id dedupes the overlap.
const FETCH_OVERLAP = MINUTE;
// After downtime, skip ahead rather than back-filling indefinitely.
const MAX_BACKFILL = HOUR;
// A fresh database starts with an hour of history for its article pages.
const INITIAL_BACKFILL = MAX_BACKFILL;
const MAX_RC_PAGES = 5;

// Procedures and reducers can be called by any client. This one makes
// outbound HTTP requests, so only the scheduler may run it.
export const fetchRecentEdits = spacetimedb.procedure(
  { onSchedule: schedule_fetch_recent_edits },
  { timer: schedule_fetch_recent_edits.rowType },
  t.unit(),
  (ctx) => {
    if (!ctx.sender.equals(ctx.databaseIdentity)) {
      throw new SenderError(
        "fetchRecentEdits may only be run by the scheduler",
      );
    }
    const agent = userAgent(ctx);
    const fetch_id = ctx.newUuidV7();
    const start = ctx.withTx((tx) => {
      const earliest = minus(tx.timestamp, MAX_BACKFILL);
      const since = later(minus(cursor(tx), FETCH_OVERLAP), earliest);
      sendFetchEvent(tx, fetch_id, { tag: "fetching_edits", value: { since } });
      return since;
    });

    let changes;
    try {
      changes = queryRecentChanges(ctx.http, agent, start, MAX_RC_PAGES);
    } catch (e) {
      const message = `recentchanges: ${errorMessage(e)}`;
      console.error(message);
      ctx.withTx((tx) => {
        countEditsFailure(tx);
        sendFetchEvent(tx, fetch_id, { tag: "edits_failed", value: message });
      });
      return {};
    }

    const inserted = ctx.withTx((tx) => {
      const status = tx.db.fetch_status.id.find(STATUS_ID);
      if (!status) return 0;

      let newest = status.cursor;
      let count = 0;
      // The pages that gained a revert, and so might now be an argument.
      const argued = new Set<bigint>();
      for (const change of changes) {
        newest = later(newest, change.edited_at);
        if (tx.db.edit.rc_id.find(change.rc_id)) continue;
        // Back-filled edits can arrive already too old to be live.
        tx.db.edit.insert({
          ...change,
          live: isLive(tx, change.edited_at),
          in_argument: false,
        });
        if (change.is_revert) argued.add(change.page_id);
        count++;
      }
      markArguments(tx, argued);

      tx.db.fetch_status.id.update({
        ...status,
        cursor: newest,
        last_success_at: tx.timestamp,
        consecutive_failures: 0,
        edits_ingested: status.edits_ingested + BigInt(count),
      });
      sendFetchEvent(tx, fetch_id, {
        tag: "fetched_edits",
        value: { received: changes.length, added: count },
      });
      return count;
    });

    if (inserted > 0) {
      console.info(`Ingested ${inserted} of ${changes.length} recent changes`);
    }
    return {};
  },
);

// The edits cursor, from the fetch_status row. A new database has no
// row until its first fetch creates one, starting INITIAL_BACKFILL back.
function cursor(tx: TxCtx): Timestamp {
  const status = tx.db.fetch_status.id.find(STATUS_ID);
  if (status) return status.cursor;

  const initial = minus(tx.timestamp, INITIAL_BACKFILL);
  tx.db.fetch_status.insert({
    id: STATUS_ID,
    cursor: initial,
    last_success_at: undefined,
    consecutive_failures: 0,
    edits_ingested: 0n,
  });
  return initial;
}

// Takes edits older than LIVE_FOR out of the live set. Subscribed clients
// receive each as a delete.
export const expireOldEdits = spacetimedb.reducer(
  { onSchedule: schedule_expire_old_edits },
  { timer: schedule_expire_old_edits.rowType },
  (ctx) => {
    if (!ctx.sender.equals(ctx.databaseIdentity)) {
      throw new SenderError("expireOldEdits may only be run by the scheduler");
    }
    const aged = [...ctx.db.edit.live.filter(true)].filter(
      (edit) => !isLive(ctx, edit.edited_at),
    );
    for (const edit of aged) {
      ctx.db.edit.rc_id.update({ ...edit, live: false });
    }

    console.info(`Expired ${aged.length} edits from the live set`);
  },
);

function isLive(tx: TxCtx, edited_at: Timestamp): boolean {
  return compare(edited_at, minus(tx.timestamp, LIVE_FOR)) >= 0;
}
