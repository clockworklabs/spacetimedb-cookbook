import type { CSSProperties } from "react";
import type { ArticlePreview } from "../module_bindings/types";
import type { ReplayEdit } from "../live/derive";
import { ago, plural } from "../live/format";
import { articleHref } from "../route";
import { EditTrail } from "./EditTrail";

// How prominently a card is shown, from the hottest article down.
export type CardSize = "lead" | "medium" | "standard" | "mini";

// How long a card keeps its heartbeat after the display reaches one of its
// edits. The animation in styles.css takes 500ms; the extra second stops the
// clock's coarse ticks from unmounting it part-way through.
const HEARTBEAT_MS = 1500;

type Props = {
  pageKey: string;
  // 1 for the hottest article.
  rank: number;
  // This page's edits within the window that the display has reached.
  edits: ReplayEdit[];
  preview: ArticlePreview | undefined;
  size: CardSize;
  // This card's heat relative to the hottest card, 0 to 1.
  heatShare: number;
  clock: number;
  now: number;
};

export function ArticleCard({
  pageKey,
  edits,
  rank,
  preview,
  size,
  heatShare,
  clock,
  now,
}: Props) {
  const newest = edits[edits.length - 1];
  const latest = newest.edit;
  const title = preview?.title ?? latest.title;
  const editors = new Set(edits.map(({ edit }) => edit.userName)).size;
  const mini = size === "mini";
  // Without an image, the opening sentences fill the card instead.
  const showSummary =
    !mini &&
    preview?.summary &&
    (size === "lead" || size === "medium" || !preview.thumbnail);
  const style = { viewTransitionName: `card-${pageKey}` } as CSSProperties;
  const href = articleHref(latest.pageId);

  return (
    <li className={`card ${size}`} style={style}>
      {clock - newest.revealAt < HEARTBEAT_MS && (
        // Keyed on the edit, so a second edit restarts the animation.
        <span key={newest.key} className="heartbeat" aria-hidden="true" />
      )}
      <div className="card-rank" aria-hidden="true">
        <span className="rank">{rank}</span>
        <div className="heat">
          <span style={{ width: `${Math.max(4, heatShare * 100)}%` }} />
        </div>
      </div>
      {!mini && preview?.thumbnail && (
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
        {!mini && preview?.description && (
          <p className="card-description">{preview.description}</p>
        )}
        {showSummary && <p className="card-summary">{preview.summary}</p>}
        <EditTrail edits={edits} clock={clock} />
        {mini ? (
          <p className="card-meta">
            {plural(edits.length, "edit")}, {ago(now - newest.at)}
          </p>
        ) : (
          <p className="card-meta">
            <span>
              {plural(edits.length, "edit")} by{" "}
              {plural(editors, "person", "people")}
            </span>
            <span>
              Latest by {latest.userName || "a hidden user"},{" "}
              {ago(now - newest.at)}
            </span>
          </p>
        )}
      </div>
    </li>
  );
}
