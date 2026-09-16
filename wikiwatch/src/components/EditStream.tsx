import { useMemo, useState } from "react";
import {
  byteDelta,
  editsPerMinute,
  revealedCount,
  WINDOW_MS,
  type ReplayEdit,
} from "../live/derive";
import {
  contributionsUrl,
  deltaClass,
  diffUrl,
  formatClock,
  formatDelta,
  parseComment,
} from "../live/format";
import type { LiveSet } from "../live/hooks";
import { articleHref } from "../route";
import { HideBotsToggle } from "./HideBotsToggle";
import { Masthead } from "./Masthead";
import { PulseRibbon } from "./PulseRibbon";

const STREAM_LENGTH = 100;
const WINDOW_MINUTES = WINDOW_MS / 60_000;

type Props = {
  live: LiveSet;
  isActive: boolean;
  now: number;
  hideBots: boolean;
  onHideBotsChange: (hideBots: boolean) => void;
};

// The latest edits and nothing else, one line each, like `tail -f`. Unlike the
// front page, edits show as soon as they arrive rather than replayed.
export function EditStream({
  live,
  isActive,
  now,
  hideBots,
  onHideBotsChange,
}: Props) {
  const replay = live.replay;
  const edits = useMemo(
    () =>
      hideBots ? replay.all.filter(({ edit }) => !edit.isBot) : replay.all,
    [replay, hideBots],
  );
  // Edits sharing a timestamp second are spread across it, so a few are
  // still due to appear.
  const revealed = revealedCount(edits, now);

  const latest: ReplayEdit[] = [];
  for (let i = revealed - 1; i >= 0 && latest.length < STREAM_LENGTH; i--) {
    latest.push(edits[i]);
  }

  return (
    <>
      <Masthead
        isActive={isActive}
        loaded={live.isLoaded}
        status={live.status}
        now={now}
        delayed={false}
      >
        {live.isLoaded && (
          <PulseRibbon
            counts={editsPerMinute(edits, revealed, now, WINDOW_MINUTES)}
          />
        )}
        <HideBotsToggle hideBots={hideBots} onChange={onHideBotsChange} />
      </Masthead>

      <main className="stream-page">
        <div className="section-head">
          <h2>Every edit</h2>
          <p>the latest {STREAM_LENGTH}, newest first</p>
        </div>
        {!live.isLoaded ? (
          <p className="empty">Loading the latest edits…</p>
        ) : latest.length === 0 ? (
          <p className="empty">
            No edits in the last {WINDOW_MINUTES} minutes yet. They’ll appear
            shortly.
          </p>
        ) : (
          <Stream edits={latest} held={replay.all} />
        )}
      </main>
    </>
  );
}

// Mounted once the live set has loaded, so only edits that arrive after that
// are highlighted.
function Stream({ edits, held }: { edits: ReplayEdit[]; held: ReplayEdit[] }) {
  // Every edit held at mount, bots included, so unhiding bots doesn't
  // highlight edits that were already there.
  const [initial] = useState(() => new Set(held.map(({ key }) => key)));

  return (
    <ol className="stream" reversed>
      {edits.map(({ edit, key, at }) => {
        const bytes = byteDelta(edit);
        const { section, text } = parseComment(edit.comment);
        const flags = [
          edit.isNew && "created the article",
          edit.isBot && "bot",
          edit.isMinor && "minor",
        ].filter(Boolean);

        return (
          <li key={key} className={initial.has(key) ? undefined : "fresh"}>
            <time dateTime={new Date(at).toISOString()}>{formatClock(at)}</time>
            <a
              className={`delta ${deltaClass(bytes)}`}
              href={diffUrl(edit)}
              target="_blank"
              rel="noreferrer"
            >
              {formatDelta(bytes)}
            </a>
            <a className="entry-title" href={articleHref(edit.pageId)}>
              {edit.title}
            </a>
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
              {section && <span className="entry-section">§ {section}</span>}
              {text && <span className="entry-comment">{text}</span>}
            </p>
          </li>
        );
      })}
    </ol>
  );
}
