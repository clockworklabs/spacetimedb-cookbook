import { useCallback, useEffect, useMemo, useState } from "react";
import { flushSync } from "react-dom";
import { useTable } from "spacetimedb/react";
import { tables } from "../module_bindings";
import type {
  ArticlePreview,
  FetchEvent,
  FetchStatus,
} from "../module_bindings/types";
import {
  rankArticles,
  revealedCount,
  scheduleReplay,
  type Replay,
  type ReplayEdit,
} from "./derive";
import { applyFetchEvent, type FetchToast } from "./fetchActivity";

export type LiveSet = {
  replay: Replay;
  // Keyed by page id.
  previews: ReadonlyMap<string, ArticlePreview>;
  status: FetchStatus | undefined;
  isLoaded: boolean;
};

// The previews of pages with live edits. SpacetimeDB keeps the join in step
// with the edits' live flags, so a preview arrives with its page's first live
// edit and leaves with its last.
const livePreviews = tables.edit
  .where((edit) => edit.live.eq(true))
  .rightSemijoin(tables.articlePreview, (edit, preview) =>
    edit.pageId.eq(preview.pageId),
  );

// The server's live set (its recent edits, and the previews of the pages they
// belong to) and the fetchers' status. The server takes edits out of the live
// set as they age, so these subscriptions never need replacing. useTable
// filters the shared client cache by each query, which keeps out the non-live
// edits that article pages subscribe to. It can't filter by a join, so
// `previews` can also hold the preview of an article page, but that's harmless
// when previews are looked up by page id. Every useTable call opens its own
// subscription, so call this once, near the top of the app.
export function useLiveSet(): LiveSet {
  const [edits, editsReady] = useTable(
    tables.edit.where((row) => row.live.eq(true)),
  );
  const [previews, previewsReady] = useTable(livePreviews);
  const [statuses, statusReady] = useTable(tables.fetchStatus);

  const replay = useMemo(() => scheduleReplay(edits), [edits]);
  const previewsByPage = useMemo(
    () =>
      new Map(
        previews.map(
          (preview) => [preview.pageId.toString(), preview] as const,
        ),
      ),
    [previews],
  );

  return {
    replay,
    previews: previewsByPage,
    status: statuses[0],
    isLoaded: editsReady && previewsReady && statusReady,
  };
}

export type Article = {
  // Oldest first.
  edits: ReplayEdit[];
  preview: ArticlePreview | undefined;
  isReady: boolean;
};

// One article's preview and every edit to it the server still holds, which
// reaches much further back than the live set.
export function useArticle(pageId: bigint): Article {
  const [editRows, editsReady] = useTable(
    tables.edit.where((row) => row.pageId.eq(pageId)),
  );
  const [previews, previewReady] = useTable(
    tables.articlePreview.where((row) => row.pageId.eq(pageId)),
  );
  const edits = useMemo(() => scheduleReplay(editRows).all, [editRows]);
  return { edits, preview: previews[0], isReady: editsReady && previewReady };
}

// Toasts describing what the server's Wikipedia fetchers are doing. fetch_event
// is an event table, so its rows never stay in the cache: they only arrive
// through onInsert.
export function useFetchActivity(): FetchToast[] {
  const [toasts, setToasts] = useState<FetchToast[]>([]);
  // Stable, so useTable doesn't re-register its row callbacks every render.
  const onInsert = useCallback(
    (row: FetchEvent) =>
      setToasts((current) => applyFetchEvent(current, row, Date.now())),
    [],
  );
  useTable(tables.fetchEvent, { onInsert });
  return toasts;
}

export function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

type DocumentWithTransitions = Document & {
  startViewTransition?: (update: () => void) => { ready: Promise<void> };
};

// The ranked order of article cards. Re-ranked every `everyMs` (or when the
// edits change) rather than on every tick, so cards don't jostle constantly,
// and animated with a view transition where the browser supports one.
export function useArticleOrder(
  edits: ReplayEdit[],
  clock: number,
  limit: number,
  everyMs: number,
): string[] {
  const [order, setOrder] = useState<string[]>([]);
  const bucket = Math.floor(clock / everyMs);

  useEffect(() => {
    const next = rankArticles(
      edits,
      revealedCount(edits, clock),
      clock,
      limit,
    ).map((rank) => rank.key);
    if (sameOrder(order, next)) return;

    const doc = document as DocumentWithTransitions;
    const animate =
      order.length > 0 &&
      doc.startViewTransition !== undefined &&
      document.visibilityState === "visible" &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (animate) {
      const transition = doc.startViewTransition!(() =>
        flushSync(() => setOrder(next)),
      );
      // A skipped transition (the tab was hidden mid-way, or a newer one
      // superseded it) rejects `ready`, but its update still runs, so only
      // the animation is lost.
      transition.ready.catch(() => {});
    } else {
      setOrder(next);
    }
    // Deliberately keyed on the bucket, not the ever-moving clock.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edits, bucket, limit]);

  return order;
}

function sameOrder(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((key, i) => key === b[i]);
}
