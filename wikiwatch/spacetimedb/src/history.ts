// History: every DELETE_INTERVAL (schedules.ts), delete edits older than
// RETENTION, and the previews and preview failures of articles that have no
// edits left.

import { Range, SenderError } from "spacetimedb/server";
import spacetimedb, { delete_timer, type TxCtx } from "./schema";
import { HOUR, minus } from "./time";

// How much history to keep.
const RETENTION = 24n * HOUR;

export const deleteOldHistory = spacetimedb.reducer(
  { onSchedule: delete_timer },
  { timer: delete_timer.rowType },
  (ctx) => {
    if (!ctx.sender.equals(ctx.databaseIdentity)) {
      throw new SenderError(
        "deleteOldHistory may only be run by the scheduler",
      );
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
    const deleted = deleteOrphanedPreviews(
      ctx,
      new Set(expired.map((row) => row.page_id)),
    );

    console.info(`Deleted ${expired.length} edits and ${deleted} previews`);
  },
);

// Deletes the previews and preview failures of whichever of `page_ids` have no
// edits left. Returns how many previews it deleted.
function deleteOrphanedPreviews(tx: TxCtx, page_ids: Iterable<bigint>): number {
  let deleted = 0;
  for (const page_id of page_ids) {
    if (hasEdits(tx, page_id)) continue;
    tx.db.preview_failure.page_id.delete(page_id);
    if (tx.db.article_preview.page_id.delete(page_id)) deleted++;
  }
  return deleted;
}

function hasEdits(tx: TxCtx, page_id: bigint): boolean {
  return [...tx.db.edit.page_id.filter(page_id)].length > 0;
}
