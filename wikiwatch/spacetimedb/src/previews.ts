// Article previews: every PREVIEW_INTERVAL (schedules.ts), fetch the oldest
// batch of pages waiting in preview_queue. Polling for edits (edits.ts) fills
// the queue. Clients get the previews that go with the live set by joining
// them to the live edits, so nothing here tracks which previews are live.

import { SenderError, t } from "spacetimedb/server";
import spacetimedb, { preview_timer, type ProcCtx, type TxCtx } from "./schema";
import { errorMessage, logFetch, recordError } from "./status";
import { HOUR, compare, minus } from "./time";
import {
  PREVIEW_BATCH_SIZE,
  fetchPreviews,
  userAgent,
  type PagePreview,
} from "./wikipedia";

// How long a preview stays fresh.
const PREVIEW_MAX_AGE = 24n * HOUR;

const MAX_PREVIEW_ATTEMPTS = 3;

export function enqueuePreview(tx: TxCtx, page_id: bigint, title: string) {
  if (page_id === 0n) return;
  if (tx.db.preview_queue.page_id.find(page_id)) return;

  const existing = tx.db.article_preview.page_id.find(page_id);
  if (
    existing &&
    compare(existing.fetched_at, minus(tx.timestamp, PREVIEW_MAX_AGE)) > 0
  ) {
    return;
  }

  tx.db.preview_queue.insert({
    page_id,
    title,
    attempts: 0,
    enqueued_at: tx.timestamp,
  });
}

// Procedures and reducers can be called by any client. This one makes
// outbound HTTP requests, so only the scheduler may run it.
export const fetchArticlePreviews = spacetimedb.procedure(
  { onSchedule: preview_timer },
  { timer: preview_timer.rowType },
  t.unit(),
  (ctx) => {
    if (!ctx.sender.equals(ctx.databaseIdentity)) {
      throw new SenderError(
        "fetchArticlePreviews may only be run by the scheduler",
      );
    }
    ingestPreviews(ctx);
    return {};
  },
);

function ingestPreviews(ctx: ProcCtx) {
  const batch = ctx.withTx((tx) =>
    [...tx.db.preview_queue.iter()]
      .sort((a, b) => compare(a.enqueued_at, b.enqueued_at))
      .slice(0, PREVIEW_BATCH_SIZE),
  );
  if (batch.length === 0) return;

  const agent = userAgent(ctx);
  const fetch_id = ctx.newUuidV7();
  const pageIds = batch.map((entry) => entry.page_id);
  ctx.withTx((tx) =>
    logFetch(tx, fetch_id, {
      tag: "fetching_previews",
      value: {
        pages: batch.map(({ page_id, title }) => ({ page_id, title })),
      },
    }),
  );

  let previews;
  try {
    previews = fetchPreviews(ctx.http, agent, pageIds);
  } catch (e) {
    // Wikipedia is struggling; count the attempt and try again next time.
    const message = `previews: ${errorMessage(e)}`;
    console.error(message);
    ctx.withTx((tx) => {
      pageIds.forEach((id) => recordPreviewAttempt(tx, id));
      recordError(tx, message, false);
      logFetch(tx, fetch_id, { tag: "previews_failed", value: message });
    });
    return;
  }
  ctx.withTx((tx) => {
    const stored = storePreviews(tx, pageIds, previews);
    logFetch(tx, fetch_id, {
      tag: "fetched_previews",
      value: { stored, missing: previews.length - stored },
    });
  });
}

// Whether any of a page's edits are still kept. Pruning may have deleted them.
export function hasEdits(tx: TxCtx, page_id: bigint): boolean {
  return [...tx.db.edit.page_id.filter(page_id)].length > 0;
}

// Returns how many previews were stored. The rest were missing pages, or pages
// whose edits were all pruned while they waited in the queue: pruning only
// looks at pages as their edits go, so it would never find those.
function storePreviews(
  tx: TxCtx,
  requested: bigint[],
  previews: PagePreview[],
): number {
  const answered = new Set<bigint>();
  let stored = 0;
  for (const preview of previews) {
    answered.add(preview.page_id);
    tx.db.preview_queue.page_id.delete(preview.page_id);
    if (preview.missing || !hasEdits(tx, preview.page_id)) continue;
    stored++;

    const row = {
      page_id: preview.page_id,
      title: preview.title,
      description: preview.description,
      summary: preview.summary,
      thumbnail: preview.thumbnail,
      fetched_at: tx.timestamp,
    };
    if (tx.db.article_preview.page_id.find(preview.page_id)) {
      tx.db.article_preview.page_id.update(row);
    } else {
      tx.db.article_preview.insert(row);
    }
  }

  requested
    .filter((id) => !answered.has(id))
    .forEach((id) => recordPreviewAttempt(tx, id));
  return stored;
}

function recordPreviewAttempt(tx: TxCtx, page_id: bigint) {
  const entry = tx.db.preview_queue.page_id.find(page_id);
  if (!entry) return;
  if (entry.attempts + 1 >= MAX_PREVIEW_ATTEMPTS) {
    tx.db.preview_queue.page_id.delete(page_id);
  } else {
    tx.db.preview_queue.page_id.update({
      ...entry,
      attempts: entry.attempts + 1,
    });
  }
}
