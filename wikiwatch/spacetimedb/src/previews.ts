// Article previews: every PREVIEW_INTERVAL (schedules.ts), fetch a batch of
// the previews that the live edits are missing. Nothing hands this process its
// work: it works it out from the edit and article_preview tables, so polling
// for edits (edits.ts) needn't know that previews exist. Clients get the
// previews that go with the live set by joining them to the live edits, so
// nothing here tracks which previews are live either.

import { SenderError, t } from "spacetimedb/server";
import spacetimedb, {
  preview_timer,
  type PreviewPage,
  type ProcCtx,
  type TxCtx,
} from "./schema";
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
  const pages = ctx.withTx(pagesNeedingPreviews);
  if (pages.length === 0) return;

  const agent = userAgent(ctx);
  const fetch_id = ctx.newUuidV7();
  const pageIds = pages.map((page) => page.page_id);
  ctx.withTx((tx) =>
    logFetch(tx, fetch_id, { tag: "fetching_previews", value: { pages } }),
  );

  let previews;
  try {
    previews = fetchPreviews(ctx.http, agent, pageIds);
  } catch (e) {
    // Wikipedia is struggling; count the attempt and try again next time.
    const message = `previews: ${errorMessage(e)}`;
    console.error(message);
    ctx.withTx((tx) => {
      pageIds.forEach((id) => recordFailure(tx, id));
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

// Up to a batch of the pages with live edits that need a preview. Most
// recently edited first, so the articles clients are showing right now come
// first.
function pagesNeedingPreviews(tx: TxCtx): PreviewPage[] {
  const newestFirst = [...tx.db.edit.live.filter(true)].sort((a, b) =>
    compare(b.edited_at, a.edited_at),
  );
  const pages = new Map<bigint, PreviewPage>();
  for (const { page_id, title } of newestFirst) {
    if (pages.size === PREVIEW_BATCH_SIZE) break;
    if (page_id === 0n || pages.has(page_id)) continue;
    if (needsPreview(tx, page_id)) pages.set(page_id, { page_id, title });
  }
  return [...pages.values()];
}

// A page needs a preview unless it has a fresh one, or Wikipedia has already
// failed to give it one MAX_PREVIEW_ATTEMPTS times.
function needsPreview(tx: TxCtx, page_id: bigint): boolean {
  const preview = tx.db.article_preview.page_id.find(page_id);
  if (
    preview &&
    compare(preview.fetched_at, minus(tx.timestamp, PREVIEW_MAX_AGE)) > 0
  ) {
    return false;
  }
  const failure = tx.db.preview_failure.page_id.find(page_id);
  return !failure || failure.attempts < MAX_PREVIEW_ATTEMPTS;
}

// Returns how many previews were stored. The rest were for missing pages.
function storePreviews(
  tx: TxCtx,
  requested: bigint[],
  previews: PagePreview[],
): number {
  const answered = new Set<bigint>();
  let stored = 0;
  for (const preview of previews) {
    answered.add(preview.page_id);
    if (preview.missing) {
      // A missing page won't turn up later, so don't ask again.
      recordFailure(tx, preview.page_id, MAX_PREVIEW_ATTEMPTS);
      continue;
    }
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
    tx.db.preview_failure.page_id.delete(preview.page_id);
  }

  requested
    .filter((id) => !answered.has(id))
    .forEach((id) => recordFailure(tx, id));
  return stored;
}

function recordFailure(tx: TxCtx, page_id: bigint, attempts = 1) {
  const failure = tx.db.preview_failure.page_id.find(page_id);
  if (failure) {
    tx.db.preview_failure.page_id.update({
      page_id,
      attempts: Math.min(failure.attempts + attempts, MAX_PREVIEW_ATTEMPTS),
    });
  } else {
    tx.db.preview_failure.insert({ page_id, attempts });
  }
}
