// The poller: every POLL_INTERVAL (schedules.ts), fetch Wikipedia's recent
// changes (edits.ts), then the previews their articles need (previews.ts).

import { SenderError, t } from "spacetimedb/server";
import spacetimedb, { SETTINGS_ID, poll_timer } from "./schema";
import { ingestRecentChanges } from "./edits";
import { ingestPreviews } from "./previews";
import { userAgent } from "./wikipedia";

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
    const agent = ctx.withTx((tx) =>
      userAgent(tx.db.settings.id.find(SETTINGS_ID)?.wikipedia_contact),
    );
    ingestRecentChanges(ctx, agent);
    ingestPreviews(ctx, agent);
    return {};
  },
);
