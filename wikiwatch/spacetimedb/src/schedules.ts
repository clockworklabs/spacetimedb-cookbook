// Every scheduled process's interval, and the timer rows that run it at that
// interval. init writes the timers when a database is created, but a
// republish doesn't run init. So after publishing a changed interval or a new
// scheduled process, an admin calls updateSchedulers to bring an existing
// database's timers in line with the module.

import { SenderError } from "spacetimedb/server";
import { ScheduleAt } from "spacetimedb";
import spacetimedb, { type TxCtx } from "./schema";
import { HOUR, MINUTE, SECOND } from "./time";

// pollRecentChanges (edits.ts).
const POLL_INTERVAL = 15n * SECOND;

// fetchArticlePreviews (previews.ts). Each run fetches one batch of
// PREVIEW_BATCH_SIZE (wikipedia.ts), so this sets how fast the queue drains.
const PREVIEW_INTERVAL = 5n * SECOND;

// sweepLiveSet (live.ts). Aged edits stay live until the next sweep, so a live
// edit can be up to LIVE_FOR + SWEEP_INTERVAL old.
const SWEEP_INTERVAL = 5n * MINUTE;

// pruneOldData (prune.ts).
const PRUNE_INTERVAL = HOUR;

export function applySchedulers(tx: TxCtx) {
  const written = [
    ensureInterval(tx.db.poll_timer, POLL_INTERVAL),
    ensureInterval(tx.db.preview_timer, PREVIEW_INTERVAL),
    ensureInterval(tx.db.sweep_timer, SWEEP_INTERVAL),
    ensureInterval(tx.db.prune_timer, PRUNE_INTERVAL),
  ];
  console.info(
    `Wrote ${written.filter(Boolean).length} of ${written.length} scheduler timers`,
  );
}

// Reducers can be called by any client, so this one checks for an admin.
export const updateSchedulers = spacetimedb.reducer((ctx) => {
  if (!ctx.db.admin.identity.find(ctx.sender)) {
    throw new SenderError("updateSchedulers may only be called by an admin");
  }
  applySchedulers(ctx);
});

type TimerRow = { scheduled_id: bigint; scheduled_at: ScheduleAt };

// The parts of a timer table's accessor (tx.db.*_timer) that this needs.
type TimerTable = {
  iter(): Iterable<TimerRow>;
  insert(row: TimerRow): TimerRow;
  delete(row: TimerRow): boolean;
};

// Leaves `timers` holding exactly one row, repeating every `interval`
// microseconds. Anything else is replaced: no row, more than one, or a row
// repeating at an interval set by an earlier version of the module. Returns
// whether it had to write.
function ensureInterval(timers: TimerTable, interval: bigint): boolean {
  const rows = [...timers.iter()];
  if (rows.length === 1 && repeatsEvery(rows[0], interval)) return false;
  for (const row of rows) {
    timers.delete(row);
  }
  timers.insert({
    scheduled_id: 0n,
    scheduled_at: ScheduleAt.interval(interval),
  });
  return true;
}

function repeatsEvery({ scheduled_at }: TimerRow, interval: bigint): boolean {
  return (
    scheduled_at.tag === "Interval" && scheduled_at.value.micros === interval
  );
}
