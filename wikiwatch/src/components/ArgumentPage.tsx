import { useEffect } from "react";
import { byteDelta } from "../replay";
import {
  ago,
  deltaClass,
  formatClock,
  formatDelta,
  parseComment,
  plural,
} from "../format";
import { contributionsUrl, diffUrl } from "../wikipedia";
import { useArguments, type LiveSet } from "../subscriptions";
import type { Argument, Revert } from "../arguments";
import { articleHref } from "../route";
import { Masthead } from "./Masthead";

// The relative times only need to move every few seconds.
const TICK_MS = 5_000;

type Props = {
  live: LiveSet;
  isActive: boolean;
  now: number;
};

// Pages where editors keep reverting each other, over the last 24 hours.
export function ArgumentPage({ live, isActive, now }: Props) {
  const { arguments: found, isReady } = useArguments();
  const tick = Math.floor(now / TICK_MS) * TICK_MS;

  useEffect(() => {
    window.scrollTo(0, 0);
    document.title = "Active arguments · wikiwatch";
    return () => {
      document.title = "wikiwatch";
    };
  }, []);

  return (
    <>
      <Masthead
        isActive={isActive}
        loaded={live.isLoaded}
        status={live.status}
        now={now}
        delayed={false}
      />

      <main className="arguments-page">
        <header className="arguments-intro">
          <h1>Active arguments</h1>
          <p>
            Wikipedia pages where two editors keep undoing each other. Every dot
            is a revert, bouncing between whoever made it.
          </p>
        </header>
        {!isReady ? (
          <p className="empty">Loading the last day’s edits…</p>
        ) : found.length === 0 ? (
          <p className="empty">
            Nobody has reverted anybody twice on the same page today. Check back
            later.
          </p>
        ) : (
          <ol className="arguments">
            {found.map((argument) => (
              <ArgumentEntry
                key={argument.pageId.toString()}
                argument={argument}
                now={tick}
              />
            ))}
          </ol>
        )}
      </main>
    </>
  );
}

// Which lane a revert plays in: the two main sides, or the net for everyone
// else.
type Lane = "a" | "b" | "net";

function laneOf(argument: Argument, revert: Revert): Lane {
  const user = revert.edit.userName;
  if (user === argument.sides[0].userName) return "a";
  if (user === argument.sides[1].userName) return "b";
  return "net";
}

function ArgumentEntry({ argument, now }: { argument: Argument; now: number }) {
  const { pageId, title, sides, reverts, lastRevertAt } = argument;
  const last = reverts[reverts.length - 1];
  const lastLane = laneOf(argument, last);
  const [a, b] = sides;

  return (
    <li className="argument">
      <div className="argument-head">
        <h2>
          <a href={articleHref(pageId)}>{title}</a>
        </h2>
        <p className="argument-last">
          {last.edit.userName ? (
            <span className={`side-${lastLane}`}>{last.edit.userName}</span>
          ) : (
            "A hidden user"
          )}{" "}
          had the last word {ago(now - lastRevertAt)}
        </p>
      </div>

      <div className="rally">
        <SideName side={a} lane="a" />
        <Rally argument={argument} />
        <SideName side={b} lane="b" />
      </div>

      <details className="argument-log">
        <summary>
          {plural(reverts.length, "revert")}, with their edit summaries
        </summary>
        <ol className="history">
          {[...reverts].reverse().map((revert) => {
            const { edit, at } = revert;
            const bytes = byteDelta(edit);
            const { text } = parseComment(edit.comment);
            return (
              <li key={edit.rcId.toString()}>
                <time
                  dateTime={new Date(at).toISOString()}
                  title={formatClock(at)}
                >
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
                  <p className="entry-meta">
                    <span
                      className={`entry-user side-${laneOf(argument, revert)}`}
                    >
                      {edit.userName || "Hidden user"}
                    </span>
                    {edit.isBot && <span className="entry-flag">bot</span>}
                  </p>
                  {text && <p className="argument-comment">{text}</p>}
                </div>
              </li>
            );
          })}
        </ol>
      </details>
    </li>
  );
}

function SideName({ side, lane }: { side: Argument["sides"][0]; lane: Lane }) {
  return (
    <p className={`rally-side side-${lane}`}>
      <a
        href={contributionsUrl(side.userName)}
        target="_blank"
        rel="noreferrer"
      >
        {side.userName}
      </a>
      <span>{plural(side.reverts, "revert")}</span>
    </p>
  );
}

// Rally geometry, in SVG user units. Reverts are spaced by turn rather than
// by time: what matters is who answered whom, not how long they took.
const STEP = 48;
const PAD = 14;
const LANE_Y: Record<Lane, number> = { a: 12, net: 40, b: 68 };
const HEIGHT = 80;

// The reverts, in order, as a ball going back and forth across a net.
function Rally({ argument }: { argument: Argument }) {
  const { reverts, sides } = argument;
  const width = PAD * 2 + (reverts.length - 1) * STEP;
  const shots = reverts.map((revert, i) => ({
    revert,
    lane: laneOf(argument, revert),
    x: PAD + i * STEP,
  }));
  const path = shots
    .map(({ x, lane }, i) => `${i === 0 ? "M" : "L"}${x} ${LANE_Y[lane]}`)
    .join(" ");

  return (
    <svg
      className="rally-court"
      viewBox={`0 0 ${width} ${HEIGHT}`}
      style={{ maxWidth: `${width * 1.6}px` }}
      role="img"
      aria-label={`${plural(reverts.length, "revert")}: ${sides
        .map((side) => `${side.userName} ${side.reverts}`)
        .join(", ")}`}
    >
      <line
        className="rally-net"
        x1={0}
        x2={width}
        y1={LANE_Y.net}
        y2={LANE_Y.net}
      />
      <path className="rally-path" d={path} pathLength={1} />
      {shots.map(({ revert, lane, x }, i) => {
        const { edit, at } = revert;
        const isLast = i === shots.length - 1;
        return (
          <g
            key={edit.rcId.toString()}
            className={`rally-shot side-${lane}`}
            style={{ animationDelay: `${(i / shots.length) * 900}ms` }}
          >
            <title>
              {`${edit.userName || "Hidden user"}, ${formatClock(at)}\n${parseComment(edit.comment).text}`}
            </title>
            {isLast && (
              <circle
                className="rally-latest"
                cx={x}
                cy={LANE_Y[lane]}
                r={11}
              />
            )}
            <circle cx={x} cy={LANE_Y[lane]} r={lane === "net" ? 4 : 6.5} />
          </g>
        );
      })}
    </svg>
  );
}
