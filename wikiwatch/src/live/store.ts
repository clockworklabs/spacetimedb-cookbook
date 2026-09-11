import { Timestamp } from "spacetimedb";
import { tables, type DbConnection } from "../module_bindings";
import type {
  ArticlePreview,
  Edit,
  PollerStatus,
} from "../module_bindings/types";
import { scheduleReplay, WINDOW_MS, type Replay } from "./derive";

// The subscription covers a fixed time range, so it's replaced periodically
// to let old rows fall out of the client cache.
const RESUBSCRIBE_EVERY_MS = 10 * 60_000;
// Wider than the display window, so rows stay cached for as long as the
// display might still show them.
const SUBSCRIPTION_SPAN_MS = WINDOW_MS + RESUBSCRIBE_EVERY_MS + 60_000;
// Row callbacks fire once per row; batch them into one render.
const NOTIFY_DELAY_MS = 50;

type Handle = { isActive(): boolean; unsubscribe(): void };

// Mirrors the edits and previews for the recent time window, and tells React
// (via useSyncExternalStore) when they change.
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
    const putEdit = (_ctx: unknown, row: Edit) => {
      this.edits.set(row.rcId.toString(), row);
      this.changed();
    };
    const dropEdit = (_ctx: unknown, row: Edit) => {
      this.edits.delete(row.rcId.toString());
      this.changed();
    };
    const putPreview = (_ctx: unknown, row: ArticlePreview) => {
      this.previews.set(row.pageId.toString(), row);
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
    conn.db.edit.onDelete(dropEdit);
    conn.db.articlePreview.onInsert(putPreview);
    conn.db.articlePreview.onUpdate(replacePreview);
    conn.db.articlePreview.onDelete(dropPreview);
    conn.db.pollerStatus.onInsert(putStatus);
    conn.db.pollerStatus.onUpdate(replaceStatus);

    let current: Handle | undefined;
    const subscribeToWindow = () => {
      const since = Timestamp.fromDate(
        new Date(Date.now() - SUBSCRIPTION_SPAN_MS),
      );
      const previous = current;
      current = conn
        .subscriptionBuilder()
        .onApplied(() => {
          // Unsubscribe only once the new window is in place, so rows the two
          // windows share never leave the cache.
          if (previous?.isActive()) previous.unsubscribe();
          for (const row of conn.db.edit.iter()) putEdit(null, row);
          for (const row of conn.db.articlePreview.iter())
            putPreview(null, row);
          for (const row of conn.db.pollerStatus.iter()) putStatus(null, row);
          this.loaded = true;
          this.changed();
        })
        .subscribe([
          tables.edit.where((row) => row.editedAt.gt(since)),
          tables.articlePreview.where((row) => row.lastEditedAt.gt(since)),
          tables.pollerStatus,
        ]);
    };
    subscribeToWindow();
    const timer = setInterval(subscribeToWindow, RESUBSCRIBE_EVERY_MS);

    return () => {
      clearInterval(timer);
      if (current?.isActive()) current.unsubscribe();
      conn.db.edit.removeOnInsert(putEdit);
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
