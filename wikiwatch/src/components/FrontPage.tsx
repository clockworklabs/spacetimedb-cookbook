import { useMemo } from "react";
import {
  editsPerMinute,
  heatOf,
  REPLAY_DELAY_MS,
  revealedCount,
  WINDOW_MS,
  type ReplayEdit,
} from "../live/derive";
import { useArticleOrder } from "../live/hooks";
import type { LiveStore } from "../live/store";
import { ArticleCard } from "./ArticleCard";
import { Masthead } from "./Masthead";
import { PulseRibbon } from "./PulseRibbon";
import { Ticker } from "./Ticker";

const RERANK_EVERY_MS = 10_000;
const CARD_COUNT = 21;
const TICKER_LENGTH = 80;
const PULSE_MINUTES = 60;

type Props = {
  store: LiveStore;
  isActive: boolean;
  now: number;
  hideBots: boolean;
  onHideBotsChange: (hideBots: boolean) => void;
};

export function FrontPage({
  store,
  isActive,
  now,
  hideBots,
  onHideBotsChange,
}: Props) {
  const clock = now - REPLAY_DELAY_MS;

  const replay = store.replay;
  const edits = useMemo(
    () =>
      hideBots ? replay.all.filter(({ edit }) => !edit.isBot) : replay.all,
    [replay, hideBots],
  );
  const revealed = revealedCount(edits, clock);
  const order = useArticleOrder(edits, clock, CARD_COUNT, RERANK_EVERY_MS);

  const cards = order
    .map((key) => {
      const pageEdits = (replay.byPage.get(key) ?? []).filter(
        ({ edit, at, revealAt }) =>
          revealAt <= clock &&
          at >= clock - WINDOW_MS &&
          !(hideBots && edit.isBot),
      );
      return { key, edits: pageEdits, heat: heatOf(pageEdits, clock) };
    })
    .filter((card) => card.edits.length > 0);
  const hottest = Math.max(0, ...cards.map((card) => card.heat));

  const latest: ReplayEdit[] = [];
  for (let i = revealed - 1; i >= 0 && latest.length < TICKER_LENGTH; i--) {
    latest.push(edits[i]);
  }

  const emptyMessage = store.isLoaded
    ? "No article edits in the last hour yet. The server checks Wikipedia every 15 seconds, so they’ll start appearing shortly."
    : "Loading the last hour of edits…";

  return (
    <>
      <Masthead
        home
        isActive={isActive}
        loaded={store.isLoaded}
        status={store.status}
        now={now}
        delayed
      >
        {store.isLoaded && (
          <PulseRibbon
            counts={editsPerMinute(edits, revealed, clock, PULSE_MINUTES)}
          />
        )}
        <label className="toggle">
          <input
            type="checkbox"
            checked={hideBots}
            onChange={(event) => onHideBotsChange(event.target.checked)}
          />
          Hide bot edits
        </label>
      </Masthead>

      <main className="layout">
        <section aria-labelledby="articles-heading">
          <div className="section-head">
            <h2 id="articles-heading">Most active articles</h2>
            <p>
              Ranked by edits in the last hour, with recent ones counting most.
              Each trail spans that hour: ticks above the line added text, and
              ticks below removed it.
            </p>
          </div>
          {cards.length === 0 ? (
            <p className="empty">{emptyMessage}</p>
          ) : (
            <ol className="cards">
              {cards.map((card, i) => (
                <ArticleCard
                  key={card.key}
                  pageKey={card.key}
                  edits={card.edits}
                  preview={store.preview(card.key)}
                  featured={i === 0}
                  heatShare={hottest > 0 ? card.heat / hottest : 0}
                  clock={clock}
                  now={now}
                />
              ))}
            </ol>
          )}
        </section>

        <aside className="rail" aria-labelledby="latest-heading">
          <div className="section-head">
            <h2 id="latest-heading">Latest edits</h2>
            <p>Titles open the article’s edits; sizes open the diff</p>
          </div>
          {latest.length === 0 ? (
            <p className="empty">{emptyMessage}</p>
          ) : (
            <Ticker edits={latest} clock={clock} />
          )}
        </aside>
      </main>
    </>
  );
}
