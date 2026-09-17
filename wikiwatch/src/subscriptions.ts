import { useCallback, useMemo, useState } from "react";
import { useTable } from "spacetimedb/react";
import { tables } from "./module_bindings";
import type {
  ArticlePreview,
  FetchEvent,
  FetchStatus,
} from "./module_bindings/types";
import { scheduleReplay, type Replay, type ReplayEdit } from "./replay";
import { applyFetchEvent, type FetchToast } from "./fetchToasts";
import { findArguments, type Argument } from "./arguments";

export type LiveSet = {
  replay: Replay;
  // Keyed by page id.
  previews: ReadonlyMap<string, ArticlePreview>;
  status: FetchStatus | undefined;
  isLoaded: boolean;
};

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
  const [previews, previewsReady] = useTable(
    tables.edit
      .where((edit) => edit.live.eq(true))
      .rightSemijoin(tables.articlePreview, (edit, preview) =>
        edit.pageId.eq(preview.pageId),
      ),
  );
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

// Pages being argued over. The server marks the reverts that belong to one
// (in_argument, see spacetimedb/src/arguments.ts), which is most of a day's
// reverts thrown away before they reach the wire: nearly every revert is a
// one-off, and only a few dozen pages are actually being fought over. Still
// only subscribe while the arguments page is open, since these rows reach much
// further back than the live set.
export function useArguments(): { arguments: Argument[]; isReady: boolean } {
  const [reverts, isReady] = useTable(
    tables.edit.where((row) => row.inArgument.eq(true)),
  );
  const found = useMemo(() => findArguments(reverts), [reverts]);
  return { arguments: found, isReady };
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
