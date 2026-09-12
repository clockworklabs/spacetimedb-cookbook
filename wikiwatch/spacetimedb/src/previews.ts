// Article previews: queueing pages that need one, fetching them in batches,
// and keeping each preview's last_edited_at current.

import type { Timestamp } from "spacetimedb";
import type { ProcCtx, TxCtx } from "./schema";
import { errorMessage, logFetch, recordError } from "./status";
import { HOUR, compare, later, minus } from "./time";
import {
  PREVIEW_BATCH_SIZE,
  fetchPreviews,
  type PagePreview,
} from "./wikipedia";

// How long a preview stays fresh.
const PREVIEW_MAX_AGE = 24n * HOUR;

const PREVIEW_BATCHES_PER_TICK = 3;
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

export function touchPreview(tx: TxCtx, page_id: bigint, edited_at: Timestamp) {
  const preview = tx.db.article_preview.page_id.find(page_id);
  if (preview && compare(edited_at, preview.last_edited_at) > 0) {
    tx.db.article_preview.page_id.update({
      ...preview,
      last_edited_at: edited_at,
    });
  }
}

export function ingestPreviews(ctx: ProcCtx, agent: string) {
  const batches = ctx.withTx((tx) => {
    const oldestFirst = [...tx.db.preview_queue.iter()]
      .sort((a, b) => compare(a.enqueued_at, b.enqueued_at))
      .slice(0, PREVIEW_BATCH_SIZE * PREVIEW_BATCHES_PER_TICK);
    return chunk(oldestFirst, PREVIEW_BATCH_SIZE);
  });

  for (const batch of batches) {
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
      // Wikipedia is struggling; count the attempt and try again next tick.
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
}

// Returns how many previews were stored; the rest were missing pages.
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
    if (preview.missing) continue;
    stored++;

    const existing = tx.db.article_preview.page_id.find(preview.page_id);
    const row = {
      page_id: preview.page_id,
      title: preview.title,
      description: preview.description,
      summary: preview.summary,
      thumbnail: preview.thumbnail,
      fetched_at: tx.timestamp,
      last_edited_at:
        latestEdit(tx, preview.page_id) ??
        existing?.last_edited_at ??
        tx.timestamp,
    };
    if (existing) {
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

function latestEdit(tx: TxCtx, page_id: bigint): Timestamp | undefined {
  let latest: Timestamp | undefined;
  for (const edit of tx.db.edit.page_id.filter(page_id)) {
    latest = latest ? later(latest, edit.edited_at) : edit.edited_at;
  }
  return latest;
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

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}
