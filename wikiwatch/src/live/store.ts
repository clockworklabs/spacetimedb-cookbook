import { tables, type DbConnection } from "../module_bindings";
import type {
  ArticlePreview,
  Edit,
  PollerStatus,
} from "../module_bindings/types";
import { scheduleReplay, type Replay } from "./derive";

// Row callbacks fire once per row; batch them into one render.
const NOTIFY_DELAY_MS = 50;

// Mirrors the server's live set (its recent edits, and the previews of the
// pages they belong to), and tells React (via useSyncExternalStore) when it
// changes.
export class LiveStore {
  private edits = new Map<string, Edit>();
  private previews = new Map<string, ArticlePreview>();
  private pollerStatus: PollerStatus | undefined;
  private loaded = false;
  private version = 0;
  private listeners = new Set<() => void>();
  private pending: ReturnType<typeof setTimeout> | undefined;
  private replayCache: { version: number; replay: Replay } | undefined;

  readonly subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  readonly getVersion = () => this.version;

  get isLoaded(): boolean {
    return this.loaded;
  }

  get status(): PollerStatus | undefined {
    return this.pollerStatus;
  }

  get replay(): Replay {
    if (this.replayCache?.version !== this.version) {
      this.replayCache = {
        version: this.version,
        replay: scheduleReplay(this.edits.values()),
      };
    }
    return this.replayCache.replay;
  }

  preview(pageKey: string): ArticlePreview | undefined {
    return this.previews.get(pageKey);
  }
  attach(conn: DbConnection): () => void {
    // The client cache also holds the rows article pages subscribe to, live or
    // not, and a row leaving the live set arrives as an update when an article
    // page still wants it. So each row is kept or dropped by its own flag.
    const putEdit = (_ctx: unknown, row: Edit) => {
      if (row.live) this.edits.set(row.rcId.toString(), row);
      else this.edits.delete(row.rcId.toString());
      this.changed();
    };
    const replaceEdit = (ctx: unknown, _old: Edit, row: Edit) =>
      putEdit(ctx, row);
    const dropEdit = (_ctx: unknown, row: Edit) => {
      this.edits.delete(row.rcId.toString());
      this.changed();
    };
    const putPreview = (_ctx: unknown, row: ArticlePreview) => {
      if (row.live) this.previews.set(row.pageId.toString(), row);
      else this.previews.delete(row.pageId.toString());
      this.changed();
    };
    const replacePreview = (
      ctx: unknown,
      _old: ArticlePreview,
      row: ArticlePreview,
    ) => putPreview(ctx, row);
    const dropPreview = (_ctx: unknown, row: ArticlePreview) => {
      this.previews.delete(row.pageId.toString());
      this.changed();
    };
    const putStatus = (_ctx: unknown, row: PollerStatus) => {
      this.pollerStatus = row;
      this.changed();
    };
    const replaceStatus = (
      ctx: unknown,
      _old: PollerStatus,
      row: PollerStatus,
    ) => putStatus(ctx, row);

    conn.db.edit.onInsert(putEdit);
    conn.db.edit.onUpdate(replaceEdit);
    conn.db.edit.onDelete(dropEdit);
    conn.db.articlePreview.onInsert(putPreview);
    conn.db.articlePreview.onUpdate(replacePreview);
    conn.db.articlePreview.onDelete(dropPreview);
    conn.db.pollerStatus.onInsert(putStatus);
    conn.db.pollerStatus.onUpdate(replaceStatus);

    // The server takes rows out of the live set as they age, so this one
    // subscription never needs replacing to keep the cache small.
    let detached = false;
    const handle = conn
      .subscriptionBuilder()
      .onApplied(() => {
        if (detached) {
          handle.unsubscribe();
          return;
        }
        for (const row of conn.db.edit.iter()) putEdit(null, row);
        for (const row of conn.db.articlePreview.iter()) putPreview(null, row);
        for (const row of conn.db.pollerStatus.iter()) putStatus(null, row);
        this.loaded = true;
        this.changed();
      })
      .subscribe([
        tables.edit.where((row) => row.live.eq(true)),
        tables.articlePreview.where((row) => row.live.eq(true)),
        tables.pollerStatus,
      ]);

    return () => {
      detached = true;
      if (handle.isActive()) handle.unsubscribe();
      conn.db.edit.removeOnInsert(putEdit);
      conn.db.edit.removeOnUpdate(replaceEdit);
      conn.db.edit.removeOnDelete(dropEdit);
      conn.db.articlePreview.removeOnInsert(putPreview);
      conn.db.articlePreview.removeOnUpdate(replacePreview);
      conn.db.articlePreview.removeOnDelete(dropPreview);
      conn.db.pollerStatus.removeOnInsert(putStatus);
      conn.db.pollerStatus.removeOnUpdate(replaceStatus);
      this.edits.clear();
      this.previews.clear();
      this.pollerStatus = undefined;
      this.loaded = false;
      this.changed();
    };
  }

  private changed() {
    if (this.pending !== undefined) return;
    this.pending = setTimeout(() => {
      this.pending = undefined;
      this.version++;
      this.listeners.forEach((listener) => listener());
    }, NOTIFY_DELAY_MS);
  }
}
