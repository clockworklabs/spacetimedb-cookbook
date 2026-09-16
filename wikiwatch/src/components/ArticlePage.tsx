import { useEffect } from "react";
import {
  byteDelta,
  editsPerMinute,
  REPLAY_DELAY_MS,
  revealedCount,
  WINDOW_MS,
  type ReplayEdit,
} from "../live/derive";
import {
  articleUrl,
  deltaClass,
  formatDelta,
  formatNumber,
  historyUrl,
} from "../live/format";
import { useArticle, type LiveSet } from "../live/hooks";
import { FRONT_PAGE_HREF } from "../route";
import { EditHistory } from "./EditHistory";
import { EditTrail } from "./EditTrail";
import { Masthead } from "./Masthead";
import { PulseRibbon } from "./PulseRibbon";

// How much history the server keeps (RETENTION in the module).
const HISTORY_MS = 24 * 60 * 60_000;
// The history's relative times only need to move every few seconds.
const HISTORY_TICK_MS = 5_000;

type Props = {
  pageId: bigint;
  live: LiveSet;
  isActive: boolean;
  now: number;
};

// One article's preview, and every edit to it the server still holds. Unlike
// the front page, edits show as soon as they arrive rather than replayed.
export function ArticlePage({ pageId, live, isActive, now }: Props) {
  const { edits, preview, isReady } = useArticle(pageId);
  const latest = edits[edits.length - 1]?.edit;
  const title = preview?.title ?? latest?.title;

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    if (!title) return;
    document.title = `${title} · wikiwatch`;
    return () => {
      document.title = "wikiwatch";
    };
  }, [title]);

  return (
    <>
      <Masthead
        isActive={isActive}
        loaded={live.isLoaded}
        status={live.status}
        now={now}
        delayed={false}
      >
        {live.isLoaded && <LivePulse live={live} now={now} />}
      </Masthead>
      <main className="article">
        <p className="back">
          <a href={FRONT_PAGE_HREF}>← Most active</a>
        </p>

        {!isReady ? (
          <p className="empty">Loading this article’s edits…</p>
        ) : !title ? (
          <p className="empty">
            wikiwatch hasn’t seen an edit to this article in the last 24 hours.{" "}
            <a href={articleUrl(pageId)} target="_blank" rel="noreferrer">
              Read it on Wikipedia
            </a>
            .
          </p>
        ) : (
          <div className="article-layout">
            <section className="article-lead" aria-labelledby="article-title">
              <div className="article-heading">
                <h1 id="article-title" className="article-title">
                  {title}
                </h1>
                {preview?.description && (
                  <p className="article-description">{preview.description}</p>
                )}
              </div>
              {edits.length > 0 && (
                <>
                  <ArticleStats edits={edits} />
                  <figure className="article-trail">
                    <EditTrail edits={edits} clock={now} spanMs={HISTORY_MS} />
                    <figcaption aria-hidden="true">
                      <span>24 hours ago</span>
                      <span>12 hours</span>
                      <span>now</span>
                    </figcaption>
                  </figure>
                </>
              )}
              <div className="article-about">
                {preview?.thumbnail && (
                  <img
                    className="article-image"
                    src={preview.thumbnail.url}
                    width={preview.thumbnail.width}
                    height={preview.thumbnail.height}
                    alt=""
                  />
                )}
                <div className="article-text">
                  {preview?.summary && (
                    <p className="article-summary">{preview.summary}</p>
                  )}
                  <p className="article-links">
                    <a
                      href={articleUrl(pageId)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Read on Wikipedia ↗
                    </a>
                    <a
                      href={historyUrl(pageId)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Revision history ↗
                    </a>
                  </p>
                </div>
              </div>
            </section>

            <section
              className="article-history"
              aria-labelledby="history-heading"
            >
              <div className="section-head">
                <h2 id="history-heading">Edit history</h2>
                <p>last 24 hours</p>
              </div>
              {edits.length === 0 ? (
                <p className="empty">No edits in the last 24 hours.</p>
              ) : (
                <EditHistory
                  edits={edits}
                  title={title}
                  now={Math.floor(now / HISTORY_TICK_MS) * HISTORY_TICK_MS}
                />
              )}
            </section>
          </div>
        )}
      </main>
    </>
  );
}

function ArticleStats({ edits }: { edits: ReplayEdit[] }) {
  const latest = edits[edits.length - 1].edit;
  const editors = new Set(edits.map(({ edit }) => edit.userName)).size;
  const bots = edits.filter(({ edit }) => edit.isBot).length;
  const net = edits.reduce((sum, { edit }) => sum + byteDelta(edit), 0);

  return (
    <dl className="stats">
      <div>
        <dt>{edits.length === 1 ? "edit" : "edits"}</dt>
        <dd>{formatNumber(edits.length)}</dd>
      </div>
      <div>
        <dt>{editors === 1 ? "editor" : "editors"}</dt>
        <dd>{formatNumber(editors)}</dd>
      </div>
      <div>
        <dt>by bots</dt>
        <dd>{formatNumber(bots)}</dd>
      </div>
      <div>
        <dt>net change</dt>
        <dd className={deltaClass(net)}>{formatDelta(net)}</dd>
      </div>
      <div>
        <dt>bytes now</dt>
        <dd>{formatNumber(latest.newLen)}</dd>
      </div>
    </dl>
  );
}

// The same edits-per-minute pulse as the front page, bots included.
function LivePulse({ live, now }: { live: LiveSet; now: number }) {
  const clock = now - REPLAY_DELAY_MS;
  const edits = live.replay.all;
  const revealed = revealedCount(edits, clock);
  return (
    <PulseRibbon
      counts={editsPerMinute(edits, revealed, clock, WINDOW_MS / 60_000)}
    />
  );
}
