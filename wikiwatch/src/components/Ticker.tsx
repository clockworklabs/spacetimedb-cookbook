import { byteDelta, type ReplayEdit } from "../replay";
import { deltaClass, formatClock, formatDelta, parseComment } from "../format";
import { diffUrl } from "../wikipedia";
import { articleHref } from "../route";
import { EditFlags } from "./EditMeta";

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

        return (
          <li
            key={key}
            className={clock - revealAt < FRESH_MS ? "fresh" : undefined}
          >
            <a
              className={`delta ${deltaClass(bytes)}`}
              href={diffUrl(edit)}
              target="_blank"
              rel="noreferrer"
            >
              {formatDelta(bytes)}
            </a>
            <div className="entry">
              <p className="entry-head">
                <a className="entry-title" href={articleHref(edit.pageId)}>
                  {edit.title}
                </a>
                <time dateTime={new Date(at).toISOString()}>
                  {formatClock(at)}
                </time>
              </p>
              <p className="entry-meta">
                <span className="entry-user">
                  {edit.userName || "Hidden user"}
                </span>
                <EditFlags edit={edit} />
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
