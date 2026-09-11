import {
  Range,
  SenderError,
  t,
  type InferSchema,
  type ProcedureCtx,
  type ReducerCtx,
} from "spacetimedb/server";
import { ScheduleAt, Timestamp } from "spacetimedb";
import spacetimedb, { poll_timer, prune_timer } from "./schema";
import {
  PREVIEW_BATCH_SIZE,
  fetchPreviews,
  fetchRecentChanges,
  userAgent,
  type PagePreview,
} from "./wikipedia";

export default spacetimedb;

type Schema = InferSchema<typeof spacetimedb>;
type TxCtx = ReducerCtx<Schema>;
type ProcCtx = ProcedureCtx<Schema>;

const SECOND = 1_000_000n;
const MINUTE = 60n * SECOND;
const HOUR = 60n * MINUTE;

const POLL_INTERVAL = 15n * SECOND;
const PRUNE_INTERVAL = HOUR;

// How much history to keep, and how long a preview stays fresh.
const RETENTION = 24n * HOUR;
const PREVIEW_MAX_AGE = 24n * HOUR;

// Recent changes can appear in the API slightly after their timestamp, so
// each poll re-reads this much before the cursor. rc_id dedupes the overlap.
const POLL_OVERLAP = MINUTE;
// After downtime, skip ahead rather than back-filling indefinitely.
const MAX_BACKFILL = HOUR;
// A fresh database fills a client's one-hour window straight away.
const INITIAL_BACKFILL = MAX_BACKFILL;
const MAX_RC_PAGES = 5;

const PREVIEW_BATCHES_PER_TICK = 3;
const MAX_PREVIEW_ATTEMPTS = 3;

const STATUS_ID = 0;
const SETTINGS_ID = 0;
const MAX_ERROR_LENGTH = 500;

export const init = spacetimedb.init((ctx) => {
  ctx.db.poll_timer.insert({
    scheduled_id: 0n,
    scheduled_at: ScheduleAt.interval(POLL_INTERVAL),
  });
  ctx.db.prune_timer.insert({
    scheduled_id: 0n,
    scheduled_at: ScheduleAt.interval(PRUNE_INTERVAL),
  });
  ctx.db.poller_status.insert({
    id: STATUS_ID,
    cursor: minus(ctx.timestamp, INITIAL_BACKFILL),
    last_success_at: undefined,
    last_error: undefined,
    last_error_at: undefined,
    consecutive_failures: 0,
    edits_ingested: 0n,
  });
});

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

export const pruneOldData = spacetimedb.reducer(
  { onSchedule: prune_timer },
  { timer: prune_timer.rowType },
  (ctx) => {
    if (!ctx.sender.equals(ctx.databaseIdentity)) {
      throw new SenderError("pruneOldData may only be run by the scheduler");
    }
    const cutoff = minus(ctx.timestamp, RETENTION);
    const expired = [
      ...ctx.db.edit.edited_at.filter(
        new Range({ tag: "unbounded" }, { tag: "excluded", value: cutoff }),
      ),
    ];
    for (const row of expired) {
      ctx.db.edit.rc_id.delete(row.rc_id);
    }

    const cold = [
      ...ctx.db.article_preview.last_edited_at.filter(
        new Range({ tag: "unbounded" }, { tag: "excluded", value: cutoff }),
      ),
    ];
    for (const preview of cold) {
      ctx.db.article_preview.page_id.delete(preview.page_id);
    }

    console.info(`Pruned ${expired.length} edits and ${cold.length} previews`);
  },
);

