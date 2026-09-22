// Arguments: the pages where two editors keep reverting each other. Each
// revert of such a page carries in_argument, so the arguments page subscribes
// to those alone instead of to every revert the database still holds. Most
// reverts are a patroller undoing a vandal once, so that's the difference
// between a few hundred rows and a few thousand.
//
// Whether a revert is in an argument is a fact about its page, not about
// itself: in_argument(edit) = edit.is_revert && qualifies(edit.page_id). The
// three columns qualifies reads — is_revert, user_name and is_bot — are set
// when an edit is ingested and never updated, so a page's answer can only
// change when the set of reverts on it changes. That happens when edits.ts
// ingests a revert and when history.ts deletes an aged one, and both know
// which pages they touched. Nothing else has to be recomputed: expireOldEdits
// rewrites live on these same rows every few minutes, and that doesn't enter
// into it.

import { SenderError } from "spacetimedb/server";
import spacetimedb, { type Edit, type TxCtx } from "./schema";

// How often a side has to revert to count as arguing rather than as a
// patroller reverting a vandal who never reverts back. The client needs this
// too, to tell the two sides from everyone else (MIN_REVERTS_PER_SIDE in
// src/arguments.ts), so the two have to change together.
const MIN_REVERTS_PER_SIDE = 2;

// Brings in_argument up to date on every revert of each of `pageIds`. Cheap
// enough to call on ingest: a page holds at most a few dozen edits of the last
// 24 hours, and the page_id index reads only those.
export function markArguments(tx: TxCtx, pageIds: Iterable<bigint>) {
  for (const page_id of pageIds) {
    const reverts = [...tx.db.edit.page_id.filter(page_id)].filter(
      (edit) => edit.is_revert,
    );
    const arguing = qualifies(reverts);
    for (const edit of reverts) {
      // Writing a row a client is subscribed to sends it the row again, so
      // leave the ones that already say the right thing alone.
      if (edit.in_argument === arguing) continue;
      tx.db.edit.rc_id.update({ ...edit, in_argument: arguing });
    }
  }
}

// Whether a page's reverts amount to an argument: at least two editors, bots
// and hidden users aside, have each reverted it MIN_REVERTS_PER_SIDE times.
function qualifies(reverts: Edit[]): boolean {
  const counts = new Map<string, number>();
  for (const { user_name, is_bot } of reverts) {
    if (is_bot || !user_name) continue;
    counts.set(user_name, (counts.get(user_name) ?? 0) + 1);
  }
  let sides = 0;
  for (const count of counts.values()) {
    if (count >= MIN_REVERTS_PER_SIDE) sides++;
  }
  return sides >= 2;
}

// Recomputes in_argument across the whole database. Reverts ingested before
// this column existed default to false, and changing MIN_REVERTS_PER_SIDE
// leaves every flag stale, so an admin calls this once after either. Marking
// on ingest keeps it right from then on.
export const remarkArguments = spacetimedb.reducer((ctx) => {
  if (!ctx.db.user.identity.find(ctx.sender)?.admin) {
    throw new SenderError("remarkArguments may only be called by an admin");
  }
  const pages = new Set(
    [...ctx.db.edit.is_revert.filter(true)].map((edit) => edit.page_id),
  );
  markArguments(ctx, pages);

  console.info(`Remarked arguments across ${pages.size} pages with reverts`);
});
