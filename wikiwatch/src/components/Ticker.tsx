import { byteDelta, type ReplayEdit } from "../live/derive";
import {
  deltaClass,
  diffUrl,
  formatClock,
  formatDelta,
  parseComment,
} from "../live/format";
import { articleHref } from "../route";

// How long a newly revealed edit stays highlighted.
const FRESH_MS = 2500;

export function Ticker({
  edits,
  clock,
}: {
  edits: ReplayEdit[];
  clock: number;
}) {
  return (
    <ol className="ticker" reversed>
      {edits.map(({ edit, key, at, revealAt }) => {
        const bytes = byteDelta(edit);
        const { section, text } = parseComment(edit.comment);
        const flags = [
          edit.isNew && "created the article",
          edit.isBot && "bot",
          edit.isMinor && "minor",
        ].filter(Boolean);

        return (
          <li
            key={key}
            className={clock - revealAt < FRESH_MS ? "fresh" : undefined}
          >
            <time dateTime={new Date(at).toISOString()}>{formatClock(at)}</time>
            <a
              className={`delta ${deltaClass(bytes)}`}
              href={diffUrl(edit)}
              target="_blank"
              rel="noreferrer"
            >
              {formatDelta(bytes)}
            </a>
            <div className="entry">
              <a className="entry-title" href={articleHref(edit.pageId)}>
                {edit.title}
              </a>
              <p className="entry-meta">
                <span className="entry-user">
                  {edit.userName || "Hidden user"}
                </span>
                {flags.map((flag) => (
                  <span key={String(flag)} className="entry-flag">
                    {flag}
                  </span>
                ))}
                {section && <span className="entry-section">§ {section}</span>}
                {text && <span className="entry-comment">{text}</span>}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