function ingestRecentChanges(ctx: ProcCtx, agent: string) {
  const cursor = ctx.withTx(
    (tx) => tx.db.poller_status.id.find(STATUS_ID)?.cursor,
  );
  if (!cursor) {
    console.error("poller_status row is missing; skipping poll");
    return;
  }

  const earliest = minus(ctx.timestamp, MAX_BACKFILL);
  const start = later(minus(cursor, POLL_OVERLAP), earliest);

  let changes;
  try {
    changes = fetchRecentChanges(ctx.http, agent, start, MAX_RC_PAGES);
  } catch (e) {
    const message = `recentchanges: ${errorMessage(e)}`;
    console.error(message);
    ctx.withTx((tx) => recordError(tx, message, true));
    return;
  }

  const inserted = ctx.withTx((tx) => {
    const status = tx.db.poller_status.id.find(STATUS_ID);
    if (!status) return 0;

    let newest = status.cursor;
    let count = 0;
    for (const change of changes) {
      newest = later(newest, change.edited_at);
      if (tx.db.edit.rc_id.find(change.rc_id)) continue;
      tx.db.edit.insert(change);
      touchPreview(tx, change.page_id, change.edited_at);
      enqueuePreview(tx, change.page_id, change.title);
      count++;
    }

    tx.db.poller_status.id.update({
      ...status,
      cursor: newest,
      last_success_at: tx.timestamp,
      consecutive_failures: 0,
      edits_ingested: status.edits_ingested + BigInt(count),
    });
    return count;
  });

  if (inserted > 0) {
    console.info(`Ingested ${inserted} of ${changes.length} recent changes`);
  }
}

function touchPreview(tx: TxCtx, page_id: bigint, edited_at: Timestamp) {
  const preview = tx.db.article_preview.page_id.find(page_id);
  if (preview && compare(edited_at, preview.last_edited_at) > 0) {
    tx.db.article_preview.page_id.update({
      ...preview,
      last_edited_at: edited_at,
    });
  }
}

function latestEdit(tx: TxCtx, page_id: bigint): Timestamp | undefined {
  let latest: Timestamp | undefined;
  for (const edit of tx.db.edit.page_id.filter(page_id)) {
    latest = latest ? later(latest, edit.edited_at) : edit.edited_at;
  }
  return latest;
}

function enqueuePreview(tx: TxCtx, page_id: bigint, title: string) {
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

function ingestPreviews(ctx: ProcCtx, agent: string) {
  const batches = ctx.withTx((tx) => {
    const oldestFirst = [...tx.db.preview_queue.iter()]
      .sort((a, b) => compare(a.enqueued_at, b.enqueued_at))
      .slice(0, PREVIEW_BATCH_SIZE * PREVIEW_BATCHES_PER_TICK)
      .map((entry) => entry.page_id);
    return chunk(oldestFirst, PREVIEW_BATCH_SIZE);
  });

  for (const pageIds of batches) {
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
      });
      return;
    }
    ctx.withTx((tx) => storePreviews(tx, pageIds, previews));
  }
}

function storePreviews(
  tx: TxCtx,
  requested: bigint[],
  previews: PagePreview[],
) {
  const answered = new Set<bigint>();
  for (const preview of previews) {
    answered.add(preview.page_id);
    tx.db.preview_queue.page_id.delete(preview.page_id);
    if (preview.missing) continue;

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

function recordError(tx: TxCtx, message: string, isPollFailure: boolean) {
  const status = tx.db.poller_status.id.find(STATUS_ID);
  if (!status) return;
  tx.db.poller_status.id.update({
    ...status,
    last_error: message.slice(0, MAX_ERROR_LENGTH),
    last_error_at: tx.timestamp,
    consecutive_failures: status.consecutive_failures + (isPollFailure ? 1 : 0),
  });
}

function minus(ts: Timestamp, micros: bigint): Timestamp {
  return new Timestamp(ts.microsSinceUnixEpoch - micros);
}

function compare(a: Timestamp, b: Timestamp): number {
  const d = a.microsSinceUnixEpoch - b.microsSinceUnixEpoch;
  return d < 0n ? -1 : d > 0n ? 1 : 0;
}

function later(a: Timestamp, b: Timestamp): Timestamp {
  return compare(a, b) >= 0 ? a : b;
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
