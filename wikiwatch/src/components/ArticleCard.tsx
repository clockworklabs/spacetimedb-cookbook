import type { CSSProperties } from "react";
import type { ArticlePreview } from "../module_bindings/types";
import type { ReplayEdit } from "../live/derive";
import { ago, plural } from "../live/format";
import { articleHref } from "../route";
import { EditTrail } from "./EditTrail";

type Props = {
  pageKey: string;
  // This page's edits within the window that the display has reached.
  edits: ReplayEdit[];
  preview: ArticlePreview | undefined;
  featured: boolean;
  // This card's heat relative to the hottest card, 0 to 1.
  heatShare: number;
  clock: number;
  now: number;
};

export function ArticleCard({
  pageKey,
  edits,
  preview,
  featured,
  heatShare,
  clock,
  now,
}: Props) {
  const latest = edits[edits.length - 1].edit;
  const title = preview?.title ?? latest.title;
  const editors = new Set(edits.map(({ edit }) => edit.userName)).size;
  // Without an image, the opening sentences fill the card instead.
  const showSummary = preview?.summary && (featured || !preview.thumbnail);
  const style = { viewTransitionName: `card-${pageKey}` } as CSSProperties;
  const href = articleHref(latest.pageId);

  return (
    <li className={featured ? "card featured" : "card"} style={style}>
      <div className="heat" aria-hidden="true">
        <span style={{ width: `${Math.max(4, heatShare * 100)}%` }} />
      </div>
      {preview?.thumbnail && (
        // A second way to the same place as the title, so it's left out of
        // the tab order and hidden from screen readers.
        <a
          className="card-image-link"
          href={href}
          tabIndex={-1}
          aria-hidden="true"
        >
          <img
            className="card-image"
            src={preview.thumbnail.url}
            width={preview.thumbnail.width}
            height={preview.thumbnail.height}
            alt=""
            loading="lazy"
          />
        </a>
      )}
      <div className="card-body">
        <h3>
          <a href={href}>{title}</a>
        </h3>
        {preview?.description && (
          <p className="card-description">{preview.description}</p>
        )}
        {showSummary && <p className="card-summary">{preview.summary}</p>}
        <EditTrail edits={edits} clock={clock} />
        <p className="card-meta">
          <span>
            {plural(edits.length, "edit")} by{" "}
            {plural(editors, "person", "people")}
          </span>
          <span>
            Latest by {latest.userName || "a hidden user"},{" "}
            {ago(now - edits[edits.length - 1].at)}
          </span>
        </p>
      </div>
    </li>
  );
}
