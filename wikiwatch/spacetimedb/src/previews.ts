// Article previews: queueing pages that need one, fetching them in batches,
// and moving each one in and out of the live set with its page's edits.

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

// Keeps a preview in step with a new edit to its page. A live edit makes the
// preview live, and from then on it's left alone until coolPreview takes it
// out again. Clients subscribe to live previews and are sent every rewrite of
// one, so updating last_edited_at here would resend a busy article's preview
// with each of its edits.
export function touchPreview(
  tx: TxCtx,
  page_id: bigint,
  edited_at: Timestamp,
  live: boolean,
) {
  const preview = tx.db.article_preview.page_id.find(page_id);
  if (!preview || preview.live) return;
  const newer = compare(edited_at, preview.last_edited_at) > 0;
  if (!live && !newer) return;
  tx.db.article_preview.page_id.update({
    ...preview,
    live,
    last_edited_at: newer ? edited_at : preview.last_edited_at,
  });
}

// Takes a preview out of the live set once its page has no live edits left,
// catching up the last_edited_at that touchPreview left alone meanwhile.
// Returns whether it did.
export function coolPreview(tx: TxCtx, page_id: bigint): boolean {
  const preview = tx.db.article_preview.page_id.find(page_id);
  if (!preview?.live) return false;
  const edits = [...tx.db.edit.page_id.filter(page_id)];
  if (edits.some((edit) => edit.live)) return false;
  tx.db.article_preview.page_id.update({
    ...preview,
    live: false,
    last_edited_at: latestEdit(edits) ?? preview.last_edited_at,
  });
  return true;
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
    const edits = [...tx.db.edit.page_id.filter(preview.page_id)];
    const row = {
      page_id: preview.page_id,
      title: preview.title,
      description: preview.description,
      summary: preview.summary,
      thumbnail: preview.thumbnail,
      fetched_at: tx.timestamp,
      last_edited_at:
        latestEdit(edits) ?? existing?.last_edited_at ?? tx.timestamp,
      live: edits.some((edit) => edit.live),
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

function latestEdit(edits: { edited_at: Timestamp }[]): Timestamp | undefined {
  let latest: Timestamp | undefined;
  for (const edit of edits) {
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
