// The live set: the recent edits that clients subscribe to. Edits carry a
// `live` flag rather than clients filtering on time, so a single subscription
// stays LIVE_FOR deep, and rows leave client caches as they age without anyone
// resubscribing. Clients join previews to the live edits, so a page's preview
// leaves along with its last live edit.

import { SenderError } from "spacetimedb/server";
import type { Timestamp } from "spacetimedb";
import spacetimedb, { sweep_timer, type TxCtx } from "./schema";
import { MINUTE, compare, minus } from "./time";
import { ensureInterval } from "./timers";

// How long an edit stays live after it's made.
const LIVE_FOR = 30n * MINUTE;

// How often edits past LIVE_FOR leave the live set. They stay until the next
// sweep, so a live edit can be up to LIVE_FOR + SWEEP_INTERVAL old.
const SWEEP_INTERVAL = 5n * MINUTE;

export function isLive(tx: TxCtx, edited_at: Timestamp): boolean {
  return compare(edited_at, minus(tx.timestamp, LIVE_FOR)) >= 0;
}

export function ensureSweeping(tx: TxCtx) {
  ensureInterval(tx.db.sweep_timer, SWEEP_INTERVAL);
}

// Takes edits older than LIVE_FOR out of the live set. Subscribed clients
// receive each as a delete.
export const sweepLiveSet = spacetimedb.reducer(
  { onSchedule: sweep_timer },
  { timer: sweep_timer.rowType },
  (ctx) => {
    if (!ctx.sender.equals(ctx.databaseIdentity)) {
      throw new SenderError("sweepLiveSet may only be run by the scheduler");
    }
    const aged = [...ctx.db.edit.live.filter(true)].filter(
      (edit) => !isLive(ctx, edit.edited_at),
    );
    for (const edit of aged) {
      ctx.db.edit.rc_id.update({ ...edit, live: false });
    }

    console.info(`Aged ${aged.length} edits out of the live set`);
  },
);
