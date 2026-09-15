// Each scheduled process has a timer table of its own, holding one row that
// repeats at the process's interval.

import { ScheduleAt } from "spacetimedb";

type TimerRow = { scheduled_id: bigint; scheduled_at: ScheduleAt };

// The parts of a timer table's accessor (tx.db.*_timer) that this needs.
type TimerTable = {
  iter(): Iterable<TimerRow>;
  insert(row: TimerRow): TimerRow;
  delete(row: TimerRow): boolean;
};

// Leaves `timers` holding exactly one row, repeating every `interval`
// microseconds. Anything else is replaced: no row, more than one, or a row
// repeating at an interval set by an earlier version of the module.
export function ensureInterval(timers: TimerTable, interval: bigint) {
  const rows = [...timers.iter()];
  if (rows.length === 1 && repeatsEvery(rows[0], interval)) return;
  for (const row of rows) {
    timers.delete(row);
  }
  timers.insert({
    scheduled_id: 0n,
    scheduled_at: ScheduleAt.interval(interval),
  });
}

function repeatsEvery({ scheduled_at }: TimerRow, interval: bigint): boolean {
  return (
    scheduled_at.tag === "Interval" && scheduled_at.value.micros === interval
  );
}
