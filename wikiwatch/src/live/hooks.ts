import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { flushSync } from "react-dom";
import { useSpacetimeDB, useTable } from "spacetimedb/react";
import { tables, type DbConnection } from "../module_bindings";
import type { ArticlePreview, FetchLog } from "../module_bindings/types";
import {
  rankArticles,
  revealedCount,
  scheduleReplay,
  type ReplayEdit,
} from "./derive";
import { applyFetchLog, type FetchToast } from "./fetchActivity";
import { LiveStore } from "./store";

export function useLiveStore(): LiveStore {
  const connection = useSpacetimeDB();
  const [store] = useState(() => new LiveStore());

  useEffect(() => {
    const conn = connection.getConnection() as DbConnection | null;
    if (!connection.isActive || !conn) return;
    return store.attach(conn);
    // Attach when the connection comes up; detach when it goes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection.isActive, store]);

  useSyncExternalStore(store.subscribe, store.getVersion);
  return store;
}

export type Article = {
  // Oldest first.
  edits: ReplayEdit[];
  preview: ArticlePreview | undefined;
  isReady: boolean;
};

// One article's preview and every edit to it the server still holds, which
// reaches much further back than the live store's window.
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

// Toasts describing what the server's Wikipedia fetchers are doing.
export function useFetchActivity(): FetchToast[] {
  const connection = useSpacetimeDB();
  const [toasts, setToasts] = useState<FetchToast[]>([]);

  useEffect(() => {
    const conn = connection.getConnection() as DbConnection | null;
    if (!connection.isActive || !conn) return;

    const onFetch = (_ctx: unknown, row: FetchLog) =>
      setToasts((current) => applyFetchLog(current, row, Date.now()));
    conn.db.fetchLog.onInsert(onFetch);

    // A subscription of its own, so the toasts don't depend on the store.
    let detached = false;
    const handle = conn
      .subscriptionBuilder()
      .onApplied(() => {
        if (detached) handle.unsubscribe();
      })
      .subscribe([tables.fetchLog]);

    return () => {
      detached = true;
      if (handle.isActive()) handle.unsubscribe();
      conn.db.fetchLog.removeOnInsert(onFetch);
    };
    // Attach when the connection comes up; detach when it goes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection.isActive]);

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
  startViewTransition?: (update: () => void) => unknown;
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
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (animate) {
      doc.startViewTransition!(() => flushSync(() => setOrder(next)));
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
