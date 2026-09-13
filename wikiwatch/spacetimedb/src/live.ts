// The live set: the recent edits that clients subscribe to, and the previews
// of the pages they belong to. Rows carry a `live` flag rather than clients
// filtering on time, so a single subscription stays a few minutes deep, and
// rows leave client caches as they age without anyone resubscribing.

import { ScheduleAt, type Timestamp } from "spacetimedb";
import { coolPreview } from "./previews";
import type { TxCtx } from "./schema";
import { MINUTE, compare, minus } from "./time";

// How long an edit stays live after it's made.
const LIVE_FOR = 10n * MINUTE;

// How often edits past LIVE_FOR leave the live set. They stay until the next
// sweep, so a live edit can be up to LIVE_FOR + SWEEP_INTERVAL old.
const SWEEP_INTERVAL = 5n * MINUTE;

export function isLive(tx: TxCtx, edited_at: Timestamp): boolean {
  return compare(edited_at, minus(tx.timestamp, LIVE_FOR)) >= 0;
}

// init never runs again when a module is republished, so this is also called
// by the poller, to start sweeping databases created before the sweep existed.
export function ensureSweepTimer(tx: TxCtx) {
  if (tx.db.sweep_timer.count() > 0n) return;
  tx.db.sweep_timer.insert({
    scheduled_id: 0n,
    scheduled_at: ScheduleAt.interval(SWEEP_INTERVAL),
  });
}

// Takes edits older than LIVE_FOR out of the live set, along with the previews
// of pages left with no live edits. Subscribed clients receive each as a delete.
export function ageLiveSet(tx: TxCtx) {
  const aged = [...tx.db.edit.live.filter(true)].filter(
    (edit) => !isLive(tx, edit.edited_at),
  );
  const pages = new Set<bigint>();
  for (const edit of aged) {
    tx.db.edit.rc_id.update({ ...edit, live: false });
    pages.add(edit.page_id);
  }
  const cooled = [...pages].filter((page_id) => coolPreview(tx, page_id));

  console.info(
    `Aged ${aged.length} edits and ${cooled.length} previews out of the live set`,
  );
}
