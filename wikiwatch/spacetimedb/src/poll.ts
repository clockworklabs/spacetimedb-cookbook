// The poller: every POLL_INTERVAL, fetch Wikipedia's recent changes (edits.ts),
// then the previews their articles need (previews.ts).

import { SenderError, t } from "spacetimedb/server";
import spacetimedb, {
  SETTINGS_ID,
  STATUS_ID,
  poll_timer,
  type TxCtx,
} from "./schema";
import { INITIAL_BACKFILL, ingestRecentChanges } from "./edits";
import { ensureSweeping } from "./live";
import { ingestPreviews } from "./previews";
import { ensurePruning } from "./prune";
import { SECOND, minus } from "./time";
import { ensureInterval } from "./timers";
import { userAgent } from "./wikipedia";

const POLL_INTERVAL = 15n * SECOND;

// Brings every scheduled process's timer in line with the module. init runs
// only when a database is created, not when a module is republished, so every
// poll calls this too. A new process's timer, or a changed interval, reaches
// an existing database within one poll.
export function ensureSchedules(tx: TxCtx) {
  ensurePolling(tx);
  ensureSweeping(tx);
  ensurePruning(tx);
}

function ensurePolling(tx: TxCtx) {
  ensureInterval(tx.db.poll_timer, POLL_INTERVAL);
  if (tx.db.poller_status.id.find(STATUS_ID)) return;
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
      ensureSchedules(tx);
      return userAgent(tx.db.settings.id.find(SETTINGS_ID)?.wikipedia_contact);
    });
    ingestRecentChanges(ctx, agent);
    ingestPreviews(ctx, agent);
    return {};
  },
);
