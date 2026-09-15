// Pruning: every PRUNE_INTERVAL, delete edits older than RETENTION, and the
// previews of articles that have no edits left.

import { Range, SenderError } from "spacetimedb/server";
import { ScheduleAt } from "spacetimedb";
import spacetimedb, { prune_timer, type TxCtx } from "./schema";
import { hasEdits } from "./previews";
import { HOUR, minus } from "./time";

const PRUNE_INTERVAL = HOUR;

// How much history to keep.
const RETENTION = 24n * HOUR;

export function startPruning(tx: TxCtx) {
  tx.db.prune_timer.insert({
    scheduled_id: 0n,
    scheduled_at: ScheduleAt.interval(PRUNE_INTERVAL),
  });
}

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
    const pruned = prunePreviews(
      ctx,
      new Set(expired.map((row) => row.page_id)),
    );

    console.info(`Pruned ${expired.length} edits and ${pruned} previews`);
  },
);

// Deletes the previews of whichever of `page_ids` have no edits left. Returns
// how many it deleted.
function prunePreviews(tx: TxCtx, page_ids: Iterable<bigint>): number {
  let pruned = 0;
  for (const page_id of page_ids) {
    if (hasEdits(tx, page_id)) continue;
    if (tx.db.article_preview.page_id.delete(page_id)) pruned++;
  }
  return pruned;
}
