import { useMemo, useState } from "react";
import { useSpacetimeDB } from "spacetimedb/react";
import { ArticleCard } from "./components/ArticleCard";
import { PulseRibbon } from "./components/PulseRibbon";
import { StatusLine } from "./components/StatusLine";
import { Ticker } from "./components/Ticker";
import {
  editsPerMinute,
  heatOf,
  REPLAY_DELAY_MS,
  revealedCount,
  WINDOW_MS,
  type ReplayEdit,
} from "./live/derive";
import { useArticleOrder, useLiveStore, useNow } from "./live/hooks";

const TICK_MS = 250;
const RERANK_EVERY_MS = 10_000;
const CARD_COUNT = 21;
const TICKER_LENGTH = 80;
const PULSE_MINUTES = 60;

function App() {
  const store = useLiveStore();
  const { isActive } = useSpacetimeDB();
  const now = useNow(TICK_MS);
  const clock = now - REPLAY_DELAY_MS;
  const [hideBots, setHideBots] = useState(false);

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
    <div className="page">
      <header className="masthead">
        <div className="masthead-title">
          <h1 className="wordmark">wikiwatch</h1>
          <p className="tagline">English Wikipedia, as it’s being edited</p>
          <StatusLine
            isActive={isActive}
            loaded={store.isLoaded}
            status={store.status}
            now={now}
          />
        </div>
        <div className="masthead-controls">
          {store.isLoaded && (
            <PulseRibbon
              counts={editsPerMinute(edits, revealed, clock, PULSE_MINUTES)}
            />
          )}
          <label className="toggle">
            <input
              type="checkbox"
              checked={hideBots}
              onChange={(event) => setHideBots(event.target.checked)}
            />
            Hide bot edits
          </label>
        </div>
      </header>

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
            <p>Each one links to its diff</p>
          </div>
          {latest.length === 0 ? (
            <p className="empty">{emptyMessage}</p>
          ) : (
            <Ticker edits={latest} clock={clock} />
          )}
        </aside>
      </main>

      <footer className="colophon">
        Article summaries and images come from{" "}
        <a href="https://en.wikipedia.org/" target="_blank" rel="noreferrer">
          Wikipedia
        </a>
        . The edits are collected by a SpacetimeDB module every 15 seconds.
      </footer>
    </div>
  );
}

export default App;
