import { useMemo, useState } from "react";
import {
  byteDelta,
  editsPerMinute,
  REPLAY_DELAY_MS,
  revealedCount,
  WINDOW_MS,
  type ReplayEdit,
} from "../replay";
import { deltaClass, formatClock, formatDelta, parseComment } from "../format";
import { diffUrl } from "../wikipedia";
import { EditFlags, EditUser } from "./EditMeta";
import type { LiveSet } from "../subscriptions";
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

// The latest edits and nothing else, one line each, like `tail -f`. Replayed
// REPLAY_DELAY_MS behind real time, like the front page: the fetcher runs every
// 15 seconds, so without that the lines arrive twenty at a time and then stop.
export function EditStream({
  live,
  isActive,
  now,
  hideBots,
  onHideBotsChange,
}: Props) {
  const clock = now - REPLAY_DELAY_MS;

  const replay = live.replay;
  const edits = useMemo(
    () =>
      hideBots ? replay.all.filter(({ edit }) => !edit.isBot) : replay.all,
    [replay, hideBots],
  );
  const revealed = revealedCount(edits, clock);

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
        delayed
      >
        {live.isLoaded && (
          <PulseRibbon
            counts={editsPerMinute(edits, revealed, clock, WINDOW_MINUTES)}
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
          <Stream
            edits={latest}
            held={replay.all.slice(0, revealedCount(replay.all, clock))}
          />
        )}
      </main>
    </>
  );
}

// Mounted once the live set has loaded, so only edits that appear after that
// are highlighted.
function Stream({ edits, held }: { edits: ReplayEdit[]; held: ReplayEdit[] }) {
  // Every edit already revealed at mount, bots included, so unhiding bots
  // doesn't highlight edits that were already there. Revealed rather than
  // held, or the edits still inside the replay delay would count as already
  // seen and slide in without the highlight.
  const [initial] = useState(() => new Set(held.map(({ key }) => key)));

  return (
    <ol className="stream" reversed>
      {edits.map(({ edit, key, at }) => {
        const bytes = byteDelta(edit);
        const { section, text } = parseComment(edit.comment);

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
              <EditUser edit={edit} />
              <EditFlags edit={edit} />
              {section && <span className="entry-section">§ {section}</span>}
              {text && <span className="entry-comment">{text}</span>}
            </p>
          </li>
        );
      })}
    </ol>
  );
}
