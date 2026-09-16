import { memo, useState } from "react";
import { byteDelta, type ReplayEdit } from "../replay";
import {
  ago,
  deltaClass,
  displayTags,
  formatClock,
  formatDelta,
  parseComment,
} from "../format";
import { contributionsUrl, diffUrl } from "../wikipedia";

type Props = {
  // Oldest first.
  edits: ReplayEdit[];
  // The article's current title, to point out edits made under an old one.
  title: string;
  now: number;
};

// Everything we know about each edit, newest first. Edits that arrive while
// the page is open are highlighted as they appear.
export const EditHistory = memo(function EditHistory({
  edits,
  title,
  now,
}: Props) {
  const [initial] = useState(() => new Set(edits.map(({ key }) => key)));

  return (
    <ol className="history" reversed>
      {[...edits].reverse().map(({ edit, key, at }) => {
        const bytes = byteDelta(edit);
        const { section, text } = parseComment(edit.comment);
        const flags = [
          edit.isNew && "created the article",
          edit.isBot && "bot",
          edit.isMinor && "minor",
          edit.isTemp && "temporary account",
          edit.isRedirect && "redirect",
        ].filter(Boolean);

        return (
          <li key={key} className={initial.has(key) ? undefined : "fresh"}>
            <time dateTime={new Date(at).toISOString()} title={formatClock(at)}>
              {ago(now - at)}
            </time>
            <a
              className={`delta ${deltaClass(bytes)}`}
              href={diffUrl(edit)}
              target="_blank"
              rel="noreferrer"
            >
              {formatDelta(bytes)}
            </a>
            <div className="entry">
              {(section || text) && (
                <p className="history-comment">
                  {section && <span className="entry-section">{section}</span>}
                  {text && <span>{text}</span>}
                </p>
              )}
              <p className="entry-meta">
                {edit.userName ? (
                  <a
                    className="entry-user"
                    href={contributionsUrl(edit.userName)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {edit.userName}
                  </a>
                ) : (
                  <span className="entry-user">Hidden user</span>
                )}
                {flags.map((flag) => (
                  <span key={String(flag)} className="entry-flag">
                    {flag}
                  </span>
                ))}
                {edit.title !== title && <span>as “{edit.title}”</span>}
                {displayTags(edit.tags).map((tag) => (
                  <span key={tag}>{tag}</span>
                ))}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
});
