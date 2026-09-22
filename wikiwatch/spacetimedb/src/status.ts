// How the fetchers report on themselves: their health in fetch_status, and what
// they're doing right now in the fetch_event event table.

import type { Uuid } from "spacetimedb";
import { STATUS_ID, type FetchActivity, type TxCtx } from "./schema";

export function sendFetchEvent(
  tx: TxCtx,
  fetch_id: Uuid,
  activity: FetchActivity,
) {
  tx.db.fetch_event.insert({ fetch_id, activity });
}

// The error itself goes to the module log and fetch_event. fetch_status only
// counts failed edit fetches, which is what tells clients the feed is stuck.
export function countEditsFailure(tx: TxCtx) {
  const status = tx.db.fetch_status.id.find(STATUS_ID);
  if (!status) return;
  tx.db.fetch_status.id.update({
    ...status,
    consecutive_failures: status.consecutive_failures + 1,
  });
}

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
