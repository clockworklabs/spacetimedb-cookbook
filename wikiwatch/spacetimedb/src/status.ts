// How the poller reports on itself: its health in poller_status, and what
// it's doing right now in the fetch_log event table.

import type { Infer } from "spacetimedb/server";
import type { Uuid } from "spacetimedb";
import { fetch_log, type TxCtx } from "./schema";

export const STATUS_ID = 0;
const MAX_ERROR_LENGTH = 500;

export function logFetch(
  tx: TxCtx,
  fetch_id: Uuid,
  activity: Infer<typeof fetch_log.rowType>["activity"],
) {
  tx.db.fetch_log.insert({ fetch_id, activity });
}

export function recordError(
  tx: TxCtx,
  message: string,
  isPollFailure: boolean,
) {
  const status = tx.db.poller_status.id.find(STATUS_ID);
  if (!status) return;
  tx.db.poller_status.id.update({
    ...status,
    last_error: message.slice(0, MAX_ERROR_LENGTH),
    last_error_at: tx.timestamp,
    consecutive_failures: status.consecutive_failures + (isPollFailure ? 1 : 0),
  });
}

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
