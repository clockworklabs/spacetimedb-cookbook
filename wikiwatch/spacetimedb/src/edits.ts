// Pulling Wikipedia's recent changes into the edit table.

import type { ProcCtx } from "./schema";
import { enqueuePreview, touchPreview } from "./previews";
import { STATUS_ID, errorMessage, logFetch, recordError } from "./status";
import { HOUR, MINUTE, later, minus } from "./time";
import { fetchRecentChanges } from "./wikipedia";

// Recent changes can appear in the API slightly after their timestamp, so
// each poll re-reads this much before the cursor. rc_id dedupes the overlap.
const POLL_OVERLAP = MINUTE;
// After downtime, skip ahead rather than back-filling indefinitely.
const MAX_BACKFILL = HOUR;
// A fresh database fills a client's one-hour window straight away.
export const INITIAL_BACKFILL = MAX_BACKFILL;
const MAX_RC_PAGES = 5;

export function ingestRecentChanges(ctx: ProcCtx, agent: string) {
  const fetch_id = ctx.newUuidV7();
  const start = ctx.withTx((tx) => {
    const cursor = tx.db.poller_status.id.find(STATUS_ID)?.cursor;
    if (!cursor) return undefined;
    const earliest = minus(ctx.timestamp, MAX_BACKFILL);
    const since = later(minus(cursor, POLL_OVERLAP), earliest);
    logFetch(tx, fetch_id, { tag: "fetching_edits", value: { since } });
    return since;
  });
  if (!start) {
    console.error("poller_status row is missing; skipping poll");
    return;
  }

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
      tx.db.edit.insert(change);
      touchPreview(tx, change.page_id, change.edited_at);
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
