import type { CSSProperties } from "react";
import type { ArticlePreview } from "../module_bindings/types";
import type { ReplayEdit } from "../replay";
import { ago, formatNumber, plural } from "../format";
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
  const style = { viewTransitionName: `card-${pageKey}` } as CSSProperties;
  const href = articleHref(latest.pageId);

  const heartbeat = clock - newest.revealAt < HEARTBEAT_MS && (
    // Keyed on the edit, so a second edit restarts the animation.
    <span key={newest.key} className="heartbeat" aria-hidden="true" />
  );

  // The long tail of the ranking: one row each.
  if (size === "mini") {
    return (
      <li className="card mini" style={style}>
        {heartbeat}
        <span className="rank" aria-hidden="true">
          {rank}
        </span>
        <a className="mini-title" href={href}>
          {title}
        </a>
        <EditTrail edits={edits} clock={clock} />
        <span className="mini-count" title={plural(edits.length, "edit")}>
          {formatNumber(edits.length)}
        </span>
      </li>
    );
  }

  const editors = new Set(edits.map(({ edit }) => edit.userName)).size;
  const image = preview?.thumbnail && (
    // A second way to the same place as the title, so it's left out of the
    // tab order and hidden from screen readers.
    <a className="card-image-link" href={href} tabIndex={-1} aria-hidden="true">
      <img
        className="card-image"
        src={preview.thumbnail.url}
        width={preview.thumbnail.width}
        height={preview.thumbnail.height}
        alt=""
        loading="lazy"
      />
    </a>
  );
  const rankRow = (
    <div className="card-rank" aria-hidden="true">
      <span className="rank">{rank}</span>
      <div className="heat">
        <span style={{ width: `${Math.max(4, heatShare * 100)}%` }} />
      </div>
    </div>
  );
  const heading = (
    <>
      <h3>
        <a href={href}>{title}</a>
      </h3>
      {preview?.description && (
        <p className="card-description">{preview.description}</p>
      )}
    </>
  );
  const meta = (
    <p className="card-meta">
      <strong>{formatNumber(edits.length)}</strong>{" "}
      {edits.length === 1 ? "edit" : "edits"}
      {size !== "standard" && ` · ${plural(editors, "editor")}`}
      {` · ${ago(now - newest.at)}`}
      {size === "lead" && ` by ${latest.userName || "a hidden user"}`}
    </p>
  );

  if (size === "lead") {
    return (
      <li className="card lead" style={style}>
        {heartbeat}
        {image}
        <div className="card-body">
          {rankRow}
          {heading}
          {preview?.summary && (
            <p className="card-summary">{preview.summary}</p>
          )}
          <figure className="card-trail">
            <EditTrail edits={edits} clock={clock} />
            <figcaption aria-hidden="true">
              <span>30 min ago</span>
              <span>now</span>
            </figcaption>
          </figure>
          {meta}
        </div>
      </li>
    );
  }

  if (size === "medium") {
    return (
      <li className="card medium" style={style}>
        {heartbeat}
        {image}
        <div className="card-body">
          {rankRow}
          {heading}
          <div className="card-foot">
            <EditTrail edits={edits} clock={clock} />
            {meta}
          </div>
        </div>
      </li>
    );
  }

  // Standard cards pin their trails to the bottom, so trails line up across a
  // row. Without an image, the article's opening lines fill the space instead,
  // beneath the title.
  return (
    <li className="card standard" style={style}>
      {heartbeat}
      {rankRow}
      {image}
      {heading}
      {!image && preview?.summary && (
        <p className="card-summary">{preview.summary}</p>
      )}
      <div className="card-foot">
        <EditTrail edits={edits} clock={clock} />
        {meta}
      </div>
    </li>
  );
}
