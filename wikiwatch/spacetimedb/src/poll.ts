// The poller: every POLL_INTERVAL, fetch Wikipedia's recent changes (edits.ts),
// then the previews their articles need (previews.ts).

import { SenderError, t } from "spacetimedb/server";
import { ScheduleAt } from "spacetimedb";
import spacetimedb, {
  SETTINGS_ID,
  STATUS_ID,
  poll_timer,
  type TxCtx,
} from "./schema";
import { INITIAL_BACKFILL, ingestRecentChanges } from "./edits";
import { ensureSweepTimer } from "./live";
import { ingestPreviews } from "./previews";
import { SECOND, minus } from "./time";
import { userAgent } from "./wikipedia";

const POLL_INTERVAL = 15n * SECOND;

export function startPolling(tx: TxCtx) {
  tx.db.poll_timer.insert({
    scheduled_id: 0n,
    scheduled_at: ScheduleAt.interval(POLL_INTERVAL),
  });
  tx.db.poller_status.insert({
    id: STATUS_ID,
    cursor: minus(tx.timestamp, INITIAL_BACKFILL),
    last_success_at: undefined,
    last_error: undefined,
    last_error_at: undefined,
    consecutive_failures: 0,
    edits_ingested: 0n,
  });
}

// Procedures and reducers can be called by any client. This one makes
// outbound HTTP requests, so only the scheduler may run it.
export const pollWikipedia = spacetimedb.procedure(
  { onSchedule: poll_timer },
  { timer: poll_timer.rowType },
  t.unit(),
  (ctx) => {
    if (!ctx.sender.equals(ctx.databaseIdentity)) {
      throw new SenderError("pollWikipedia may only be run by the scheduler");
    }
    const agent = ctx.withTx((tx) => {
      ensureSweepTimer(tx);
      return userAgent(tx.db.settings.id.find(SETTINGS_ID)?.wikipedia_contact);
    });
    ingestRecentChanges(ctx, agent);
    ingestPreviews(ctx, agent);
    return {};
  },
);
